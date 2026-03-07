"""
Pipeline Module

Complete video processing pipeline that orchestrates all components:
1. Audio extraction & Whisper transcription
2. GPT-based caption styling
3. Mask generation (if needed)
4. Caption rendering
5. B-roll insertion (optional)
6. Intro effects (optional)
7. Instagram export (optional)

Can be used as a simple one-line function or step-by-step.
"""

import os
import sys
import tempfile
import shutil
import subprocess
import hashlib
import json
from pathlib import Path
from typing import Optional, List, Dict, Callable, Tuple

import cv2
import numpy as np

from .config import DEFAULT_CONFIG, WORD_CORRECTIONS
from .video_utils import VideoUtils, is_video_file, SUPPORTED_VIDEO_FORMATS, convert_aspect_ratio, HardwareVideoWriter
from .mask_utils import MaskInterpolator
from .font_manager import FontManager
from .caption_formatter import CaptionFormatter
from .caption_renderer import CaptionRenderer
from .broll_engine import BrollEngine
from .watermark import WatermarkRenderer, apply_watermark_to_video

# Noise isolation (optional)
try:
    from .noise_isolator import NoiseIsolator
    NOISE_ISOLATION_AVAILABLE = True
except ImportError:
    NOISE_ISOLATION_AVAILABLE = False

# Debug tracer
try:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from debug_tracer import tracer
except ImportError:
    tracer = None


class Pipeline:
    """
    Complete video processing pipeline.
    
    Orchestrates the full workflow from input video to final output.
    
    Example:
        >>> pipeline = Pipeline(api_key="sk-...")
        >>> pipeline.process(
        ...     input_video="input.mp4",
        ...     output_video="output.mp4",
        ...     use_whisper=True,
        ...     enable_broll=True
        ... )
    """
    
    def __init__(self, api_key: Optional[str] = None, 
                 config: Optional[Dict] = None,
                 progress_callback: Optional[Callable[[str, float], None]] = None):
        """
        Initialize pipeline.
        
        Args:
            api_key: OpenAI API key
            config: Configuration override dict
            progress_callback: Function(step_name, progress_pct) for progress updates
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "")
        self.config = {**DEFAULT_CONFIG, **(config or {})}
        self.progress_callback = progress_callback
        
        # Initialize components
        self.font_manager = FontManager()
        self.caption_formatter = CaptionFormatter()
        self.video_utils = VideoUtils()
        
        # Check OpenAI availability
        try:
            from openai import OpenAI
            self.openai_client = OpenAI(api_key=self.api_key) if self.api_key else None
            self.openai_available = True
        except ImportError:
            self.openai_client = None
            self.openai_available = False
        
        # Check MediaPipe availability
        try:
            import mediapipe as mp
            self.mediapipe_available = True
        except ImportError:
            self.mediapipe_available = False
    
    def _update_progress(self, step: str, progress: float):
        """Update progress if callback is set."""
        if self.progress_callback:
            self.progress_callback(step, progress)
        print(f"[{step}] {progress:.1f}%")
    
    def _check_cancelled(self) -> bool:
        """Check if processing should be cancelled."""
        if hasattr(self, 'cancel_check') and self.cancel_check:
            return self.cancel_check()
        return False
    
    def _get_cache_dir(self) -> Path:
        """Get or create GPT cache directory."""
        cache_dir = Path(self.config.get('gpt_cache_dir', 'gpt_cache'))
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir
    
    def _get_transcript_hash(self, words: List[Dict]) -> str:
        """Generate hash for transcript to use as cache key."""
        # Create a string from all words
        transcript = " ".join([w["word"] for w in words])
        # Add config that affects GPT processing
        config_str = f"{self.config.get('correction_confidence_threshold', 'medium')}"
        # Hash it
        hasher = hashlib.md5()
        hasher.update(transcript.encode())
        hasher.update(config_str.encode())
        return hasher.hexdigest()[:16]
    
    def _get_cached_gpt_result(self, words: List[Dict]) -> Optional[Tuple[Dict, List]]:
        """
        Check if GPT result is cached for this transcript.
        
        Returns:
            Tuple of (corrections_dict, hook_spans_list) or None if not cached
        """
        if not self.config.get('cache_gpt_results', True):
            return None
        
        cache_key = self._get_transcript_hash(words)
        cache_file = self._get_cache_dir() / f"{cache_key}.json"
        
        if cache_file.exists():
            try:
                with open(cache_file, 'r') as f:
                    cached = json.load(f)
                print(f"[GPT Cache] Using cached result: {cache_key}")
                return cached.get('corrections', {}), cached.get('hook_spans', [])
            except Exception as e:
                print(f"[GPT Cache] Failed to load cache: {e}")
                return None
        return None
    
    def _cache_gpt_result(self, words: List[Dict], corrections: Dict, hook_spans: List):
        """Cache GPT result for future use."""
        if not self.config.get('cache_gpt_results', True):
            return
        
        cache_key = self._get_transcript_hash(words)
        cache_file = self._get_cache_dir() / f"{cache_key}.json"
        
        try:
            with open(cache_file, 'w') as f:
                json.dump({
                    'corrections': corrections,
                    'hook_spans': hook_spans,
                    'word_count': len(words),
                    'transcript_preview': " ".join([w["word"] for w in words[:10]]) + "..."
                }, f, indent=2)
            print(f"[GPT Cache] Saved result: {cache_key}")
        except Exception as e:
            print(f"[GPT Cache] Failed to save cache: {e}")
    
    def process(self, input_video: str, output_video: str,
               masks_folder: Optional[str] = None,
               transcript: Optional[str] = None,
               use_whisper: bool = True,
               enable_broll: bool = False,
               noise_isolate: bool = False,
               add_intro: bool = True,
               instagram_export: bool = False,
               auto_rotate: bool = True,
               lut_path: Optional[str] = None,
               rounded_corners: str = 'none',
               aspect_ratio: Optional[str] = None,
               watermark_text: Optional[str] = None,
               watermark_image: Optional[str] = None,
               watermark_position: str = 'bottom-right',
               watermark_opacity: float = 0.6,
               styled_words: Optional[List[Dict]] = None,
               timed_captions: Optional[List[Tuple]] = None) -> bool:
        """
        Process video through complete pipeline.
        
        Args:
            input_video: Input video path
            output_video: Output video path
            noise_isolate: Remove background noise before transcription
            masks_folder: Masks folder (auto-generated if None)
            transcript: Manual transcript (if not using Whisper)
            use_whisper: Use Whisper for transcription
            enable_broll: Insert B-roll footage
            add_intro: Add vertical split intro
            instagram_export: Apply Instagram preset
            auto_rotate: Auto-rotate portrait videos
            lut_path: Path to .cube LUT file for color grading
            rounded_corners: Corner radius style ('none', 'subtle', 'medium', 'heavy')
            aspect_ratio: Target aspect ratio ('1:1', '4:5', '2:3', '9:16')
            
        Returns:
            True if successful
            
        Example:
            >>> pipeline = Pipeline(api_key="sk-...")
            >>> success = pipeline.process(
            ...     "my_video.mp4",
            ...     "output.mp4",
            ...     use_whisper=True,
            ...     enable_broll=True
            ... )
        """
        print(f"\n{'='*70}")
        print("VIRAL CAPTION PIPELINE")
        print(f"{'='*70}")
        print(f"Input: {input_video}")
        print(f"Output: {output_video}")
        print(f"Features: Whisper={use_whisper}, B-roll={enable_broll}, Intro={add_intro}")
        print(f"{'='*70}\n")
        
        # Validate inputs
        if not os.path.exists(input_video):
            print(f"ERROR: Input video not found: {input_video}")
            return False
        
        # Validate video format
        if not is_video_file(input_video):
            ext = Path(input_video).suffix.lower()
            print(f"ERROR: Unsupported video format: {ext}")
            print(f"Supported formats: {', '.join(SUPPORTED_VIDEO_FORMATS)}")
            return False
        
        # ── Pre-flight metadata check ─────────────────────────────────
        meta_check = VideoUtils.check_video_metadata(input_video)
        if not meta_check['ok']:
            print("ERROR: Video failed pre-flight metadata check. Aborting.")
            for err in meta_check['errors']:
                print(f"  -> {err}")
            return False

        # Get video info (already populated inside check, reuse it)
        video_info = meta_check  # check_video_metadata returns all get_video_info fields
        print(f"[Video Info] Resolution: {video_info['display_width']}x{video_info['display_height']}")
        print(f"[Video Info] FPS: {video_info['fps']:.2f}")
        print(f"[Video Info] Duration: {video_info['duration']:.1f}s")
        print(f"[Video Info] Codecs: {video_info['codec']}/{video_info['audio_codec']}")
        if video_info['rotation'] != 0:
            print(f"[Video Info] Rotation: {video_info['rotation']} deg")
        
        if use_whisper and not self.api_key:
            print("ERROR: OpenAI API key required for Whisper. Set OPENAI_API_KEY.")
            return False
        
        # Step 1: Handle video orientation
        self._update_progress("orientation", 0)
        if auto_rotate:
            input_video = self._handle_orientation(input_video)
        self._update_progress("orientation", 100)
        
        # Step 1b: Aspect Ratio Conversion (if requested - do BEFORE masks/captions)
        if aspect_ratio:
            self._update_progress("aspect_ratio", 0)
            print(f"\n[Aspect Ratio] Converting to {aspect_ratio} BEFORE captioning...")
            aspect_temp = output_video.replace('.mp4', f'_aspect_{aspect_ratio.replace(":", "x")}.mp4')
            success = convert_aspect_ratio(input_video, aspect_temp, aspect_ratio)
            if success and os.path.exists(aspect_temp) and os.path.getsize(aspect_temp) > 100000:
                input_video = aspect_temp
                print(f"[Aspect Ratio] Using converted video: {aspect_temp}")
                # Clear masks folder cache - need to regenerate for new dimensions
                masks_folder = None
            else:
                print(f"[Aspect Ratio] Failed, using original video...")
            self._update_progress("aspect_ratio", 100)
        
        # Step 2: Generate or verify masks (AFTER aspect ratio conversion)
        self._update_progress("masks", 0)
        if masks_folder is None:
            masks_folder = self._auto_generate_masks(input_video)
        if not masks_folder or not os.path.exists(masks_folder):
            print("ERROR: Masks not available")
            return False
        self._update_progress("masks", 100)
        
        # Step 2b: Optional noise isolation
        working_video = input_video
        if noise_isolate:
            if NOISE_ISOLATION_AVAILABLE:
                print("\n[Noise Isolation] Removing background noise...")
                try:
                    temp_dir = tempfile.mkdtemp(prefix="noise_iso_")
                    isolator = NoiseIsolator(output_dir=temp_dir, model_file_dir="models")
                    cleaned_video = isolator.process_video(
                        input_video,
                        output_video=os.path.join(temp_dir, "cleaned.mp4")
                    )
                    working_video = cleaned_video
                    print(f"[Noise Isolation] Cleaned video: {working_video}")
                except Exception as e:
                    print(f"[Noise Isolation] Error: {e}")
                    print("[Noise Isolation] Continuing with original audio...")
                    working_video = input_video
            else:
                print("[Noise Isolation] Not available. Install: pip install audio-separator")
                print("[Noise Isolation] Download model: python segmentation/noise_isolation_integration/download_models.py")
        
        # Step 3: Transcription and styling (using cleaned video if available)
        # If styled_words/timed_captions provided from frontend, use those (user's edits)
        transcript_text = transcript
        
        if styled_words and timed_captions:
            # Use user's edited data from frontend (must be non-empty; empty = fall through to Whisper)
            print(f"[Transcription] Using frontend-provided styled_words ({len(styled_words)} words)")
            transcript_text = transcript or " ".join([w.get("word", "") for w in styled_words])
        elif styled_words and (not timed_captions or len(timed_captions) == 0):
            # styled_words present but timed_captions missing/empty — build timed_captions from styled_words
            words_per_line = self.config.get('words_per_line', 4)
            timed_captions = self.caption_formatter.words_to_captions(styled_words, words_per_line)
            transcript_text = transcript or " ".join([w.get("word", "") for w in styled_words])
            print(f"[Transcription] Built {len(timed_captions)} caption groups from styled_words ({len(styled_words)} words)")
        elif use_whisper:
            self._update_progress("transcription", 0)
            styled_words, timed_captions, transcript_text = self._transcribe_and_style(working_video)
            if styled_words is None:
                print("WARNING: Whisper failed, falling back to default captions")
                use_whisper = False
                # If no transcript was passed via CLI either, generate placeholder
                if not transcript_text:
                    video_info = VideoUtils.get_video_info(working_video)
                    duration = video_info.get('duration', 10)
                    transcript_text = "Caption placeholder"
                    # Build timed_captions spanning the full video duration — format: (start, end, text)
                    timed_captions = [(0.0, duration, "Caption placeholder")]
                    print(f"WARNING: No transcript available — video will render without real captions (duration={duration:.1f}s)")
            self._update_progress("transcription", 100)
        
        # Step 4: Apply captions
        self._update_progress("captions", 0)
        caption_output = output_video.replace('.mp4', '_captioned.mp4')
        
        renderer = CaptionRenderer(
            font_size=self.config['font_size'],
            transparency=self.config['transparency'],
            color=self.config['color'],
            position=self.config['position'],
            animation=self.config['animation'],
            mask_erode_pixels=self.config['mask_erode_pixels'],
            mask_blur_radius=self.config['mask_blur_radius'],
            adaptive_erosion=self.config['adaptive_erosion'],
            smart_placement=self.config['smart_placement'],
            auto_words_per_line=self.config['auto_words_per_line'],
            max_hook_words=self.config.get('max_hook_words', 1),
            exclusive_hooks=self.config.get('exclusive_hooks', True),
            hw_encode=self.config.get('hw_encode', True),
            hw_encode_quality=self.config.get('hw_encode_quality', 'medium'),
            frame_skip=self.config.get('mask_frame_skip', 5),
            split_caption_mode=self.config.get('split_caption_mode', False),
            single_side_mode=self.config.get('single_side_mode', False),
            vertical_captions=self.config.get('vertical_captions', False),
            font_regular=self.config.get('font_regular', ''),
            font_emphasis=self.config.get('font_emphasis', ''),
            emotional_words=self.config.get('emotional_words', []),
            emphasis_words=self.config.get('emphasis_words', []),
            highlight_color=tuple(self.config.get('highlight_color', [255, 232, 138])),
            hook_color=tuple(self.config.get('hook_color', [255, 50, 50])),
            emphasis_color=tuple(self.config.get('emphasis_color', [255, 200, 80])),
            regular_color=tuple(self.config.get('regular_color', [255, 255, 255])),
            y_position=self.config.get('y_position', 0.72),
            line_spacing=self.config.get('line_spacing', 10),
        )
        
        success = renderer.apply_captions(
            input_video=input_video,
            masks_folder=masks_folder,
            output_video=caption_output,
            transcript=transcript_text,
            timed_captions=timed_captions,
            styled_words=styled_words,
            words_per_caption=self.config.get('words_per_line', 4),
            seconds_per_caption=self.config.get('seconds_per_caption', 1.5)
        )
        
        if not success:
            print("ERROR: Caption rendering failed")
            return False
        
        self._update_progress("captions", 100)
        
        # Step 4c: Export caption data to JSON (for external use/editing)
        if styled_words and timed_captions:
            self._export_caption_data(output_video, styled_words, timed_captions, transcript_text)
        
        # Step 4d: Add audio back (OpenCV VideoWriter doesn't include audio)
        # Use working_video (cleaned if noise isolation was used) for audio source
        print("[Audio] Adding audio back to video...")
        audio_source = working_video if noise_isolate else input_video
        caption_with_audio = self._add_audio_to_video(audio_source, caption_output)
        if caption_with_audio != caption_output:
            caption_output = caption_with_audio
        
        # Step 5: B-roll insertion
        video_for_intro = caption_output
        
        # Debug why B-roll might be skipped
        if enable_broll:
            print(f"[B-roll Debug] enable_broll={enable_broll}, use_whisper={use_whisper}, styled_words={'Yes' if styled_words else 'No'}")
        
        if enable_broll and styled_words:
            self._update_progress("broll", 0)
            print(f"[B-roll] Starting B-roll insertion with {len(styled_words)} styled words")
            try:
                # Get actual video dimensions for B-roll matching
                video_info = VideoUtils.get_video_info(caption_output)
                target_width = video_info['display_width']
                target_height = video_info['display_height']
                
                print(f"[B-roll] Matching main video resolution: {target_width}x{target_height}")
                
                broll_engine = BrollEngine(
                    api_key=self.api_key,
                    target_width=target_width,
                    target_height=target_height
                )
                
                video_duration = VideoUtils.get_duration(caption_output)
                placements = broll_engine.plan_scenes(transcript_text, video_duration)
                
                # Limit to max 2 B-roll segments for this video
                if placements:
                    original_count = len(placements)
                    if original_count > 2:
                        placements = placements[:2]
                        print(f"[B-roll] Limited to 2 segments (from {original_count} planned)")
                    
                    # Show planned timestamps
                    for i, p in enumerate(placements):
                        print(f"  B-roll {i+1}: {p['timestamp_seconds']:.1f}s - {p.get('theme', 'N/A')}")
                    
                    # MANUAL OVERRIDE: Adjust second B-roll timestamp if needed
                    # Option 1: Set BROLL_SECOND_OFFSET to shift by seconds (relative)
                    #   Example: BROLL_SECOND_OFFSET=5  (moves 5s later)
                    #   Example: BROLL_SECOND_OFFSET=-3 (moves 3s earlier)
                    # Option 2: Set BROLL_SECOND_AT to exact timestamp (absolute)
                    #   Example: BROLL_SECOND_AT=15.5 (places at exactly 15.5 seconds)
                    
                    second_offset = os.environ.get('BROLL_SECOND_OFFSET')
                    second_at = os.environ.get('BROLL_SECOND_AT')
                    
                    if len(placements) >= 2:
                        old_ts = placements[1]['timestamp_seconds']
                        
                        if second_at:
                            # Set exact timestamp
                            new_ts = float(second_at)
                            new_ts = max(3.0, min(new_ts, video_duration - 3.0))
                            placements[1]['timestamp_seconds'] = new_ts
                            print(f"[B-roll] Set B-roll 2 to exact time: {old_ts:.1f}s -> {new_ts:.1f}s")
                        elif second_offset:
                            # Shift by offset
                            offset = float(second_offset)
                            new_ts = old_ts + offset
                            new_ts = max(3.0, min(new_ts, video_duration - 3.0))
                            placements[1]['timestamp_seconds'] = new_ts
                            print(f"[B-roll] Shifted B-roll 2: {old_ts:.1f}s -> {new_ts:.1f}s (offset: {offset:+.1f}s)")
                
                if placements:
                    with tempfile.TemporaryDirectory(prefix="broll_") as temp_dir:
                        broll_output = broll_engine.process_broll_segments(
                            base_video=caption_output,
                            placements=placements,
                            styled_words=styled_words,
                            temp_folder=temp_dir,
                            font_size=self.config['font_size'],
                            transparency=self.config['transparency']
                        )
                        
                        if broll_output != caption_output:
                            # Move B-roll output to permanent location before temp folder deleted
                            permanent_broll = caption_output.replace('.mp4', '_broll.mp4')
                            shutil.move(broll_output, permanent_broll)
                            video_for_intro = permanent_broll
                            print(f"[B-roll] Inserted {len(placements)} segments")
                
                self._update_progress("broll", 100)
            except Exception as e:
                print(f"[B-roll] Error: {e}")
                import traceback
                traceback.print_exc()
                self._update_progress("broll", 100)
        elif enable_broll:
            # B-roll was requested but conditions not met
            if not styled_words:
                print("[B-roll] Skipped: No styled words available (transcription/styling failed)")
        
        # Step 6: Add intro
        if add_intro:
            self._update_progress("intro", 0)
            intro_output = output_video.replace('.mp4', '') + '_with_intro.mp4'
            self._add_vertical_intro(input_video, video_for_intro, intro_output)
            video_for_intro = intro_output
            self._update_progress("intro", 100)
        
        # Step 7: Instagram export
        if instagram_export:
            self._update_progress("instagram", 0)
            instagram_output = output_video.replace('.mp4', '_instagram.mp4')
            VideoUtils.apply_instagram_preset(video_for_intro, instagram_output)
            video_for_intro = instagram_output
            self._update_progress("instagram", 100)
        
        # Step 8: LUT Color Grading
        if lut_path and os.path.exists(lut_path):
            self._update_progress("color_grade", 0)
            print(f"\n[Color Grade] Applying LUT: {lut_path}")
            graded_output = output_video.replace('.mp4', '_graded.mp4')
            self._apply_lut_color_grade(video_for_intro, lut_path, graded_output)
            video_for_intro = graded_output
            self._update_progress("color_grade", 100)
        
        # Step 9: Rounded Corners
        if rounded_corners != 'none':
            self._update_progress("rounded_corners", 0)
            print(f"\n[Rounded Corners] Applying {rounded_corners} corners...")
            rounded_output = output_video.replace('.mp4', '_rounded.mp4')
            success = self._apply_rounded_corners(video_for_intro, rounded_corners, rounded_output)
            if success and os.path.exists(rounded_output) and os.path.getsize(rounded_output) > 100000:
                video_for_intro = rounded_output
                print(f"[Rounded Corners] Success! Using: {rounded_output}")
            else:
                print(f"[Rounded Corners] Failed or file too small, skipping...")
            self._update_progress("rounded_corners", 100)
        
        # Note: Watermark is now preview-only in the frontend
        # No watermark applied to final exported video
        
        # Final: Move to output path
        print(f"[Final] Moving {video_for_intro} to {output_video}")
        print(f"[Final] File exists: {os.path.exists(video_for_intro)}, Size: {os.path.getsize(video_for_intro) if os.path.exists(video_for_intro) else 0}")
        if video_for_intro != output_video:
            if os.path.exists(video_for_intro):
                shutil.move(video_for_intro, output_video)
                print(f"[Final] Moved successfully")
            else:
                print(f"[Final] ERROR: Source file doesn't exist!")
        
        # Cleanup all intermediate files — only keep the final output
        intermediates = [
            caption_output,
            caption_output.replace('.mp4', '_with_audio.mp4'),
            caption_output.replace('.mp4', '_broll.mp4'),
            output_video.replace('.mp4', '_with_intro.mp4'),
            output_video.replace('.mp4', '_instagram.mp4'),
            output_video.replace('.mp4', '_lut.mp4'),
            output_video.replace('.mp4', '_rounded.mp4'),
            output_video.replace('.mp4', '_watermarked.mp4'),
            output_video.replace('.mp4', '_captioned_broll.mp4'),
        ]
        for f in intermediates:
            if f != output_video and os.path.exists(f):
                os.remove(f)
        
        print(f"\n{'='*70}")
        print(f"[SUCCESS] Output: {output_video}")
        print(f"{'='*70}\n")
        
        return True
    
    def _handle_orientation(self, input_video: str) -> str:
        """Handle video orientation - DISABLED by default to preserve original aspect ratio."""
        info = VideoUtils.get_video_info(input_video)
        
        print(f"[Orientation] Video: {info['width']}x{info['height']}")
        print(f"[Orientation] Display: {info['display_width']}x{info['display_height']}")
        print(f"[Orientation] Aspect ratio: {info['aspect_ratio']:.2f}")
        
        # AUTO-ROTATION IS DISABLED BY DEFAULT
        # Only log rotation metadata, don't apply it
        if info['rotation'] != 0:
            print(f"[Orientation] Rotation metadata: {info['rotation']} deg (ignored - preserving original)")
        
        # ALWAYS preserve original dimensions - no rotation applied
        print("[Orientation] Preserving original aspect ratio (auto-rotate disabled)")
        return input_video
    
    def _get_video_hash(self, video_path: str) -> str:
        """Generate a unique hash for video file (for caching)."""
        import hashlib
        
        # Use file size + modification time + first 1MB hash
        stat = os.stat(video_path)
        size = stat.st_size
        mtime = stat.st_mtime
        
        # Hash first 1MB of file content for uniqueness
        hasher = hashlib.md5()
        hasher.update(f"{size}:{mtime}".encode())
        
        with open(video_path, 'rb') as f:
            hasher.update(f.read(1024 * 1024))  # First 1MB
        
        return hasher.hexdigest()[:16]
    
    def _get_cached_masks_folder(self, input_video: str) -> str:
        """Get path to cached masks folder for this video."""
        video_hash = self._get_video_hash(input_video)
        # Save to masks_generated folder in segmentation directory
        cache_dir = Path(__file__).parent.parent / "masks_generated" / f"video_masks_{video_hash}"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return str(cache_dir)
    
    def _auto_generate_masks(self, input_video: str) -> str:
        """Auto-generate masks using MediaPipe (with caching and frame skip)."""
        if not self.mediapipe_available:
            print("ERROR: MediaPipe not installed. Cannot generate masks.")
            print("Install: pip install mediapipe")
            return None
        
        import mediapipe as mp
        
        # Get frame skip setting (default 5 = 80% reduction)
        frame_skip = self.config.get('mask_frame_skip', 5)
        preview_mode = self.config.get('preview_mode', False)
        preview_scale = self.config.get('preview_scale', 0.5)
        
        # Check for cached masks first
        cache_folder = self._get_cached_masks_folder(input_video)
        metadata_file = os.path.join(cache_folder, "metadata.txt")
        
        if os.path.exists(cache_folder) and os.path.exists(metadata_file):
            # Verify cache is complete
            try:
                with open(metadata_file, 'r') as f:
                    import json
                    metadata = json.load(f)
                    expected_masks = metadata.get('total_masks', 0)
                    cached_frame_skip = metadata.get('frame_skip', 1)
                    actual_masks = len([f for f in os.listdir(cache_folder) if f.startswith('mask_') and f.endswith('.npy')])
                    
                    # Check if cache matches our frame_skip requirement
                    if actual_masks >= expected_masks and cached_frame_skip == frame_skip:
                        print(f"[Masks] Using cached masks: {cache_folder}")
                        print(f"[Masks] Cached masks: {actual_masks} (skip={frame_skip})")
                        return cache_folder
                    else:
                        print(f"[Masks] Cache mismatch ({actual_masks}/{expected_masks}, skip={cached_frame_skip}), regenerating...")
            except Exception as e:
                print(f"[Masks] Cache check failed: {e}, regenerating...")
        
        # Create cache folder
        os.makedirs(cache_folder, exist_ok=True)
        output_folder = cache_folder
        
        print(f"[Masks] Generating masks to: {output_folder}")
        
        # Get video info
        video_info = VideoUtils.get_video_info(input_video)
        fps = video_info['fps']
        
        # Check rotation - only 90� deg/270� deg means portrait, 180� deg is still landscape
        video_rotation = video_info.get('rotation', 0)
        rotation_abs = abs(video_rotation)
        
        if rotation_abs in [90, 270]:
            # Portrait video stored as landscape - use display dimensions
            orig_width = video_info['display_width']
            orig_height = video_info['display_height']
        else:
            # Landscape video (or upside down) - use raw dimensions
            orig_width = video_info['width']
            orig_height = video_info['height']
        
        # Apply preview scaling if enabled
        if preview_mode:
            width = int(orig_width * preview_scale)
            height = int(orig_height * preview_scale)
            print(f"[Masks] Preview mode: {orig_width}x{orig_height} -> {width}x{height}")
        else:
            width, height = orig_width, orig_height
        
        print(f"[Masks] Video specs: {width}x{height} @ {fps:.2f}fps, skip={frame_skip}")
        print(f"[Masks] Frame interpolation: ON (80% reduction in generation time)")
        
        # Import here to avoid dependency issues
        cap = cv2.VideoCapture(input_video)
        # Disable auto-rotation so our manual rotation below is the only one applied.
        # Without this OpenCV auto-rotates first, then our rotation double-rotates,
        # giving MediaPipe a distorted/sideways frame and breaking segmentation.
        try:
            cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 0)
        except Exception:
            pass
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Create interpolator
        interpolator = MaskInterpolator(frame_skip=frame_skip)
        estimated_masks = interpolator.estimate_total_masks(total_frames)
        
        mp_selfie_segmentation = mp.solutions.selfie_segmentation
        
        # Morphological kernels for mask post-processing
        close_kernel  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
        # Small horizontal-only dilation — expands left/right edges (arms/shoulders)
        # without pushing upward past the top of the head
        dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 3))

        masks_generated = 0
        prev_mask = None  # for temporal smoothing
        with mp_selfie_segmentation.SelfieSegmentation(model_selection=1) as segmenter:
            frame_count = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame_count += 1

                # Only generate mask every N frames
                if not interpolator.should_generate_mask(frame_count):
                    continue

                if masks_generated % 10 == 0:
                    progress = (masks_generated / estimated_masks) * 100
                    print(f"  [Masks] Generated {masks_generated}/{estimated_masks} keyframe masks ({progress:.1f}%)")
                    # Check for cancellation every 10 masks
                    if self._check_cancelled():
                        print("[Masks] Cancellation requested, stopping mask generation")
                        cap.release()
                        return None

                # Apply rotation for portrait videos before processing
                if video_rotation != 0:
                    if video_rotation in [90, -270]:
                        frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
                    elif video_rotation in [-90, 270]:
                        frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                    elif abs(video_rotation) == 180:
                        frame = cv2.rotate(frame, cv2.ROTATE_180)

                # Resize frame if needed
                if preview_mode:
                    frame = cv2.resize(frame, (width, height))
                elif frame.shape[1] != width or frame.shape[0] != height:
                    frame = cv2.resize(frame, (width, height))

                # Convert and process
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = segmenter.process(rgb)

                if results.segmentation_mask is not None:
                    seg = results.segmentation_mask  # float32 0..1

                    # --- Step 1: lower threshold to capture soft edges ---
                    binary_mask = (seg >= 0.35).astype(np.uint8) * 255

                    # --- Step 2: keep only the largest connected component ---
                    # (removes stray blobs away from the person)
                    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)
                    if num_labels > 1:
                        # label 0 is background; find largest foreground label
                        largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
                        binary_mask = np.where(labels == largest_label, 255, 0).astype(np.uint8)

                    # --- Step 3: morphological close — fills internal holes ---
                    binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, close_kernel)

                    # --- Step 4: slight dilation — expands edges to avoid clipping hair/arms ---
                    binary_mask = cv2.dilate(binary_mask, dilate_kernel, iterations=1)

                    # --- Step 5: temporal smoothing — blend with previous mask ---
                    # prevents sudden flickering between frames
                    if prev_mask is not None and prev_mask.shape == binary_mask.shape:
                        blended = cv2.addWeighted(
                            binary_mask.astype(np.float32), 0.75,
                            prev_mask.astype(np.float32),   0.25,
                            0
                        )
                        binary_mask = (blended >= 128).astype(np.uint8) * 255

                    prev_mask = binary_mask.copy()

                    mask_path = os.path.join(output_folder, f"mask_{frame_count:05d}.npy")
                    np.save(mask_path, binary_mask)
                    masks_generated += 1
        
        cap.release()
        
        # Save metadata
        metadata = {
            "source_video": Path(input_video).name,
            "video_hash": self._get_video_hash(input_video),
            "total_frames": total_frames,
            "total_masks": masks_generated,
            "frame_skip": frame_skip,
            "fps": fps,
            "width": width,
            "height": height,
            "original_width": orig_width,
            "original_height": orig_height,
            "preview_mode": preview_mode,
        }
        
        import json
        with open(os.path.join(output_folder, "metadata.txt"), 'w') as f:
            json.dump(metadata, f, indent=2)
        
        print(f"[Masks] Generated {masks_generated} keyframe masks (every {frame_skip} frames)")
        print(f"[Masks] Interpolation will generate {total_frames} total masks")
        print(f"[Masks] Cached for reuse: {output_folder}")
        return output_folder
    
    def _transcribe_and_style(self, input_video: str) -> tuple:
        """Transcribe with Whisper and style with GPT."""
        if not self.openai_available or not self.openai_client:
            return None, None, None
        
        # Extract audio
        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path = os.path.join(temp_dir, "audio.wav")
            
            print("[Whisper] Extracting audio...")
            if not VideoUtils.extract_audio(input_video, audio_path):
                return None, None, None
            
            # Check for cancellation after audio extraction
            if self._check_cancelled():
                print("[Whisper] Cancellation requested, stopping transcription")
                return None, None, None
            
            # Transcribe
            print("[Whisper] Transcribing...")
            
            try:
                with open(audio_path, "rb") as f:
                    response = self.openai_client.audio.transcriptions.create(
                        model="whisper-1",
                        file=f,
                        response_format="verbose_json",
                        timestamp_granularities=["word"]
                    )
            except Exception as e:
                print(f"[Whisper] Transcription failed: {e}")
                return None, None, None
            
            # Extract words with timing
            raw_words = []
            words_data = getattr(response, 'words', None) if hasattr(response, 'words') else response.get('words', [])
            if words_data:
                for word_data in words_data:
                    # Handle both object attributes and dict keys
                    if isinstance(word_data, dict):
                        raw_words.append({
                            "word": word_data.get('word', '').strip(),
                            "start": float(word_data.get('start', 0)),
                            "end": float(word_data.get('end', 0))
                        })
                    else:
                        raw_words.append({
                            "word": word_data.word.strip(),
                            "start": float(word_data.start),
                            "end": float(word_data.end)
                        })
            
            # Apply word corrections (including multi-word phrases)
            words = self._apply_word_corrections_with_phrases(raw_words)
            
            print(f"[Whisper] Transcribed {len(words)} words")
            
            if not words:
                return None, None, None
            
            # Check for cancellation before GPT processing
            if self._check_cancelled():
                print("[GPT] Cancellation requested, stopping before GPT processing")
                return None, None, None
            
            # Apply GPT processing (corrections + hook detection)
            if self.config.get('combine_gpt_calls', True) and self.openai_client:
                # Use combined approach (1 API call instead of 2)
                styled_words = self._process_with_gpt_combined(words)
            elif self.config.get('gpt_correction', True) and self.openai_client:
                # Legacy: separate correction and styling calls (2 API calls)
                words = self._correct_with_gpt(words)
                print("[GPT] Styling captions...")
                styled_words = self._style_with_gpt(words)
            else:
                # No GPT styling
                styled_words = self._fallback_styling(words)
            
            if not styled_words:
                return None, None, None
            
            # Debug trace
            if tracer:
                tracer.log_word_styling("after_gpt_styling", styled_words)
            
            # Build transcript text
            transcript_text = " ".join([w["word"] for w in styled_words])
            
            # Create timed captions
            timed_captions = self.caption_formatter.words_to_captions(
                styled_words, self.config['words_per_line']
            )
            
            return styled_words, timed_captions, transcript_text
    
    def _apply_word_corrections_with_phrases(self, words: List[Dict]) -> List[Dict]:
        """Apply word corrections including multi-word phrases."""
        if not words:
            return words
        
        result = []
        i = 0
        while i < len(words):
            # Check for multi-word phrase corrections (up to 3 words)
            corrected = False
            for phrase_len in range(min(3, len(words) - i), 0, -1):
                phrase = ' '.join(words[j]['word'] for j in range(i, i + phrase_len))
                if phrase in WORD_CORRECTIONS:
                    # Replace with corrected word
                    corrected_word = WORD_CORRECTIONS[phrase]
                    result.append({
                        "word": corrected_word,
                        "start": words[i]['start'],
                        "end": words[i + phrase_len - 1]['end']
                    })
                    i += phrase_len
                    corrected = True
                    break
            
            if not corrected:
                # Single word correction
                w = words[i]['word']
                w = WORD_CORRECTIONS.get(w, w)
                result.append({
                    "word": w,
                    "start": words[i]['start'],
                    "end": words[i]['end']
                })
                i += 1
        
        return result
    
    def _correct_with_gpt(self, words: List[Dict]) -> List[Dict]:
        """
        Apply GPT-powered smart corrections to fix misheard words.
        
        Uses context and phonetic similarity to identify and correct
        words that Whisper likely misheard due to accent/pronunciation.
        
        Args:
            words: List of word dicts with 'word', 'start', 'end'
            
        Returns:
            Corrected word list
        """
        if not self.openai_client or not words:
            return words
        
        # Build transcript text for context
        transcript_text = " ".join([w["word"] for w in words])
        
        # Skip if transcript is too short
        if len(transcript_text.split()) < 3:
            return words
        
        try:
            print("[GPT] Checking for misheard words...")
            
            from .config import TRANSCRIPTION_CORRECTION_PROMPT, DOMAIN_KEYWORDS
            
            # Detect domain for better context
            detected_domain = "general"
            transcript_lower = transcript_text.lower()
            for domain, keywords in DOMAIN_KEYWORDS.items():
                if any(kw in transcript_lower for kw in keywords):
                    detected_domain = domain
                    break
            
            # Build prompt with context
            prompt = f"""Video transcript:
\"{transcript_text}\"

Detected topic: {detected_domain}

Review for misheard words. Focus on:
- Brand names that sound like common words
- Technical terms pronounced with accents
- Names/phrases that don't make sense in context

Return JSON corrections:"""
            
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": TRANSCRIPTION_CORRECTION_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistent corrections
                max_tokens=300
            )
            
            content = response.choices[0].message.content.strip()
            import json
            result = json.loads(content)
            
            corrections = result.get("corrections", {})
            confidence = result.get("confidence", "medium")
            
            # Check confidence threshold
            threshold = self.config.get('correction_confidence_threshold', 'medium')
            confidence_levels = {'low': 0, 'medium': 1, 'high': 2}
            
            if confidence_levels.get(confidence, 1) < confidence_levels.get(threshold, 1):
                print(f"[GPT] Corrections found but confidence '{confidence}' below threshold '{threshold}'")
                return words
            
            if not corrections:
                print("[GPT] No corrections needed")
                return words
            
            # Apply corrections
            corrected_count = 0
            result_words = []
            
            for word_data in words:
                original_word = word_data["word"]
                # Check for exact match
                if original_word in corrections:
                    corrected_word = corrections[original_word]
                    result_words.append({
                        "word": corrected_word,
                        "start": word_data["start"],
                        "end": word_data["end"]
                    })
                    if corrected_word.lower() != original_word.lower():
                        corrected_count += 1
                        print(f"  [Corrected] '{original_word}' → '{corrected_word}'")
                # Check case-insensitive match
                elif original_word.lower() in {k.lower(): v for k, v in corrections.items()}:
                    # Find the matching key
                    for key, value in corrections.items():
                        if key.lower() == original_word.lower():
                            result_words.append({
                                "word": value,
                                "start": word_data["start"],
                                "end": word_data["end"]
                            })
                            if value.lower() != original_word.lower():
                                corrected_count += 1
                                print(f"  [Corrected] '{original_word}' → '{value}'")
                            break
                else:
                    result_words.append(word_data)
            
            if corrected_count > 0:
                print(f"[GPT] Applied {corrected_count} correction(s) (confidence: {confidence})")
            
            return result_words
            
        except Exception as e:
            print(f"[GPT] Correction failed: {e}")
            return words
    
    def _style_with_gpt(self, whisper_words: List[Dict]) -> List[Dict]:
        """Style words - NO automatic styling, all words regular."""
        return self._fallback_styling(whisper_words)
    
    def _fallback_styling(self, words: List[Dict]) -> List[Dict]:
        """Fallback styling - all words regular (no auto-styling)."""
        styled = []
        for word_data in words:
            styled.append({
                "word": word_data["word"],
                "style": "regular",
                "size_mult": 1.0,
                "color": (200, 220, 240),
                "start": word_data["start"],
                "end": word_data["end"]
            })
        
        return styled
    
    def _process_with_gpt_combined(self, words: List[Dict]) -> List[Dict]:
        """NO automatic styling - all words regular."""
        return self._fallback_styling(words)
    
    def _UNUSED_process_with_gpt_combined_OLD(self, words: List[Dict]) -> List[Dict]:
        """
        [DEPRECATED] Combined GPT processing: corrections + hook detection in ONE API call.
        
        This saves 1 API call compared to separate _correct_with_gpt() and 
        _style_with_gpt() methods.
        
        Args:
            words: List of word dicts with 'word', 'start', 'end'
            
        Returns:
            Styled words with corrections applied and styles assigned
        """
        if not self.openai_client or not words:
            return self._fallback_styling(words)
        
        # Check cache first
        cached_result = self._get_cached_gpt_result(words)
        if cached_result:
            corrections, hook_spans = cached_result
            print("[GPT] Using cached corrections and hooks")
            return self._apply_gpt_results(words, corrections, hook_spans, set())
        
        # Build transcript text
        transcript_text = " ".join([w["word"] for w in words])
        
        # Skip if transcript is too short
        if len(transcript_text.split()) < 3:
            return self._fallback_styling(words)
        
        try:
            print("[GPT] Processing corrections + hooks (combined call)...")
            
            from .config import COMBINED_CORRECTION_AND_HOOKS_PROMPT, DOMAIN_KEYWORDS
            
            # Detect domain for better context
            detected_domain = "general"
            transcript_lower = transcript_text.lower()
            for domain, keywords in DOMAIN_KEYWORDS.items():
                if any(kw in transcript_lower for kw in keywords):
                    detected_domain = domain
                    break
            
            # Build indexed transcript for hooks
            indexed_lines = [f"{i}: {w['word']}" for i, w in enumerate(words)]
            indexed = "\n".join(indexed_lines)
            
            # Build combined prompt
            prompt = f"""Video transcript:
\"{transcript_text}\"

Detected topic: {detected_domain}

Word indices:
{indexed}

Return JSON with corrections, hook_spans AND emphasis_indices."""
            
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": COMBINED_CORRECTION_AND_HOOKS_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=700  # Increased for corrections + hooks + emphasis
            )
            
            content = response.choices[0].message.content.strip()
            result = json.loads(content)
            
            # Extract corrections
            corrections = result.get("corrections", {})
            confidence = result.get("confidence", "medium")
            
            # Extract hook spans
            hook_spans = result.get("hook_spans", [])

            # Extract emphasis indices (new Task 3)
            emphasis_indices = set(result.get("emphasis_indices", []))

            # Check confidence threshold
            threshold = self.config.get('correction_confidence_threshold', 'medium')
            confidence_levels = {'low': 0, 'medium': 1, 'high': 2}
            
            if confidence_levels.get(confidence, 1) < confidence_levels.get(threshold, 1):
                # Confidence too low, skip corrections but keep hooks
                print(f"[GPT] Corrections confidence '{confidence}' below threshold, skipping corrections")
                corrections = {}
            
            # Apply corrections
            corrected_words = []
            corrected_count = 0
            for word_data in words:
                original_word = word_data["word"]
                corrected_word = original_word
                
                # Check for exact match
                if original_word in corrections:
                    corrected_word = corrections[original_word]
                # Check case-insensitive match
                elif original_word.lower() in {k.lower(): v for k, v in corrections.items()}:
                    for key, value in corrections.items():
                        if key.lower() == original_word.lower():
                            corrected_word = value
                            break
                
                if corrected_word.lower() != original_word.lower():
                    corrected_count += 1
                    print(f"  [Corrected] '{original_word}' → '{corrected_word}'")
                
                corrected_words.append({
                    "word": corrected_word,
                    "start": word_data["start"],
                    "end": word_data["end"]
                })
            
            if corrected_count > 0:
                print(f"[GPT] Applied {corrected_count} correction(s) (confidence: {confidence})")
            else:
                print("[GPT] No corrections needed")
            
            # Log hooks found
            if hook_spans:
                hooks_str = ", ".join([f"{s['start']}-{s['end']}" for s in hook_spans[:3]])
                print(f"[GPT] Hooks found: {hooks_str}")
            
            if emphasis_indices:
                print(f"[GPT] Emphasis words found at indices: {sorted(emphasis_indices)}")

            # Cache the results
            self._cache_gpt_result(words, corrections, hook_spans)

            # Apply styling with hooks + emphasis
            return self._apply_gpt_results(corrected_words, {}, hook_spans, emphasis_indices)
            
        except Exception as e:
            print(f"[GPT] Combined processing failed: {e}")
            return self._fallback_styling(words)
    
    def _apply_gpt_results(self, words: List[Dict], corrections: Dict, hook_spans: List, emphasis_indices: set = None) -> List[Dict]:
        """
        Apply GPT results (corrections, hook spans, emphasis indices) to words.

        Args:
            words: List of word dicts
            corrections: Dict of word corrections (already applied, kept for compatibility)
            hook_spans: List of hook span dicts with 'start' and 'end' indices
            emphasis_indices: Set of word indices GPT flagged as emphasis

        Returns:
            Styled words list
        """
        if emphasis_indices is None:
            emphasis_indices = set()
        # Build set of hook indices (limit to max 2 words per hook for visual impact)
        hook_indices = set()
        filtered_spans = []
        for span in hook_spans:
            start = span.get("start", 0)
            end = span.get("end", 0)
            # Limit hook length to max 2 words
            if end - start > 1:
                end = start + 1  # Reduce to 2 words max
            filtered_spans.append({"start": start, "end": end})
            for i in range(start, end + 1):
                if 0 <= i < len(words):
                    hook_indices.add(i)
        
        # Assign styles
        styled = []
        prev_hook_word = None
        for i, word_data in enumerate(words):
            word = word_data["word"]
            start = word_data["start"]
            end = word_data["end"]
            clean = ''.join(c for c in word.lower() if c.isalnum())
            
            # NO AUTO-STYLING: only use hook indices from GPT, no word list matching
            if i in hook_indices:
                # Skip hook if same as previous hook word
                if clean == prev_hook_word:
                    style = "regular"
                    size_mult = 1.0
                    color = (200, 220, 240)
                else:
                    style = "hook"
                    size_mult = 1.25
                    color = (255, 200, 80)
                    prev_hook_word = clean
            else:
                style = "regular"
                size_mult = 1.0
                color = (200, 220, 240)
            
            styled.append({
                "word": word,
                "style": style,
                "size_mult": size_mult,
                "color": color,
                "start": start,
                "end": end
            })
        
        return styled
    
    def _add_audio_to_video(self, original_video: str, captioned_video: str) -> str:
        """Add audio from original video to captioned video using FFmpeg with universal output."""
        import subprocess
        
        # Get original video info for preserving specs
        video_info = VideoUtils.get_video_info(original_video)
        
        output_video = captioned_video.replace('.mp4', '_with_audio.mp4')
        
        # Check if captioned video has valid video stream
        check_cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", 
                     "-show_entries", "stream=codec_name", "-of", 
                     "default=noprint_wrappers=1:nokey=1", captioned_video]
        check_result = subprocess.run(check_cmd, capture_output=True, text=True)
        
        if check_result.returncode != 0 or not check_result.stdout.strip():
            print("[Audio] Warning: Captioned video has no valid video stream, skipping audio add")
            return captioned_video
        
        # Universal output: H.264 + AAC, preserve resolution and fps
        # Use -shortest to handle length mismatches
        # -map_metadata -1 prevents rotation metadata from original video leaking
        # into output (OpenCV already applied rotation to pixel data, so metadata
        # would cause a double-rotation / upside-down result in players).
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", captioned_video,      # Video with captions (no audio)
            "-i", original_video,       # Original video (for audio)
            "-map", "0:v:0",            # Video from captioned file only
            "-map", "1:a?",             # Audio from original only
            "-c:v", "copy",             # Copy video (already encoded)
            "-c:a", "aac",              # Universal AAC audio
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",      # Universal pixel format
            "-map_metadata", "-1",      # Strip all metadata (prevents rotation re-apply)
            "-metadata:s:v:0", "rotate=0",  # Explicitly clear video stream rotation
            "-shortest",                # End when shortest stream ends
            output_video
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(f"[Audio] Audio added: {output_video}")
            # Replace original with audio version
            os.replace(output_video, captioned_video)
            return captioned_video
        
        # Fallback for .mov and other formats: extract audio to WAV first, then mux
        err_lower = (result.stderr or "").lower()
        if "decoder" in err_lower or "none" in err_lower or original_video.lower().endswith(".mov"):
            print("[Audio] Direct mux failed, trying extract-to-WAV fallback...")
            with tempfile.TemporaryDirectory(prefix="audio_") as tmp:
                wav_path = os.path.join(tmp, "audio.wav")
                if VideoUtils.extract_audio(original_video, wav_path):
                    fallback_cmd = [
                        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                        "-i", captioned_video, "-i", wav_path,
                        "-map", "0:v:0", "-map", "1:a:0",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                        "-map_metadata", "-1", "-shortest", output_video
                    ]
                    fb = subprocess.run(fallback_cmd, capture_output=True, text=True)
                    if fb.returncode == 0:
                        print(f"[Audio] Audio added via WAV fallback: {output_video}")
                        os.replace(output_video, captioned_video)
                        return captioned_video
        
        print(f"[Audio] Warning: Could not add audio: {result.stderr[:200]}")
        return captioned_video
    
    def _export_caption_data(self, output_video: str, styled_words: List[Dict],
                             timed_captions: List[Tuple], transcript_text: str):
        """Export caption timing and styling data to JSON for external use."""
        import json
        from pathlib import Path
        
        # Create output path next to video
        video_path = Path(output_video)
        json_path = video_path.parent / f"{video_path.stem}_captions.json"
        
        # Build export data
        export_data = {
            "metadata": {
                "source_video": str(video_path.name),
                "transcript": transcript_text,
                "total_words": len(styled_words),
                "total_captions": len(timed_captions),
                "words_per_caption": self.config.get('words_per_line', 3)
            },
            "styled_words": [
                {
                    "word": w.get("word", ""),
                    "start": round(w.get("start", 0), 3),
                    "end": round(w.get("end", 0), 3),
                    "style": w.get("style", "regular"),
                    "size_mult": w.get("size_mult", 1.0)
                }
                for w in styled_words
            ],
            "timed_captions": [
                {
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "text": " ".join(lines) if isinstance(lines, list) else str(lines),
                    "duration": round(end - start, 3)
                }
                for start, end, lines in timed_captions
            ]
        }
        
        # Write to file
        try:
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)
            print(f"[Export] Caption data saved: {json_path}")
            print(f"  - {len(styled_words)} words with timing")
            print(f"  - {len(timed_captions)} caption groups")
        except Exception as e:
            print(f"[Export] Warning: Could not save caption data: {e}")
    
    def _add_vertical_intro(self, original_video: str, captioned_video: str, 
                           output_video: str, intro_duration: float = 0.6):
        """Add vertical split reveal intro with universal aspect ratio support."""
        import subprocess
        
        # Get video info for proper handling
        video_info = VideoUtils.get_video_info(captioned_video)
        width, height = video_info['display_width'], video_info['display_height']
        fps = video_info['fps']
        
        print(f"[Intro] Adding split intro to {width}x{height} video")
        
        half_height = height // 2
        
        filter_complex = (
            f"[0:v]format=yuv420p[base];"
            f"color=black:s={width}x{half_height}:d={intro_duration}[top_bar];"
            f"color=black:s={width}x{half_height}:d={intro_duration}[bottom_bar];"
            f"[base][top_bar]overlay=x=0:y='-({half_height})*min(t/{intro_duration},1)':shortest=0[tmp];"
            f"[tmp][bottom_bar]overlay=x=0:y='{half_height}+({half_height})*min(t/{intro_duration},1)':shortest=0[video];"
            f"[video]format=yuv420p[final]"
        )
        
        # Universal output: H.264 + AAC, preserve fps
        cmd = [
            "ffmpeg", "-y",
            "-i", captioned_video,
            "-filter_complex", filter_complex,
            "-map", "[final]",
            "-map", "0:a:0?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-r", str(fps),  # Preserve original frame rate
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-shortest",
            output_video
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    
    def _apply_lut_color_grade(self, input_video: str, lut_path: str, output_video: str) -> bool:
        """Apply .cube LUT color grading using FFmpeg."""
        # Escape path for FFmpeg (Windows backslashes -> forward, colons escaped)
        lut_escaped = lut_path.replace("\\", "/").replace(":", "\\:")
        
        # Build FFmpeg command with lut3d filter
        cmd = [
            "ffmpeg", "-y",
            "-i", input_video,
            "-vf", f"lut3d=file='{lut_escaped}',format=yuv420p",
            "-c:v", "libx264", "-preset", "slow", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            output_video
        ]
        
        print(f"[Color Grade] Running FFmpeg with LUT...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"[Color Grade] Error: {result.stderr[-500:]}")
            return False
        
        print(f"[Color Grade] Saved: {output_video}")
        return True
    
    def _apply_rounded_corners(self, input_video: str, radius_style: str, output_video: str) -> bool:
        """Apply rounded corners using PostProcessor."""
        from .post_processor import PostProcessor
        pp = PostProcessor()
        success = pp.apply_rounded_corners(input_video, output_video, radius_style=radius_style)
        if success:
            print(f"[Rounded Corners] Saved: {output_video}")
        return success


# =============================================================================
# Simple function interface
# =============================================================================

def process_video(input_video: str, output_video: str,
                 api_key: Optional[str] = None,
                 use_whisper: bool = True,
                 enable_broll: bool = False,
                 add_intro: bool = True,
                 instagram_export: bool = False,
                 **kwargs) -> bool:
    """
    Process video through complete pipeline (simple function interface).
    
    Args:
        input_video: Input video path
        output_video: Output video path
        api_key: OpenAI API key (or set OPENAI_API_KEY env var)
        use_whisper: Use Whisper transcription
        enable_broll: Insert B-roll footage
        add_intro: Add vertical split intro effect
        instagram_export: Apply Instagram preset
        **kwargs: Additional config options
        
    Returns:
        True if successful
        
    Example:
        >>> from scripts.pipeline import process_video
        >>> process_video(
        ...     "input.mp4",
        ...     "output.mp4",
        ...     use_whisper=True,
        ...     enable_broll=True
        ... )
    """
    # Extract special kwargs
    lut_path = kwargs.pop('lut_path', None)
    rounded_corners = kwargs.pop('rounded_corners', 'none')
    aspect_ratio = kwargs.pop('aspect_ratio', None)
    
    pipeline = Pipeline(api_key=api_key, config=kwargs)
    return pipeline.process(
        input_video=input_video,
        output_video=output_video,
        use_whisper=use_whisper,
        enable_broll=enable_broll,
        add_intro=add_intro,
        instagram_export=instagram_export,
        lut_path=lut_path,
        rounded_corners=rounded_corners,
        aspect_ratio=aspect_ratio
    )


def process_video_simple(input_video: str, output_video: str,
                        transcript: str, **kwargs) -> bool:
    """
    Simple processing with manual transcript (no Whisper/GPT needed).
    
    Args:
        input_video: Input video path
        output_video: Output video path
        transcript: Manual transcript text
        **kwargs: Config options
        
    Returns:
        True if successful
        
    Example:
        >>> process_video_simple(
        ...     "input.mp4",
        ...     "output.mp4",
        ...     "Hello world this is my video"
        ... )
    """
    pipeline = Pipeline(config=kwargs)
    return pipeline.process(
        input_video=input_video,
        output_video=output_video,
        transcript=transcript,
        use_whisper=False
    )

