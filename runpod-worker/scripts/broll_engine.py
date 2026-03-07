"""
B-Roll Engine Module

Complete B-roll system including:
- GPT scene planning
- Clip matching and scoring
- Montage building with crossfades
- Caption burning on B-roll
- Overlay onto main video
"""

import os
import json
import random
import tempfile
import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Set

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .config import (
    MOVIE_CLIPS_FOLDER, MOVIE_CLIPS_PORTRAIT_FOLDER,
    METADATA_PATH, METADATA_PORTRAIT_PATH,
    SCORE_WEIGHTS, THEME_KEYWORDS, BROLL_SYSTEM_PROMPT
)
from .video_utils import VideoUtils
from .font_manager import FontManager


class BrollEngine:
    """
    B-roll video integration engine.
    
    Plans, selects, builds, and integrates B-roll footage into videos.
    
    Example:
        >>> engine = BrollEngine(api_key="sk-...")
        >>> placements = engine.plan_scenes(transcript, duration=60)
        >>> output = engine.process_broll_segments(
        ...     base_video="main.mp4",
        ...     placements=placements,
        ...     styled_words=styled_words
        ... )
    """
    
    def __init__(self, api_key: Optional[str] = None, 
                 movie_clips_folder: Optional[str] = None,
                 metadata_path: Optional[str] = None,
                 target_width: int = 1920, target_height: int = 1080):
        """
        Initialize B-roll engine.
        
        Args:
            api_key: OpenAI API key
            movie_clips_folder: Path to movie clips folder (auto-detected if None)
            metadata_path: Path to clips metadata JSON (auto-detected if None)
            target_width: Target video width
            target_height: Target video height
        """
        self.api_key = api_key
        self.target_width = target_width
        self.target_height = target_height
        self.font_manager = FontManager()
        
        # Auto-detect portrait vs horizontal based on target dimensions
        is_portrait = target_height > target_width
        
        if movie_clips_folder:
            self.movie_clips_folder = movie_clips_folder
        else:
            self.movie_clips_folder = MOVIE_CLIPS_PORTRAIT_FOLDER if is_portrait else MOVIE_CLIPS_FOLDER
            
        if metadata_path:
            self.metadata_path = metadata_path
        else:
            self.metadata_path = METADATA_PORTRAIT_PATH if is_portrait else METADATA_PATH
        
        print(f"[BrollEngine] Using {'portrait' if is_portrait else 'horizontal'} clips: {self.movie_clips_folder}")
        print(f"[BrollEngine] Metadata: {self.metadata_path}")
        
        # Try to import OpenAI
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=api_key) if api_key else None
        except ImportError:
            self.client = None
    
    def load_clips_metadata(self) -> List[Dict]:
        """
        Load movie clips metadata from JSON.
        
        Returns:
            List of clip metadata dictionaries
        """
        meta_path = Path(self.metadata_path)
        if not meta_path.exists():
            raise FileNotFoundError(f"Metadata not found: {self.metadata_path}")
        
        with open(meta_path, encoding="utf-8") as f:
            return json.load(f)
    
    def plan_scenes(self, transcript: str, video_duration: float,
                   model: str = "gpt-4o") -> List[Dict]:
        """
        Use GPT to plan B-roll placements throughout video.
        
        Args:
            transcript: Video transcript text
            video_duration: Video duration in seconds
            model: GPT model to use
            
        Returns:
            List of placement dictionaries with timing and metadata
        """
        if not self.client:
            raise ValueError("OpenAI client not available. Check API key.")
        
        response = self.client.chat.completions.create(
            model=model,
            temperature=0.3,
            max_tokens=800,
            messages=[
                {"role": "system", "content": BROLL_SYSTEM_PROMPT},
                {"role": "user", "content": f"Transcript:\n\n{transcript}\n\nVideo duration: {video_duration} seconds"}
            ]
        )
        
        raw = (response.choices[0].message.content or "").strip()
        
        # Remove markdown code blocks if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(l for l in lines if not l.strip().startswith("```"))
        
        plan = json.loads(raw.strip())
        placements = plan.get("placements", [])
        
        # Validate and clamp placements
        valid_placements = []
        for p in placements:
            ts = float(p.get("timestamp_seconds", 0))
            duration = p.get("duration", 2)
            
            # Clamp to safe range (not first/last 3 seconds)
            ts = max(3.0, min(ts, video_duration - duration - 3.0))
            p["timestamp_seconds"] = ts
            valid_placements.append(p)
        
        # Sort by timestamp
        valid_placements.sort(key=lambda x: x["timestamp_seconds"])
        
        return valid_placements
    
    def score_clip(self, clip: Dict, request: Dict, theme: str = "") -> int:
        """
        Score how well a clip matches scene request.
        
        Args:
            clip: Clip metadata
            request: Scene requirements
            theme: Theme keyword
            
        Returns:
            Match score (higher is better)
        """
        score = 0
        
        # Standard field matching
        for field, weight in SCORE_WEIGHTS.items():
            if field == "keywords":
                continue
            if clip.get(field) == request.get(field):
                score += weight
        
        # Keyword matching based on theme
        if theme:
            theme_lower = theme.lower()
            visual_keywords = clip.get("visual_keywords", [])
            
            for keyword in visual_keywords:
                keyword_lower = keyword.lower()
                
                # Direct theme match
                if any(theme_word in keyword_lower for theme_word in theme_lower.split()):
                    score += SCORE_WEIGHTS["keywords"]
                
                # Check against known theme mappings
                for theme_category, related_words in THEME_KEYWORDS.items():
                    if any(word in theme_lower for word in related_words):
                        if any(word in keyword_lower for word in related_words):
                            score += SCORE_WEIGHTS["keywords"] * 0.5
        
        # Bonus for person presence in emotional moments
        if request.get("emotion") in ("tense", "energetic", "sad"):
            if clip.get("subject_presence") == "person":
                score += 2
        
        return score
    
    def select_clips(self, scene_request: Dict, num_clips: int = 2,
                    used_ids: Optional[Set[str]] = None) -> Tuple[List[str], Set[str]]:
        """
        Select best matching clips for a scene.
        
        Args:
            scene_request: Dict with emotion, energy, lighting, etc.
            num_clips: Number of clips to select
            used_ids: Already used clip IDs to avoid repetition
            
        Returns:
            Tuple of (clip_paths, updated_used_ids)
        """
        clips = self.load_clips_metadata()
        theme = scene_request.get("theme", "")
        
        # Score all clips
        scored = sorted(clips, key=lambda c: self.score_clip(c, scene_request, theme), reverse=True)
        
        selected = []
        if used_ids is None:
            used_ids = set()
        
        for clip in scored:
            if len(selected) >= num_clips:
                break
            if clip["clip_id"] not in used_ids:
                # Build absolute path from movie_clips_folder
                clip_path = clip["path"]
                if not os.path.isabs(clip_path):
                    clip_path = os.path.join(self.movie_clips_folder, os.path.basename(clip_path))
                # Skip if file doesn't exist
                if not os.path.exists(clip_path):
                    continue
                selected.append(clip_path)
                used_ids.add(clip["clip_id"])
        
        return selected, used_ids
    
    def get_clip_options(self, scene_request: Dict, num_options: int = 4,
                         used_ids: Optional[Set[str]] = None) -> List[Dict]:
        """
        Get top clip options with metadata for user selection (EditClip UI).
        
        Args:
            scene_request: Dict with emotion, energy, lighting, theme, etc.
            num_options: Number of clip options to return
            used_ids: Already used clip IDs to avoid repetition
            
        Returns:
            List of clip option dicts with clip_id, path, metadata
        """
        clips = self.load_clips_metadata()
        theme = scene_request.get("theme", "")
        
        scored = sorted(clips, key=lambda c: self.score_clip(c, scene_request, theme), reverse=True)
        
        options = []
        if used_ids is None:
            used_ids = set()
        
        for clip in scored:
            if len(options) >= num_options:
                break
            if clip["clip_id"] not in used_ids:
                clip_path = clip["path"]
                if not os.path.isabs(clip_path):
                    clip_path = os.path.join(self.movie_clips_folder, os.path.basename(clip_path))
                
                if not os.path.exists(clip_path):
                    continue
                
                option = {
                    "clip_id": clip["clip_id"],
                    "path": clip_path,
                    "filename": os.path.basename(clip_path),
                    "description": clip.get("description", ""),
                    "emotion": clip.get("emotion", "neutral"),
                    "energy": clip.get("energy", "medium"),
                    "lighting": clip.get("lighting", "neutral"),
                    "camera": clip.get("camera", "mid"),
                    "setting": clip.get("setting", "neutral"),
                    "visual_keywords": clip.get("visual_keywords", []),
                    "subject_presence": clip.get("subject_presence", ""),
                    "score": self.score_clip(clip, scene_request, theme),
                }
                options.append(option)
                used_ids.add(clip["clip_id"])
        
        return options
    
    def generate_thumbnail(self, clip_path: str, output_path: str, time_offset: float = 0.5) -> bool:
        """
        Generate a thumbnail image from a clip.
        
        Args:
            clip_path: Path to video clip
            output_path: Where to save thumbnail
            time_offset: Time in seconds to extract frame (default: 0.5)
            
        Returns:
            True if successful
        """
        try:
            cap = cv2.VideoCapture(clip_path)
            if not cap.isOpened():
                return False
            
            duration = VideoUtils.get_duration(clip_path)
            target_time = min(time_offset, duration * 0.3) if duration > 0 else 0.5
            
            cap.set(cv2.CAP_PROP_POS_MSEC, target_time * 1000)
            ret, frame = cap.read()
            cap.release()
            
            if not ret or frame is None:
                return False
            
            height, width = frame.shape[:2]
            target_width = 320
            target_height = int(height * (target_width / width))
            if target_height > 180:
                target_height = 180
                target_width = int(width * (target_height / height))
            
            frame = cv2.resize(frame, (target_width, target_height))
            cv2.imwrite(output_path, frame)
            return True
            
        except Exception as e:
            print(f"[Thumbnail] Error generating thumbnail: {e}")
            return False
    
    def trim_clip(self, input_path: str, duration: float,
                 temp_folder: str) -> str:
        """
        Trim clip to specified duration with COVER scaling (no black bars).
        
        Scales B-roll to completely fill target resolution by:
        1. Calculating scale factor to fill frame (cover mode)
        2. Scaling up to fill
        3. Center cropping to exact target dimensions
        
        Args:
            input_path: Clip path
            duration: Target duration in seconds
            temp_folder: Temp folder for output
            
        Returns:
            Path to trimmed clip (exactly target_width x target_height, no black bars)
        """
        clip_dur = VideoUtils.get_duration(input_path)
        start = 0.0
        
        if clip_dur > duration:
            start = random.uniform(0.0, max(0.0, clip_dur - duration))
        
        out_path = Path(temp_folder) / f"trimmed_{random.randint(1000, 9999)}.mp4"
        
        tw, th = self.target_width, self.target_height
        
        # COVER MODE: Scale to fill frame completely, then center crop
        # No black bars, no letterboxing - fills entire frame
        # 
        # Logic: scale so that min dimension fills target, then crop excess
        # scale=w:h:force_original_aspect_ratio=increase - scale up to fill
        # crop=tw:th - crop to exact target dimensions (centered)
        scale_filter = (
            f"scale={tw}:{th}:force_original_aspect_ratio=increase,"
            f"crop={tw}:{th},"
            f"setsar=1,"
            f"fps=30"
        )
        
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-i", str(input_path),
            "-t", str(duration),
            "-vf", scale_filter,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-an",
            str(out_path),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise RuntimeError(f"trim_clip failed: {result.stderr}")
        
        return str(out_path)
    
    def build_montage(self, clip_paths: List[str], duration: float,
                     temp_folder: str, crossfade: float = 0.5) -> str:
        """
        Build B-roll montage with crossfade transitions.
        
        Ensures output is exactly target_width x target_height (no black bars).
        
        Args:
            clip_paths: List of clip paths
            duration: Total duration
            temp_folder: Temp folder
            crossfade: Crossfade duration in seconds
            
        Returns:
            Path to montage video (exactly target_width x target_height)
        """
        tw, th = self.target_width, self.target_height
        
        if not clip_paths:
            raise ValueError("No clips provided")
        
        # Single clip - just trim
        if len(clip_paths) == 1:
            return self.trim_clip(clip_paths[0], duration, temp_folder)
        
        # Multiple clips - build with crossfade
        num_clips = len(clip_paths)
        individual_duration = (duration + (crossfade * (num_clips - 1))) / num_clips
        
        # Trim each clip (already scaled to target resolution)
        trimmed = []
        for i, clip_path in enumerate(clip_paths):
            trim_dur = individual_duration + (crossfade if i > 0 else 0) + (crossfade if i < num_clips - 1 else 0)
            trim_dur = min(trim_dur, VideoUtils.get_duration(clip_path))
            trimmed.append(self.trim_clip(clip_path, trim_dur, temp_folder))
        
        # Build crossfade for 2 clips with explicit output resolution
        if len(trimmed) == 2:
            final_path = Path(temp_folder) / f"broll_{random.randint(1000, 9999)}.mp4"
            
            # Include scale to ensure exact output resolution
            fade_filter = (
                f"[0:v]format=pix_fmts=yuv420p,scale={tw}:{th}[fg];"
                f"[1:v]format=pix_fmts=yuv420p,scale={tw}:{th}[bg];"
                f"[fg][bg]xfade=transition=fade:duration={crossfade}:offset={individual_duration - crossfade}[v];"
                f"[v]scale={tw}:{th}:force_original_aspect_ratio=disable[final]"
            )
            
            cmd = [
                "ffmpeg", "-y",
                "-i", trimmed[0],
                "-i", trimmed[1],
                "-filter_complex", fade_filter,
                "-map", "[final]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-t", str(duration),
                "-an",
                str(final_path),
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            # Cleanup
            for p in trimmed:
                Path(p).unlink(missing_ok=True)
            
            if result.returncode == 0:
                return str(final_path)
            else:
                return self.trim_clip(clip_paths[0], duration, temp_folder)
        
        # For more clips, use concat with scale filter
        concat_path = Path(temp_folder) / f"concat_{random.randint(1000, 9999)}.txt"
        with open(concat_path, "w") as f:
            for p in trimmed:
                f.write(f"file '{p}'\n")
        
        final_path = Path(temp_folder) / f"broll_{random.randint(1000, 9999)}.mp4"
        
        # Add scale filter to ensure exact target resolution
        vf_filter = f"fade=st=0:d=0.3:alpha=1,scale={tw}:{th}:force_original_aspect_ratio=disable,format=yuv420p"
        
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_path),
            "-vf", vf_filter,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-t", str(duration),
            "-an",
            str(final_path),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Cleanup
        for p in trimmed:
            Path(p).unlink(missing_ok=True)
        concat_path.unlink(missing_ok=True)
        
        if result.returncode == 0:
            return str(final_path)
        else:
            return self.trim_clip(clip_paths[0], duration, temp_folder)
    
    def burn_captions(self, broll_path: str, styled_words: List[Dict],
                     timestamp_start: float, timestamp_end: float,
                     output_path: str, font_size: int = 100,
                     transparency: float = 0.85) -> str:
        """
        Burn captions onto B-roll video using SAME baseline alignment as main video.
        
        Uses:
        - Same font paths (Coolvetica/Runethia)
        - Same diagonal-based font scaling
        - Same baseline alignment (font.getmetrics())
        - Same Y positioning (0.82 landscape, 0.75 vertical)
        """
        from PIL import ImageFont
        
        # Font paths - MUST match caption_renderer.py
        COOLVETICA = r'C:\Users\Lenovo\OneDrive\Documents\segmen\segmentation\Coolvetica Rg.otf'
        RUNETHIA = r'C:\Users\Lenovo\OneDrive\Documents\segmen\segmentation\Runethia.otf'
        
        duration = timestamp_end - timestamp_start
        fps = 30
        total_frames = int(duration * fps)
        
        # Find words in this time range
        broll_words = [
            w for w in styled_words
            if timestamp_start <= w['start'] < timestamp_end
        ]
        
        if not broll_words:
            import shutil
            shutil.copy(broll_path, output_path)
            return output_path
        
        # Open video
        cap = cv2.VideoCapture(broll_path)
        if not cap.isOpened():
            import shutil
            shutil.copy(broll_path, output_path)
            return output_path
        
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Setup writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        # === DYNAMIC FONT SIZING FOR ALL ASPECT RATIOS ===
        aspect_ratio = width / height if height > 0 else 1.0
        base_font_size = height * 0.04
        
        if aspect_ratio < 0.6:  # 9:16
            base_font_size = int(base_font_size * 0.9)
            base_font_size = max(18, min(base_font_size, 32))
            left_margin_pct = 0.06
        elif aspect_ratio < 0.8:  # 2:3, 3:4
            base_font_size = int(base_font_size * 0.95)
            base_font_size = max(20, min(base_font_size, 35))
            left_margin_pct = 0.07
        elif aspect_ratio < 0.9:  # 4:5
            base_font_size = int(base_font_size * 1.0)
            base_font_size = max(22, min(base_font_size, 38))
            left_margin_pct = 0.08
        elif aspect_ratio < 1.1:  # 1:1
            base_font_size = int(base_font_size * 1.1)
            base_font_size = max(25, min(base_font_size, 45))
            left_margin_pct = 0.09
        elif aspect_ratio < 1.4:  # 5:4, 4:3
            base_font_size = int(base_font_size * 1.15)
            base_font_size = max(28, min(base_font_size, 50))
            left_margin_pct = 0.10
        elif aspect_ratio < 1.8:  # 16:9
            base_font_size = int(base_font_size * 1.2)
            base_font_size = max(32, min(base_font_size, 55))
            left_margin_pct = 0.11
        else:  # 21:9
            base_font_size = int(base_font_size * 1.25)
            base_font_size = max(35, min(base_font_size, 60))
            left_margin_pct = 0.12
        
        print(f"[B-roll] {width}x{height} ({aspect_ratio:.2f}) | Font: {base_font_size}px | Margin: {int(left_margin_pct*100)}%")
        
        # === Y POSITION - Same as caption_renderer.py ===
        is_vertical = aspect_ratio < 0.8
        if is_vertical:
            y_percent = 0.75
        elif 0.9 <= aspect_ratio <= 1.1:  # Square
            y_percent = 0.80
        else:  # Landscape
            y_percent = 0.82
        
        # Safety: never closer than 8% from bottom
        y_percent = min(y_percent, 0.92)
        BASELINE_Y = int(height * y_percent)
        
        # Side margins - use aspect-ratio aware margin
        side_margin = int(width * left_margin_pct)
        available_width = width - (2 * side_margin)
        spacing = int(base_font_size * 0.25)
        
        def get_font_for_word(style, size):
            """Get font - same logic as caption_renderer.py"""
            if style in ('hook', 'emphasis', 'emotional'):
                try:
                    return ImageFont.truetype(RUNETHIA, size)
                except:
                    return self.font_manager.get_font('cursive', size)
            else:
                try:
                    return ImageFont.truetype(COOLVETICA, size)
                except:
                    return self.font_manager.get_font('bold', size)
        
        frame_idx = 0
        while frame_idx < total_frames:
            ret, frame = cap.read()
            if not ret:
                break
            
            current_time = timestamp_start + (frame_idx / fps)
            
            # Find active words for this caption
            active_words = [w for w in broll_words if w['start'] <= current_time < w['end']]
            
            if active_words:
                # Convert to PIL
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame_pil = Image.fromarray(frame_rgb).convert('RGBA')
                draw = ImageDraw.Draw(frame_pil)
                
                # === STEP 1: Calculate word metrics with baseline alignment ===
                word_metrics = []
                total_width = 0
                max_ascent = 0
                
                for word_data in active_words:
                    word = word_data.get('word', '')
                    style = word_data.get('style', 'regular')
                    size_mult = word_data.get('size_mult', 1.0)
                    
                    adjusted_size = int(base_font_size * size_mult)
                    font = get_font_for_word(style, adjusted_size)
                    
                    # Get font metrics for baseline alignment
                    ascent, descent = font.getmetrics()
                    
                    # Get word width
                    bbox = draw.textbbox((0, 0), word, font=font)
                    word_width = bbox[2] - bbox[0]
                    
                    word_metrics.append({
                        'word': word,
                        'font': font,
                        'ascent': ascent,
                        'width': word_width,
                        'style': style,
                    })
                    
                    max_ascent = max(max_ascent, ascent)
                    total_width += word_width + spacing
                
                if word_metrics:
                    total_width -= spacing
                
                # === STEP 2: Center X calculation ===
                start_x = side_margin + (available_width - total_width) // 2
                start_x = max(side_margin, start_x)
                
                # === STEP 3: Draw all words on SAME BASELINE ===
                current_x = start_x
                text_alpha = int(255 * transparency)
                
                for metrics in word_metrics:
                    word = metrics['word']
                    font = metrics['font']
                    ascent = metrics['ascent']
                    style = metrics['style']
                    
                    # Calculate Y so baseline aligns at BASELINE_Y
                    text_y = BASELINE_Y - ascent
                    
                    # Determine color - same as main video
                    if style == 'hook':
                        text_color = (255, 255, 255, text_alpha)
                    elif style == 'emphasis':
                        text_color = (255, 255, 255, text_alpha)
                    else:
                        text_color = (255, 255, 255, text_alpha)
                    
                    # Draw the word - NO shadow for consistency with main video
                    draw.text((int(current_x), int(text_y)), word, 
                             font=font, fill=text_color)
                    
                    current_x += metrics['width'] + spacing
                
                # Convert back to OpenCV format
                frame = cv2.cvtColor(np.array(frame_pil.convert('RGB')), cv2.COLOR_RGB2BGR)
            
            out.write(frame)
            frame_idx += 1
        
        cap.release()
        out.release()
        
        return output_path
    
    def overlay_onto_video(self, base_video: str, broll_with_captions: str,
                          timestamp_sec: float, duration: float,
                          output_path: str) -> str:
        """
        Overlay B-roll segment onto base video.
        
        Args:
            base_video: Base video path
            broll_with_captions: B-roll with captions path
            timestamp_sec: Timestamp to insert at
            duration: Duration of B-roll
            output_path: Output path
            
        Returns:
            Path to output video
        """
        base_dur = VideoUtils.get_duration(base_video)
        bw, bh = VideoUtils.get_dimensions(base_video)
        
        before_end = timestamp_sec
        overlay_start = timestamp_sec
        overlay_end = min(timestamp_sec + duration, base_dur)
        after_start = overlay_end
        
        # Build filter complex
        filter_complex = (
            f"[0:v]split=3[base_before][base_overlay][base_after];"
            f"[base_before]trim=start=0:end={before_end},setpts=PTS-STARTPTS[v_before];"
            f"[base_overlay]trim=start={overlay_start}:end={overlay_end},setpts=PTS-STARTPTS[base_mid];"
            f"[base_after]trim=start={after_start}:end={base_dur},setpts=PTS-STARTPTS[v_after];"
            f"[1:v]scale={bw}:{bh}:force_original_aspect_ratio=increase,crop={bw}:{bh},setsar=1[v_broll];"
            f"[base_mid][v_broll]overlay=0:0:format=auto[v_mid];"
            f"[v_before][v_mid][v_after]concat=n=3:v=1:a=0[vout]"
        )
        
        cmd = [
            "ffmpeg", "-y",
            "-i", base_video,
            "-i", broll_with_captions,
            "-filter_complex", filter_complex,
            "-map", "[vout]",
            "-map", "0:a?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise RuntimeError(f"B-roll overlay failed: {result.stderr}")
        
        return output_path
    
    def process_broll_segments(self, base_video: str, placements: List[Dict],
                              styled_words: List[Dict],
                              temp_folder: Optional[str] = None,
                              font_size: int = 100,
                              transparency: float = 0.85) -> str:
        """
        Process all B-roll segments: build, caption, overlay.
        
        Args:
            base_video: Base video path
            placements: List of placement dicts
            styled_words: Styled words for captions
            temp_folder: Temp folder (created if None)
            font_size: Font size
            transparency: Text transparency
            
        Returns:
            Path to final video with B-roll
        """
        if not placements:
            return base_video
        
        if temp_folder is None:
            temp_folder = tempfile.mkdtemp(prefix="broll_")
        
        # Track used clips globally
        globally_used_ids: Set[str] = set()
        current_video = base_video
        
        for i, placement in enumerate(placements):
            print(f"  Processing B-roll {i+1}/{len(placements)}...")
            
            ts = float(placement.get("timestamp_seconds", 0))
            duration = placement.get("duration", 2)
            
            # Build scene request
            scene_request = {
                "emotion": placement.get("emotion", "neutral"),
                "energy": placement.get("energy", "medium"),
                "lighting": placement.get("lighting", "neutral"),
                "camera": placement.get("camera", "mid"),
                "setting": placement.get("setting", "neutral"),
                "theme": placement.get("theme", ""),
            }
            
            # Select clips
            clip_paths, globally_used_ids = self.select_clips(
                scene_request, num_clips=2, used_ids=globally_used_ids
            )
            
            # Build montage
            montage_path = self.build_montage(clip_paths, int(duration), temp_folder)
            
            # Burn captions
            captioned_broll = Path(temp_folder) / f"broll_captioned_{i}.mp4"
            self.burn_captions(
                montage_path, styled_words, ts, ts + duration,
                str(captioned_broll), font_size, transparency
            )
            
            # Cleanup montage
            Path(montage_path).unlink(missing_ok=True)
            
            # Overlay onto video
            is_last = (i == len(placements) - 1)
            next_output = Path(temp_folder) / ("final_with_broll.mp4" if is_last else f"overlay_step_{i}.mp4")
            
            self.overlay_onto_video(
                current_video, str(captioned_broll),
                ts, duration, str(next_output)
            )
            
            # Cleanup previous temp files
            if i > 0 and current_video != base_video:
                Path(current_video).unlink(missing_ok=True)
            Path(captioned_broll).unlink(missing_ok=True)
            
            current_video = str(next_output)
        
        return current_video
