"""
Caption Renderer Module

Main caption rendering engine. Applies captions to video with:
- Smart placement (per-row mask scan -- captions go wherever person isn't)
- 2-line centered layout with auto word count
- Coolvetica (regular) + Runethia (emphasis/emotional words)
- Behind-person depth effect (person composited on top of captions)
- Mixed format support (9:16, 16:9, 1:1 -- all auto-detected)
"""

import os
import cv2
import re
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from typing import List, Tuple, Dict, Optional, Any
from pathlib import Path

from .font_manager import FontManager
from .mask_utils import MaskProcessor, MaskInterpolator
from .animator import TextAnimator
from .text_effects import TextEffects
from .caption_formatter import CaptionFormatter
from .hook_renderer import HookRenderer
from .video_utils import VideoUtils, HardwareVideoWriter
from .config import DEFAULT_CONFIG, HOOK_DISPLAY_OVERRIDES


# -----------------------------------------------------------------------------
# SPLIT CAPTION RENDERER (unchanged -- used by split_caption animation only)
# -----------------------------------------------------------------------------
class SplitCaptionRenderer:
    """Split caption renderer with word-by-word highlighting."""

    def __init__(self, font_size: int = 32,
                 font_color: Tuple[int, int, int] = (255, 255, 255),
                 highlight_color: Tuple[int, int, int] = (255, 232, 138),
                 caption_padding: int = 14,
                 font_regular_path: str = '',
                 font_emphasis_path: str = '',
                 emotional_words: Optional[set] = None,
                 emphasis_words: Optional[set] = None):
        self.font_size = font_size
        self.font_color = font_color
        self.highlight_color = highlight_color
        self.caption_padding = caption_padding
        self.zones = None
        self.font = None
        self.font_regular_path = font_regular_path
        self.font_emphasis_path = font_emphasis_path
        self.font_regular = None
        self.font_emphasis = None
        self.emotional_words = emotional_words or set()
        self.emphasis_words = emphasis_words or set()
        self.portrait_mode = False
        self.single_side_mode = False
        self.active_side = 'left'
        self.vertical_captions = False

    def load_fonts(self, font_size: int):
        try:
            self.font_regular = ImageFont.truetype(self.font_regular_path, font_size)
        except Exception:
            self.font_regular = self.font
        try:
            self.font_emphasis = ImageFont.truetype(self.font_emphasis_path, int(font_size * 1.15))
        except Exception:
            self.font_emphasis = self.font_regular

    def get_word_font(self, word: str):
        clean = word.lower().strip('.,!?;:\'"')
        if clean in self.emotional_words or clean in self.emphasis_words:
            return self.font_emphasis or self.font
        return self.font_regular or self.font

    def calculate_locked_zones(self, masks_folder: str, frame_w: int, frame_h: int,
                               total_frames: int, sample_every: int = 10):
        if frame_h > frame_w:
            self.portrait_mode = True
            caption_y = int(frame_h * 0.82)
            left_x = int(frame_w * 0.05)
            left_max = int(frame_w * 0.95)
            right_x = frame_w + 1000
            self.zones = (left_x, left_max, right_x, caption_y)
            return

        left_samples, right_samples = [], []
        scan_y = int(frame_h * 0.42)

        for frame_num in range(1, total_frames, sample_every):
            mask_path = os.path.join(masks_folder, f"mask_{frame_num:05d}.npy")
            if not os.path.exists(mask_path):
                continue
            mask = np.load(mask_path)
            if mask.shape[0] != frame_h or mask.shape[1] != frame_w:
                mask = cv2.resize(mask, (frame_w, frame_h), interpolation=cv2.INTER_NEAREST)
            band = mask[max(0, scan_y-50):min(frame_h, scan_y+50), :]
            col = band.mean(axis=0)
            pl, pr = int(frame_w * 0.38), int(frame_w * 0.72)
            for x in range(frame_w):
                if col[x] > 15:
                    pl = x
                    break
            for x in range(frame_w - 1, -1, -1):
                if col[x] > 15:
                    pr = x
                    break
            if pr - pl > frame_w * 0.15:
                left_samples.append(pl)
                right_samples.append(pr)

        if left_samples:
            avg_left = int(np.median(left_samples))
            avg_right = int(np.median(right_samples))
        else:
            avg_left = int(frame_w * 0.38)
            avg_right = int(frame_w * 0.72)

        gap = self.caption_padding
        left_x = int(frame_w * 0.05)
        left_max = max(left_x + 50, avg_left - gap)
        if left_x >= left_max:
            left_x = int(frame_w * 0.05)
            left_max = int(frame_w * 0.40)
        right_x = min(avg_right + gap, int(frame_w * 0.90))
        caption_y = max(self.font_size, min(int(frame_h * 0.42) - self.font_size // 2,
                                            frame_h - self.font_size - 10))
        if self.single_side_mode:
            left_space = left_max - left_x
            right_space = frame_w - right_x
            self.active_side = 'left' if left_space >= right_space else 'right'
        self.zones = (left_x, left_max, right_x, caption_y)

    def get_text_width(self, draw, text: str) -> int:
        bbox = draw.textbbox((0, 0), text, font=self.font)
        return bbox[2] - bbox[0]

    def draw_word(self, draw, word, x, y, color):
        # Main text only - no outline/shadow
        color_tuple = tuple(color) if isinstance(color, list) else color
        draw.text((x, y), word, font=self.font, fill=color_tuple + (255,))
        return self.get_text_width(draw, word + " ")

    def render_split_captions(self, bg_pil, caption_text, current_word_idx,
                              start_word_idx, mask_uint8=None):
        if self.font is None:
            return bg_pil
        frame_w, frame_h = bg_pil.size
        if self.zones is not None:
            left_x, left_max, right_x, caption_y = self.zones
            active_side = self.active_side
        else:
            return bg_pil

        cap_layer = Image.new("RGBA", bg_pil.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(cap_layer)
        all_words = caption_text.strip().split()
        visible_count = max(0, min(current_word_idx - start_word_idx + 1, len(all_words)))
        last_vis = visible_count - 1

        if self.portrait_mode:
            visible_words = all_words[:visible_count]
            total_w = sum(self.get_text_width(draw, w + " ") for w in visible_words)
            x = max(left_x, (frame_w - total_w) // 2)
            for i, word in enumerate(visible_words):
                color = self.highlight_color if i == last_vis else self.font_color
                w = self.draw_word(draw, word, x, caption_y, color)
                x += w
        else:
            words_l, words_r = self._auto_split(caption_text)
            left_vis = min(visible_count, len(words_l))
            right_vis = max(0, visible_count - len(words_l))
            x = left_x
            for i, word in enumerate(words_l[:left_vis]):
                w = self.get_text_width(draw, word + " ")
                if x + w > left_max:
                    break
                color = self.highlight_color if i == last_vis else self.font_color
                self.draw_word(draw, word, x, caption_y, color)
                x += w
            x = right_x
            for i, word in enumerate(words_r[:right_vis]):
                w = self.get_text_width(draw, word + " ")
                if x + w > bg_pil.size[0] - 8:
                    break
                gi = len(words_l) + i
                color = self.highlight_color if gi == last_vis else self.font_color
                self.draw_word(draw, word, x, caption_y, color)
                x += w

        return Image.alpha_composite(bg_pil, cap_layer)

    def _auto_split(self, sentence):
        words = sentence.strip().split()
        if len(words) <= 1:
            return words, []
        total = sum(len(w) for w in words)
        target = total / 2
        best_split, best_diff, running = 1, float("inf"), 0
        for i, w in enumerate(words):
            running += len(w)
            diff = abs(running - target)
            if diff < best_diff:
                best_diff = diff
                best_split = i + 1
        return words[:best_split], words[best_split:]


# -----------------------------------------------------------------------------
# MAIN CAPTION RENDERER
# -----------------------------------------------------------------------------
class CaptionRenderer:
    """
    Main caption rendering engine.

    Key behaviours for centered_styled mode:
      • Smart placement  -- per-row mask scan picks the emptiest horizontal band
      • 2-line layout    -- auto word split, balanced lines
      • Dual font        -- Coolvetica (regular) / Runethia (emphasis+emotional)
      • Depth effect     -- person composited ON TOP of captions
      • Mixed format     -- auto-adapts font size for any aspect ratio
    """

    def __init__(self,
                 font_size: int = 72,
                 transparency: float = 0.95,
                 color: Tuple[int, int, int] = (255, 255, 255),
                 position: str = 'center',
                 animation: str = 'centered_styled',
                 mask_erode_pixels: int = 0,
                 mask_blur_radius: int = 0,
                 adaptive_erosion: bool = True,
                 smart_placement: bool = True,
                 auto_words_per_line: bool = True,
                 max_hook_words: int = 0,
                 exclusive_hooks: bool = False,
                 hw_encode: bool = True,
                 hw_encode_quality: str = 'medium',
                 frame_skip: int = 5,
                 split_caption_mode: bool = False,
                 **kwargs):

        self.font_size = font_size
        self.transparency = transparency
        self.color = color
        self.position = position
        self.animation = animation
        self.left_margin_pct = 0.06

        # Components
        self.font_manager = FontManager()
        self.mask_processor = MaskProcessor(
            erode_pixels=mask_erode_pixels,
            blur_radius=mask_blur_radius,
            adaptive=adaptive_erosion
        )
        self.animator = TextAnimator()
        self.text_effects = TextEffects()
        self.caption_formatter = CaptionFormatter()

        # Store color configuration for hook, emphasis, and regular text
        self.hook_color = kwargs.get('hook_color', (255, 50, 50))  # default bright red
        self.emphasis_color = kwargs.get('emphasis_color', (255, 200, 80))  # default gold
        self.regular_color = kwargs.get('regular_color', (255, 255, 255))  # default white
        
        # Initialize hook renderer with custom hook color
        self.hook_renderer = HookRenderer(hook_color=self.hook_color)

        self.adaptive_erosion = adaptive_erosion
        self.smart_placement = smart_placement
        self.auto_words_per_line = auto_words_per_line
        self.max_hook_words = max_hook_words
        self.exclusive_hooks = exclusive_hooks

        self.split_caption_mode = split_caption_mode or (animation == 'split_caption')
        self.single_side_mode = kwargs.get('single_side_mode', False)

        self.split_renderer = None
        if self.split_caption_mode:
            self.split_renderer = SplitCaptionRenderer(
                font_size=font_size,
                font_color=color,
                highlight_color=kwargs.get('highlight_color', (255, 232, 138)),
                font_regular_path=kwargs.get('font_regular', ''),
                font_emphasis_path=kwargs.get('font_emphasis', ''),
                emotional_words=set(kwargs.get('emotional_words', [])),
                emphasis_words=set(kwargs.get('emphasis_words', [])),
            )
            self.split_renderer.single_side_mode = self.single_side_mode
            self.split_renderer.vertical_captions = kwargs.get('vertical_captions', False)

        self.styled_mode = (animation in ['styled', 'styled_layout', 'caption_renderer'])
        self.centered_styled_mode = (animation == 'centered_styled')
        self.vertical_smart_mode = (animation == 'vertical_smart')

        # Centered-styled config
        self.y_position = kwargs.get('y_position', 0.72)
        self.line_spacing = kwargs.get('line_spacing', 10)
        self.centered_font_regular = None
        self.centered_font_emphasis = None
        self.centered_font_regular_path = kwargs.get('font_regular', '')
        self.centered_font_emphasis_path = kwargs.get('font_emphasis', '')

        # Vertical-smart font cache (loaded once, reused every frame)
        self._vs_font_line1 = None
        self._vs_font_line2 = None
        self._vs_font_path = None
        self._vs_font_size_cached = None  # invalidate if font_size changes

        # Suppress SmartZone spam -- only print when position changes
        self._last_smartzone_position = None
        
        # Validate font paths
        if self.centered_font_regular_path and not os.path.exists(self.centered_font_regular_path):
            print(f"[WARNING] Regular font not found: {self.centered_font_regular_path}")
            self.centered_font_regular_path = ''
        if self.centered_font_emphasis_path and not os.path.exists(self.centered_font_emphasis_path):
            print(f"[WARNING] Emphasis font not found: {self.centered_font_emphasis_path}")
            self.centered_font_emphasis_path = ''
        self.centered_emotional_words = set(w.lower() for w in kwargs.get('emotional_words', []))
        self.centered_emphasis_words = set(w.lower() for w in kwargs.get('emphasis_words', []))

        # Styled-mode multi-font paths
        self.styled_fonts = {}
        self.font_paths = {
            'regular':    ['coolvetica rg.otf', 'C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf'],
            'bold':       ['coolvetica rg.otf', 'C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
            'extra-bold': ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'],
            'cursive':    ['Runethia.otf', 'Runethia.ttf', 'C:/Windows/Fonts/segoepr.ttf'],
        }
        self.emotional_words = {
            'believe', 'dream', 'love', 'hope', 'passion', 'amazing',
            'incredible', 'beautiful', 'wonderful', 'fantastic', 'awesome'
        }

        self.hw_encode = hw_encode
        self.hw_encode_quality = hw_encode_quality
        self.frame_skip = frame_skip

        self.anim_params = {
            'fade_duration': 30,
            'slide_duration': 45,
            'slide_distance': 200,
            'fade_out_duration': 20,
        }
        
        # Constants for layout calculations
        self._SMARTY_SEARCH_MARGIN = 0.10      # 10% margin for Y search range
        self._SMARTY_BLOCK_MULT = 2.8          # Block height = font_size * 2.8
        self._MAX_CAPTION_HEIGHT_PCT = 0.30    # Max 30% of frame height
        self._MIN_FONT_SIZE = 24               # Minimum font size
        self._TARGET_WIDTH_PCT = 0.70          # Target 70% of frame width for text
        self._WORD_SPACING_MULT = 0.18         # Spacing = font_size * 0.18
        self._SHADOW_OFFSETS = [(-2,-2),(2,-2),(-2,2),(2,2),(3,3)]  # Shadow pattern

    # -------------------------------------------------------------------------
    # PUBLIC: apply_captions
    # -------------------------------------------------------------------------
    def apply_captions(self, input_video: str, masks_folder: str,
                       output_video: str,
                       transcript: Optional[str] = None,
                       timed_captions: Optional[List[Tuple]] = None,
                       styled_words: Optional[List[Dict]] = None,
                       words_per_caption: int = 4,
                       seconds_per_caption: float = 1.5) -> bool:

        print(f"\n{'='*70}\nAPPLYING CAPTIONS\n{'='*70}")
        tc_count = len(timed_captions) if timed_captions else 0
        sw_count = len(styled_words) if styled_words else 0
        print(f"[CaptionRenderer] timed_captions={tc_count}, styled_words={sw_count}, animation={getattr(self, 'animation', '?')}")
        if timed_captions and tc_count > 0:
            first = timed_captions[0]
            print(f"[CaptionRenderer] First caption: start={first[0]:.2f} end={first[1]:.2f} lines={first[2][:1] if len(first) > 2 else '?'}")

        if not os.path.exists(masks_folder):
            print(f"ERROR: Masks folder not found: {masks_folder}")
            return False

        fps, width, height, total_frames = self._load_metadata(masks_folder)

        # -- One-time mask validation ---------------------------------------
        _sample_mask_path = os.path.join(masks_folder, "mask_00001.npy")
        if os.path.exists(_sample_mask_path):
            _sm = np.load(_sample_mask_path)
            _nonzero = int(np.sum(_sm > 128))
            print(f"[MaskCheck] mask_00001.npy: shape={_sm.shape}, dtype={_sm.dtype}, "
                  f"pixels>128={_nonzero}/{_sm.size} ({100*_nonzero/_sm.size:.1f}%)")
            if _nonzero == 0:
                print("[MaskCheck] WARNING: first mask is all zeros -- person segmentation may have failed")
            else:
                print("[MaskCheck] OK -- masks contain real person data, depth effect will work")
        else:
            print(f"[MaskCheck] WARNING: {_sample_mask_path} not found -- check mask generation")

        # -- Video info + rotation ------------------------------------------
        video_rotation = 0
        if os.path.exists(input_video):
            video_info = VideoUtils.get_video_info(input_video)
            video_rotation = video_info.get('rotation', 0)
            rotation_abs = abs(video_rotation)
            if rotation_abs in [90, 270]:
                actual_width  = video_info['display_width']
                actual_height = video_info['display_height']
            else:
                actual_width  = video_info['width']
                actual_height = video_info['height']
            actual_fps = video_info['fps']
            if actual_width != width or actual_height != height:
                width, height = actual_width, actual_height
            if abs(actual_fps - fps) > 0.1:
                fps = actual_fps

        # -- Font size -- adapts to ANY aspect ratio -------------------------
        aspect_ratio = width / height if height > 0 else 1.0
        self.left_margin_pct, font_size, layout_type = self._calc_layout(
            aspect_ratio, width, height
        )
        print(f"[Format] {width}x{height} | AR={aspect_ratio:.2f} | {layout_type} | font={font_size}px")

        # -- Split caption setup --------------------------------------------
        if self.split_caption_mode and self.split_renderer:
            self.split_renderer.font = self.font_manager.get_font('bold', self.font_size)
            self.split_renderer.font_size = self.font_size
            self.split_renderer.load_fonts(self.font_size)
            self.split_renderer.calculate_locked_zones(masks_folder, width, height, total_frames)

        # -- Smart position (left/center/right) for non-centered-styled ----
        smart_position = self.position
        if self.smart_placement and not self.centered_styled_mode:
            smart_position = self._analyze_sample_positions(masks_folder, width, height, total_frames)
            print(f"[SMART] Position: {smart_position.upper()}")

        # -- Auto words per line --------------------------------------------
        smart_words_per_line = words_per_caption
        if self.auto_words_per_line and transcript:
            smart_words_per_line = self._auto_words_per_line(transcript, width, height, font_size)
            print(f"[AUTO] Words per line: {smart_words_per_line}")

        # -- Build timed captions -------------------------------------------
        if timed_captions is None and transcript:
            timed_captions = self.caption_formatter.split_transcript_to_captions(
                transcript, smart_words_per_line, seconds_per_caption
            )
        elif timed_captions is None:
            print("ERROR: transcript or timed_captions required")
            return False

        hook_phrases = self._collect_hook_phrases(
            timed_captions, styled_words, max_words_per_hook=self.max_hook_words
        )
        if hook_phrases:
            print(f"[HookPhrases] Collected {len(hook_phrases)} hook phrases:")
            for hp in hook_phrases:
                print(f"    {hp[0]:.2f}-{hp[1]:.2f}: '{hp[2]}'")
        else:
            print(f"[HookPhrases] No hook phrases collected (max_hook_words={self.max_hook_words})")

        # -- Open video + setup writer --------------------------------------
        cap = cv2.VideoCapture(input_video)
        if not cap.isOpened():
            print(f"ERROR: Cannot open: {input_video}")
            return False

        # Disable OpenCV auto-rotation so we can apply it manually via _rotate_frame.
        # Without this, OpenCV auto-applies the rotation metadata and our manual
        # rotation would double-rotate the frame producing wrong orientation.
        try:
            cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 0)
        except Exception:
            pass  # Older OpenCV builds don't have this property

        actual_fps = cap.get(cv2.CAP_PROP_FPS) or fps
        out = self._setup_writer(output_video, width, height, actual_fps)
        if out is None:
            cap.release()
            return False

        print(f"Processing {total_frames} frames...")

        mask_interpolator = MaskInterpolator(frame_skip=self.frame_skip) if self.frame_skip > 1 else None
        frame_count = 0
        last_mask = None

        # -- Per-frame dynamic position (updates every 30 frames = 1 sec) -
        dynamic_position = smart_position
        position_update_interval = 30  # Update every 30 frames (1 second at 30fps)
        self._last_smartzone_position = None  # Reset per-run
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frame_count += 1

                if frame_count % 60 == 0:
                    pct = (frame_count / total_frames) * 100
                    print(f"  {frame_count}/{total_frames} ({pct:.1f}%)")

                # Rotation
                frame = self._rotate_frame(frame, video_rotation)
                # Update width/height to match actual rotated frame dimensions
                height, width = frame.shape[:2]

                # Load mask
                mask_uint8, last_mask = self._load_mask(
                    masks_folder, frame_count, width, height,
                    mask_interpolator, last_mask
                )
                # Masks are generated with OpenCV auto-rotation (display orientation),
                # so they're already correctly oriented -- no rotation needed here.
                if mask_uint8.shape[:2] != (height, width):
                    mask_uint8 = cv2.resize(mask_uint8, (width, height),
                                            interpolation=cv2.INTER_NEAREST)
                
                # -- Update dynamic position every 10 frames ----------------
                if self.smart_placement and not self.centered_styled_mode:
                    if frame_count % position_update_interval == 1:
                        new_position = self.mask_processor.analyze_placement(
                            mask_uint8, width, height
                        )
                        if new_position != dynamic_position:
                            print(f"[SmartPos] Frame {frame_count}: {dynamic_position} -> {new_position}")
                            dynamic_position = new_position

                current_time = frame_count / actual_fps
                background = frame.copy()

                # Hook background text
                hook_active = False
                for h_start, h_end, h_text in hook_phrases:
                    if h_start <= current_time <= h_end:
                        hook_layer = self.hook_renderer.create_hook_layer(
                            (height, width), h_text, width, height)
                        background = self.hook_renderer.composite_hook(
                            background, hook_layer, mask_uint8)
                        hook_active = True
                        break

                # -- Render captions ----------------------------------------
                if self.animation == 'marquee_scroll':
                    background = self._draw_marquee_caption_on_frame(
                        background, timed_captions, current_time, actual_fps,
                        mask_uint8, width, height,
                        self.mask_processor.calculate_font_scale(mask_uint8, self.font_size)
                    )

                elif self.centered_styled_mode:
                    background = self._draw_centered_styled_captions(
                        background, timed_captions, current_time,
                        width, height, mask_uint8=mask_uint8
                    )
                
                elif self.vertical_smart_mode:
                    # _draw_vertical_smart_captions already applies depth effect internally
                    background = self._draw_vertical_smart_captions(
                        background, timed_captions, current_time,
                        width, height, mask_uint8=mask_uint8,
                        position_hint=dynamic_position,
                        styled_words=styled_words
                    )

                elif self.styled_mode:
                    background = self._draw_styled_captions_on_frame(
                        background, timed_captions, current_time, actual_fps,
                        width, height, hook_active
                    )

                else:
                    bg_rgb = cv2.cvtColor(background, cv2.COLOR_BGR2RGB)
                    bg_pil = Image.fromarray(bg_rgb).convert('RGBA')
                    if not (self.exclusive_hooks and hook_active):
                        bg_pil = self._draw_captions_on_frame(
                            bg_pil, timed_captions, current_time, actual_fps,
                            mask_uint8, width, height, dynamic_position,
                            self.mask_processor.calculate_font_scale(mask_uint8, self.font_size),
                            styled_words
                        )
                    
                    # -- DEPTH EFFECT: Person composited ON TOP of captions ----
                    if mask_uint8 is not None:
                        if mask_uint8.shape[:2] != (height, width):
                            mask_resized = cv2.resize(mask_uint8, (width, height),
                                                      interpolation=cv2.INTER_LINEAR)
                        else:
                            mask_resized = mask_uint8
                        # Build person layer: original pixels, mask as alpha
                        person_layer = Image.fromarray(bg_rgb).convert('RGBA')
                        mask_pil = Image.fromarray(mask_resized).convert('L')
                        person_layer.putalpha(mask_pil)
                        # Composite person ON TOP -> appears in front of captions
                        bg_pil = Image.alpha_composite(bg_pil, person_layer)
                    
                    background = cv2.cvtColor(np.array(bg_pil.convert('RGB')), cv2.COLOR_RGB2BGR)

                if self.vertical_smart_mode and frame_count % 30 == 1:
                    mask_sum = int(np.sum(mask_uint8)) if mask_uint8 is not None else -1
                    compositing_ran = mask_uint8 is not None and mask_sum > 0
                    print(f"[DepthDebug] Frame {frame_count}: mask_sum={mask_sum}, "
                          f"compositing={'YES' if compositing_ran else 'NO -- mask empty or None'}")

                write_ok = False
                if hasattr(out, 'write_frame'):
                    write_ok = out.write_frame(background)
                else:
                    out.write(background)
                    write_ok = True
                
                # Check if writer failed mid-stream
                if not write_ok and self.hw_encode:
                    print(f"\n[HW FAIL] Hardware encoder failed at frame {frame_count}, switching to software...")
                    cap.release()
                    if hasattr(out, 'release'):
                        out.release()
                    # Clean up partial file
                    if os.path.exists(output_video):
                        try:
                            os.remove(output_video)
                        except:
                            pass
                    self.hw_encode = False
                    return self.apply_captions(
                        input_video=input_video,
                        masks_folder=masks_folder,
                        output_video=output_video,
                        transcript=transcript,
                        timed_captions=timed_captions,
                        styled_words=styled_words,
                        words_per_caption=words_per_caption,
                        seconds_per_caption=seconds_per_caption
                    )

            cap.release()
            
            # Release writer (both HardwareVideoWriter and OpenCV VideoWriter have release())
            if hasattr(out, 'release'):
                out.release()
            
            # Check if output file was actually created
            file_exists = os.path.exists(output_video)
            file_size = os.path.getsize(output_video) if file_exists else 0
            writer_success = file_exists and file_size > 0
            
            if not writer_success:
                print(f"[DEBUG] File exists: {file_exists}, Size: {file_size} bytes")
                print(f"[DEBUG] Output path: {os.path.abspath(output_video)}")

            # Check if hardware encoding failed - retry with software if needed
            if not writer_success and self.hw_encode:
                print(f"\n[HW FAIL] Hardware encoding failed, retrying with software encoding...")
                self.hw_encode = False  # Disable HW encode for retry
                return self.apply_captions(
                    input_video=input_video,
                    masks_folder=masks_folder,
                    output_video=output_video,
                    transcript=transcript,
                    timed_captions=timed_captions,
                    styled_words=styled_words,
                    words_per_caption=words_per_caption,
                    seconds_per_caption=seconds_per_caption
                )

            if writer_success:
                print(f"\n[OK] Done: {output_video} ({file_size/1024/1024:.1f} MB)")
                return True
            else:
                print(f"\n[FAIL] Failed to write output video")
                return False

        except Exception as e:
            print(f"\n[ERROR] {e}")
            import traceback; traceback.print_exc()
            cap.release()
            if hasattr(out, 'release'):
                out.release()
            return False

    # -------------------------------------------------------------------------
    # CORE: _draw_centered_styled_captions
    # THE main function -- all 3 features live here
    # -------------------------------------------------------------------------
    def _draw_centered_styled_captions(self,
                                       frame: np.ndarray,
                                       timed_captions: List[Tuple],
                                       current_time: float,
                                       width: int,
                                       height: int,
                                       mask_uint8: Optional[np.ndarray] = None) -> np.ndarray:
        """
        Render 2-line centered captions with:
          1. Smart placement  -- per-row mask scan finds emptiest band
          2. Dual font        -- Coolvetica regular / Runethia for emphasis+emotional
          3. Depth effect     -- person composited ON TOP of caption layer
        """

        # -- Find active caption -------------------------------------------
        current_caption = None
        for start, end, text in timed_captions:
            if start <= current_time < end:
                current_caption = ' '.join(text) if isinstance(text, list) else str(text)
                break
        if not current_caption:
            return frame

        # -- Convert frame to PIL ------------------------------------------
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb).convert('RGBA')

        # -- Load fonts if needed ------------------------------------------
        font_size = self.font_size
        if self.centered_font_regular is None:
            self._load_centered_fonts(font_size)

        # -- AUTO WORD SPLIT -- balanced 2 lines ---------------------------
        words = current_caption.strip().split()
        line1_words, line2_words = self._split_into_two_lines(words)

        # -- SMART PLACEMENT -- per-row mask scan ---------------------------
        # Scans every row of the mask, smooths over caption block height,
        # picks the band with the least person coverage.
        center_y = self._find_best_y(mask_uint8, height, font_size)

        # -- Measure block height (shrink font if too tall) ----------------
        layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw  = ImageDraw.Draw(layer)

        for _ in range(5):
            line1_h = self._measure_line_h(draw, line1_words)
            line2_h = self._measure_line_h(draw, line2_words)
            total_block_h = line1_h + (self.line_spacing + line2_h if line2_words else 0)

            if total_block_h <= height * self._MAX_CAPTION_HEIGHT_PCT or font_size <= self._MIN_FONT_SIZE:
                break
            font_size = max(self._MIN_FONT_SIZE, int(font_size * 0.9))
            self._load_centered_fonts(font_size)
            layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            draw  = ImageDraw.Draw(layer)

        # -- Draw both lines centered on center_y -------------------------
        base_y = center_y - total_block_h // 2
        # Safety: keep caption inside frame
        base_y = max(10, min(base_y, height - total_block_h - 10))

        self._draw_centered_line(draw, line1_words, base_y, width, font_size)
        if line2_words:
            self._draw_centered_line(
                draw, line2_words, base_y + line1_h + self.line_spacing, width, font_size
            )

        # -- Step 1: composite captions over frame -------------------------
        result = Image.alpha_composite(img, layer)

        # -- Step 2: DEPTH EFFECT -- person on top of captions -------------
        if mask_uint8 is not None:
            if mask_uint8.shape[:2] != (height, width):
                mask_resized = cv2.resize(mask_uint8, (width, height),
                                          interpolation=cv2.INTER_LINEAR)
            else:
                mask_resized = mask_uint8

            # Build person layer: original pixels, mask as alpha
            person_layer = Image.fromarray(rgb).convert('RGBA')
            mask_pil = Image.fromarray(mask_resized).convert('L')
            person_layer.putalpha(mask_pil)

            # Person composited ON TOP -> appears in front of captions
            result = Image.alpha_composite(result, person_layer)

        # -- Restore font size if it was shrunk this frame -----------------
        if font_size != self.font_size:
            self._load_centered_fonts(self.font_size)

        return cv2.cvtColor(np.array(result.convert('RGB')), cv2.COLOR_RGB2BGR)

    # -------------------------------------------------------------------------
    # HELPERS for centered_styled
    # -------------------------------------------------------------------------
    def _find_best_y(self, mask_uint8: Optional[np.ndarray],
                     height: int, font_size: int) -> int:
        """
        Per-row mask scan: convolve row coverage over caption block height,
        return the center-y of the band with the least person coverage.
        Restricted to 10%-90% of frame height.
        """
        if mask_uint8 is None:
            return int(height * self.y_position)

        m = mask_uint8.astype(np.float32)

        # Estimate block height = 2 lines + spacing
        block_h = max(20, min(int(font_size * self._SMARTY_BLOCK_MULT), height // 3))

        # Per-row fraction of pixels occupied by person
        row_coverage = np.mean(m > 128, axis=1)          # shape: (height,)

        # Smooth over block_h rows -> average coverage per band
        kernel       = np.ones(block_h) / block_h
        band_coverage = np.convolve(row_coverage, kernel, mode='same')

        lo = int(height * self._SMARTY_SEARCH_MARGIN)
        hi = int(height * (1.0 - self._SMARTY_SEARCH_MARGIN))
        search = band_coverage[lo:hi]

        best_offset  = int(np.argmin(search))
        best_center  = lo + best_offset

        # Clamp so caption block fits inside frame
        half = block_h // 2
        center_y = max(lo + half, min(best_center, hi - half))

        coverage_val = band_coverage[best_center]
        # Rate-limited debug output (print every ~1 second at 30fps)
        if not hasattr(self, '_smarty_frame_counter'):
            self._smarty_frame_counter = 0
        self._smarty_frame_counter += 1
        if self._smarty_frame_counter % 30 == 1:
            print(f"[SmartY] center_y={center_y}px  person_coverage={coverage_val:.2f}")
        return center_y

    def _split_into_two_lines(self, words: List[str]) -> Tuple[List[str], List[str]]:
        """
        Balanced 2-line split.
        For short captions (<=3 words): put all on line 1.
        Otherwise: split roughly in half by character count.
        """
        if len(words) <= 3:
            return words, []

        total_chars = sum(len(w) for w in words)
        target = total_chars / 2
        running = 0
        best_split = max(1, len(words) // 2)
        best_diff = float('inf')

        for i, w in enumerate(words):
            running += len(w)
            diff = abs(running - target)
            if diff < best_diff:
                best_diff = diff
                best_split = i + 1

        return words[:best_split], words[best_split:]

    def _measure_line_h(self, draw: ImageDraw.Draw, word_list: List[str]) -> int:
        """Max text height across all words in line."""
        if not word_list:
            return 0
        return max(
            draw.textbbox((0, 0), w, font=self._get_centered_word_font(w))[3]
            for w in word_list
        )

    def _draw_centered_line(self, draw: ImageDraw.Draw, word_list: List[str],
                            y: int, width: int, font_size: int):
        """Draw one line of words, horizontally centered, Coolvetica+Runethia."""
        if not word_list:
            return

        spacing = max(4, int(font_size * self._WORD_SPACING_MULT))

        # Measure total width
        word_data = []
        total_w = 0
        for w in word_list:
            font = self._get_centered_word_font(w)
            bbox = draw.textbbox((0, 0), w, font=font)
            ww = bbox[2] - bbox[0]
            word_data.append((w, font, ww))
            total_w += ww
        total_w += spacing * (len(word_list) - 1)

        x = max(10, (width - total_w) // 2)

        for w, font, ww in word_data:
            # Main text only - no outline/shadow
            draw.text((x, y), w, font=font, fill=(255, 255, 255, 255))
            x += ww + spacing

    def _auto_words_per_line(self, transcript: str,
                              width: int, height: int, font_size: int) -> int:
        """
        Auto-detect ideal words per line based on:
        - Average word length in transcript
        - Available frame width
        - Current font size
        Target: fill ~70% of frame width per line.
        """
        words = transcript.split()
        if not words:
            return 4

        avg_char_w = font_size * 0.55       # approximate px per character
        avg_word_len = sum(len(w) for w in words) / len(words)
        avg_word_px = avg_char_w * avg_word_len + font_size * 0.2  # + spacing

        target_px = width * self._TARGET_WIDTH_PCT
        ideal = max(2, min(6, round(target_px / avg_word_px)))

        print(f"[AUTO] avg_word={avg_word_len:.1f}chars  target_width={int(target_px)}px  -> {ideal} words/line")
        return ideal

    # -------------------------------------------------------------------------
    # VERTICAL SMART: 2-line vertical captions with smart Y placement
    # -------------------------------------------------------------------------
    def _draw_vertical_smart_captions(self,
                                       frame: np.ndarray,
                                       timed_captions: List[Tuple],
                                       current_time: float,
                                       width: int,
                                       height: int,
                                       mask_uint8: Optional[np.ndarray] = None,
                                       position_hint: str = 'center',
                                       styled_words: Optional[List[Dict]] = None) -> np.ndarray:
        """
        Render 2-line vertical-style captions with smart Y placement.
        
        Layout:
          - Line 1: Coolvetica medium size, regular weight
          - Line 2: Coolvetica 2x size, heavy bold visual weight
          - Behind-person effect: person composited ON TOP of captions as final step
          - Smart placement: finds emptiest left/right side
        """
        # Find active caption
        current_caption = None
        for start, end, text in timed_captions:
            if start <= current_time < end:
                current_caption = ' '.join(text) if isinstance(text, list) else str(text)
                break
        if not current_caption:
            return frame
        
        # Convert frame to PIL
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb).convert('RGBA')
        # Use actual frame dimensions (rotation may have changed them)
        height, width = rgb.shape[:2]

        # -- FONT LOADING (cached -- loaded once, reused every frame) ---------
        # Line 1: Coolvetica regular, Line 2: Coolvetica at 1.5x (heavy visual weight)
        line1_size = self.font_size
        line2_size = min(75, int(line1_size * 1.5))  # cap line 2 at 75px

        if self._vs_font_line1 is None or self._vs_font_size_cached != line1_size:
            # Line 1: Coolvetica regular
            _regular_candidates = [
                self.centered_font_regular_path,
                'fonts/Coolvetica Rg.otf',
                os.path.join(os.path.dirname(__file__), '..', 'fonts', 'Coolvetica Rg.otf'),
            ]
            # Line 2: Runethia cursive
            _emphasis_candidates = [
                getattr(self, 'centered_font_emphasis_path', None) or None,
                'fonts/Runethia.otf',
                os.path.join(os.path.dirname(__file__), '..', 'fonts', 'Runethia.otf'),
                os.path.abspath('fonts/Runethia.otf'),
            ]
            self._vs_font_path = next((p for p in _regular_candidates if p and os.path.exists(p)), None)
            _emphasis_path = next((p for p in _emphasis_candidates if p and os.path.exists(p)), None) or self._vs_font_path
            print(f"[VerticalSmart] Emphasis path resolved: {_emphasis_path}")

            try:
                if self._vs_font_path:
                    self._vs_font_line1 = ImageFont.truetype(self._vs_font_path, line1_size)
                else:
                    self._vs_font_line1 = ImageFont.load_default()
                if _emphasis_path:
                    self._vs_font_line2 = ImageFont.truetype(_emphasis_path, line2_size)
                else:
                    self._vs_font_line2 = ImageFont.load_default()
                print(f"[VerticalSmart] Line1={self._vs_font_path or 'default'} {line1_size}px | Line2={_emphasis_path or 'default'} {line2_size}px")
            except Exception as e:
                self._vs_font_line1 = ImageFont.load_default()
                self._vs_font_line2 = ImageFont.load_default()
                print(f"[VerticalSmart] Font load FAILED: {e}")

            self._vs_font_size_cached = line1_size

        font_line1 = self._vs_font_line1
        font_line2 = self._vs_font_line2
        font_path = self._vs_font_path  # available for _fit_font on every frame

        # Split into 2 lines
        words = current_caption.strip().split()
        mid = max(1, len(words) // 2)
        line1_text = ' '.join(words[:mid])
        line2_text = ' '.join(words[mid:])
        
        # -- SMART PLACEMENT: pick emptiest horizontal zone -------------------
        # Divide frame into left (0-40%), center (30-70%), right (60-100%).
        # Pick the zone with least person coverage, place captions there.
        # Depth effect still restores person on top wherever they overlap.
        horizontal_align = 'center'
        center_y = int(height * self.y_position)

        if mask_uint8 is not None and self.smart_placement:
            m = mask_uint8.astype(np.float32)
            h, w = m.shape

            left_zone   = m[:, :int(w * 0.40)]
            center_zone = m[:, int(w * 0.30):int(w * 0.70)]
            right_zone  = m[:, int(w * 0.60):]

            left_cov   = float(np.mean(left_zone   > 128))
            center_cov = float(np.mean(center_zone > 128))
            right_cov  = float(np.mean(right_zone  > 128))

            cov = {'left': left_cov, 'center': center_cov, 'right': right_cov}

            # Find absolute best position
            best = min(cov, key=lambda k: cov[k])

            # Hysteresis: only switch away from current position if the
            # new winner is clearly better (≥7% less coverage).
            # This prevents rapid left<->right flipping when values are close.
            SWITCH_MARGIN = 0.07
            current = self._last_smartzone_position or position_hint or best
            if current in cov and best != current:
                if cov[current] - cov[best] < SWITCH_MARGIN:
                    best = current   # stay put -- difference not significant enough

            horizontal_align = best

            # Y position: respect user's setting (self.y_position)
            # Only apply smart Y adjustments if using default position (0.82)
            # User's explicit Y position from slider takes priority
            if self.y_position == 0.82:  # Default value - apply smart Y
                if horizontal_align in ('left', 'right'):
                    center_y = int(h * 0.30)   # upper area -- empty corner
                else:
                    center_y = int(h * 0.75)   # lower area for centered text
            # else: keep center_y as user's setting (already set above)

            if horizontal_align != self._last_smartzone_position:
                print(f"[SmartZone] left={left_cov:.2f} center={center_cov:.2f} "
                      f"right={right_cov:.2f} -> {horizontal_align.upper()} at y={center_y}px")
                self._last_smartzone_position = horizontal_align
        
        # -- DRAW CAPTIONS ---------------------------------------------------
        margin = int(width * 0.08)  # 8% margin from edge

        # Zone width: for left/right sides use ~1/3 of frame minus margins; center uses full width
        if horizontal_align in ('left', 'right'):
            zone_w = width // 3 - margin
        else:
            zone_w = width - margin * 2

        # Scale down fonts if either line overflows the zone width
        def _fit_font(text, font_size, path):
            while font_size >= 12:
                try:
                    f = ImageFont.truetype(path, font_size) if path and os.path.exists(path) else ImageFont.load_default()
                except Exception:
                    f = ImageFont.load_default()
                tmp_img = Image.new('RGBA', (1, 1))
                tmp_draw = ImageDraw.Draw(tmp_img)
                bb = tmp_draw.textbbox((0, 0), text, font=f)
                if (bb[2] - bb[0]) <= zone_w:
                    return f, font_size
                font_size -= 2
            try:
                return (ImageFont.truetype(path, 12), 12) if path and os.path.exists(path) else (ImageFont.load_default(), 12)
            except Exception:
                return ImageFont.load_default(), 12

        font_line1, line1_size = _fit_font(line1_text, line1_size, font_path)
        font_line2, line2_size = _fit_font(line2_text, line2_size, font_path)

        layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)

        # Measure final text sizes
        bbox1 = draw.textbbox((0, 0), line1_text, font=font_line1)
        bbox2 = draw.textbbox((0, 0), line2_text, font=font_line2)

        text1_w = bbox1[2] - bbox1[0]
        text1_h = bbox1[3] - bbox1[1]
        text2_w = bbox2[2] - bbox2[0]
        text2_h = bbox2[3] - bbox2[1]

        # Position based on horizontal alignment
        if horizontal_align == 'left':
            x1 = margin
            x2 = margin
        elif horizontal_align == 'right':
            x1 = width - text1_w - margin
            x2 = width - text2_w - margin
        else:  # center
            x1 = (width - text1_w) // 2
            x2 = (width - text2_w) // 2

        # Stack vertically: Line 1 on top, Line 2 below
        total_height = text1_h + self.line_spacing + text2_h

        # Clamp: entire block must stay within frame (never overflow bottom)
        max_base_y = height - total_height - margin
        base_y = max(margin, min(center_y - total_height // 2, max_base_y))

        y1 = base_y
        y2 = base_y + text1_h + self.line_spacing

        # Get colors for each word based on styled_words
        def _get_word_color(word: str) -> Tuple[int, int, int, int]:
            """Get word color from styled_words using configured colors."""
            if not styled_words:
                # Use configured regular color (with full alpha)
                return (*self.regular_color, 255)
            clean_word = word.lower().strip('.,!?;:')
            for sw in styled_words:
                sw_word = str(sw.get('word', '')).lower().strip('.,!?;:')
                if sw_word == clean_word:
                    style = sw.get('style', 'regular')
                    if style == 'hook':
                        # Use configured hook color (with full alpha)
                        return (*self.hook_color, 255)
                    elif style == 'emphasis':
                        # Use configured emphasis color (with full alpha)
                        return (*self.emphasis_color, 255)
            # Use configured regular color for default (with full alpha)
            return (*self.regular_color, 255)
        
        # Draw word-by-word with colors
        def _draw_colored_line(draw, text, x, y, font):
            """Draw text word by word with individual colors."""
            words = text.split()
            current_x = x
            for word in words:
                color = _get_word_color(word)
                # Draw main text with color (no shadow)
                draw.text((current_x, y), word + ' ', font=font, fill=color)
                # Measure width for next word
                bbox = draw.textbbox((0, 0), word + ' ', font=font)
                current_x += bbox[2] - bbox[0]
        
        # Draw lines with word-by-word coloring
        _draw_colored_line(draw, line1_text, x1, y1, font_line1)
        _draw_colored_line(draw, line2_text, x2, y2, font_line2)
        
        # -- STEP 1: Composite captions over frame ---------------------------
        result = Image.alpha_composite(img, layer)

        # -- STEP 2: Behind-person effect -- ABSOLUTE LAST STEP, NO EXCEPTIONS -
        # Step 2a: extract person cutout using mask
        # Step 2b: paste person on top of captioned frame so person is always in front
        # Safety: skip depth effect if mask covers >90% (bad/stale mask would hide captions)
        if mask_uint8 is not None and self.smart_placement:
            if mask_uint8.shape[:2] != (height, width):
                mask_resized = cv2.resize(mask_uint8, (width, height), interpolation=cv2.INTER_LINEAR)
            else:
                mask_resized = mask_uint8.copy()

            if mask_resized.dtype != np.uint8:
                mask_resized = mask_resized.astype(np.uint8)

            coverage = float(np.mean(mask_resized > 128))
            if coverage > 0.90:
                print(f"[DepthEffect] Skipping: mask covers {100*coverage:.1f}% of frame (likely bad/stale)")
            else:
                # Clean mask edges: erode slightly to remove background bleed,
                # then gaussian blur for soft feathered edge
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                mask_resized = cv2.erode(mask_resized, kernel, iterations=1)
                mask_resized = cv2.GaussianBlur(mask_resized, (11, 11), 0)

                # Step 2: cut person out of original frame using cleaned mask
                person_layer = Image.fromarray(rgb).convert('RGBA')
                person_layer.putalpha(Image.fromarray(mask_resized).convert('L'))

                # Step 3: paste person on top -- person always appears in front of captions
                result = Image.alpha_composite(result, person_layer)

        # -- FINAL: Convert back to BGR for OpenCV ---------------------------
        return cv2.cvtColor(np.array(result.convert('RGB')), cv2.COLOR_RGB2BGR)

    # -------------------------------------------------------------------------
    # FONT HELPERS
    # -------------------------------------------------------------------------
    def _load_centered_fonts(self, size: int):
        """Load Coolvetica (regular) and Runethia (emphasis) at given size."""
        try:
            self.centered_font_regular = ImageFont.truetype(
                self.centered_font_regular_path, size)
        except Exception:
            self.centered_font_regular = ImageFont.load_default()
        try:
            # Runethia slightly larger for visual pop
            self.centered_font_emphasis = ImageFont.truetype(
                self.centered_font_emphasis_path, int(size * 1.2))
        except Exception:
            self.centered_font_emphasis = self.centered_font_regular

    def _get_centered_word_font(self, word: str):
        """Runethia for emphasis/emotional words, Coolvetica for everything else."""
        clean = word.lower().strip('.,!?;:\'"()-')
        if clean in self.centered_emotional_words or clean in self.centered_emphasis_words:
            return self.centered_font_emphasis
        return self.centered_font_regular

    # -------------------------------------------------------------------------
    # LAYOUT HELPER
    # -------------------------------------------------------------------------
    def _calc_layout(self, aspect_ratio: float, width: int,
                     height: int) -> Tuple[float, int, str]:
        """Return (left_margin_pct, font_size, layout_name) for any aspect ratio."""
        base = height * 0.04

        if aspect_ratio < 0.60:
            return 0.06, max(18, min(int(base * 0.90), 32)), "vertical 9:16"
        elif aspect_ratio < 0.80:
            return 0.07, max(20, min(int(base * 0.95), 35)), "vertical"
        elif aspect_ratio < 0.90:
            return 0.08, max(22, min(int(base * 1.00), 38)), "portrait 4:5"
        elif aspect_ratio < 1.10:
            return 0.09, max(25, min(int(base * 1.10), 45)), "square 1:1"
        elif aspect_ratio < 1.40:
            return 0.10, max(28, min(int(base * 1.15), 50)), "landscape"
        elif aspect_ratio < 1.80:
            return 0.11, max(32, min(int(base * 1.20), 55)), "widescreen 16:9"
        else:
            return 0.12, max(35, min(int(base * 1.25), 60)), "ultrawide 21:9"

    # -------------------------------------------------------------------------
    # UTILITY HELPERS
    # -------------------------------------------------------------------------
    def _setup_writer(self, output_video, width, height, fps):
        if self.hw_encode:
            try:
                out = HardwareVideoWriter(output_video, width, height, fps,
                                          quality=self.hw_encode_quality)
                print(f"[Render] Hardware encoding ({self.hw_encode_quality})")
                return out
            except Exception as e:
                print(f"[Render] HW encode failed ({e}), falling back to software")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video, fourcc, fps, (width, height))
        if not out.isOpened():
            print(f"ERROR: Cannot create output video: {output_video}")
            print(f"[DEBUG] Absolute path: {os.path.abspath(output_video)}")
            return None
        print(f"[Render] Software encoding (OpenCV) -> {output_video}")
        return out

    def _rotate_frame(self, frame: np.ndarray, rotation: int) -> np.ndarray:
        # rotation is the stored-frame rotation tag (FFmpeg convention: angle the
        # frame was recorded at, relative to display).  To correct the pixels we
        # apply the *opposite* direction:
        #   tag =  90 (CCW 90 deg off) -> correct with CW  90 deg counterclockwise
        #   tag = -90 (CW  90 deg off) -> correct with CW  90 deg clockwise
        if rotation in [90, -270]:
            return cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
        elif rotation in [-90, 270]:
            return cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        elif abs(rotation) == 180:
            return cv2.rotate(frame, cv2.ROTATE_180)
        return frame

    def _load_mask(self, masks_folder, frame_count, width, height,
                   mask_interpolator, last_mask):
        if mask_interpolator:
            mask = mask_interpolator.get_interpolated_mask(
                masks_folder, frame_count, width, height)
            # Debug: print mask stats once every ~90 frames
            if frame_count % 90 == 1:
                total = int(np.sum(mask))
                print(f"[MaskDebug] Frame {frame_count} (interpolated): sum={total}, max={int(mask.max())}, shape={mask.shape}")
            return mask, mask

        mask_path = os.path.join(masks_folder, f"mask_{frame_count:05d}.npy")
        if os.path.exists(mask_path):
            mask = np.load(mask_path)
            # Debug: print mask stats + path once every ~90 frames
            if frame_count % 90 == 1:
                total = int(np.sum(mask))
                print(f"[MaskDebug] Frame {frame_count}: path={mask_path}, sum={total}, max={int(mask.max())}, dtype={mask.dtype}, shape={mask.shape}")
                if total == 0:
                    print(f"[MaskDebug] WARNING: mask is all zeros -- person detection empty or mask format wrong")
            return mask, mask
        elif last_mask is not None:
            if frame_count % 90 == 1:
                print(f"[MaskDebug] Frame {frame_count}: {mask_path} NOT FOUND, reusing last mask (sum={int(np.sum(last_mask))})")
            return last_mask, last_mask
        else:
            if frame_count % 90 == 1:
                print(f"[MaskDebug] Frame {frame_count}: {mask_path} NOT FOUND and no last mask -- returning blank white mask")
            return np.ones((height, width), dtype=np.uint8) * 255, None

    def _load_metadata(self, masks_folder: str) -> Tuple[float, int, int, int]:
        metadata_path = os.path.join(masks_folder, "metadata.txt")
        metadata = {}
        try:
            with open(metadata_path, 'r') as f:
                content = f.read()
            if content.strip().startswith('{'):
                import json
                metadata = json.loads(content)
            else:
                for line in content.strip().split('\n'):
                    if '=' in line:
                        k, v = line.strip().split('=', 1)
                        try:    metadata[k] = int(v)
                        except:
                            try: metadata[k] = float(v)
                            except: metadata[k] = v
        except FileNotFoundError:
            print("[WARNING] metadata.txt not found, using defaults")

        fps          = metadata.get('fps', 30)
        width        = metadata.get('width', 1920)
        height       = metadata.get('height', 1080)
        total_frames = metadata.get('total_frames', 0)

        if total_frames == 0:
            import glob
            total_frames = len(glob.glob(os.path.join(masks_folder, "mask_*.npy")))

        # Detect actual dimensions from sample mask
        sample = os.path.join(masks_folder, "mask_00001.npy")
        if not os.path.exists(sample):
            import glob
            files = glob.glob(os.path.join(masks_folder, "mask_*.npy"))
            if files:
                sample = files[0]
        if os.path.exists(sample):
            try:
                s = np.load(sample)
                mh, mw = s.shape[:2]
                if mw != width or mh != height:
                    print(f"[Meta] Mask dims: {mw}x{mh}")
                    width, height = mw, mh
            except Exception as e:
                print(f"[WARNING] Sample mask read failed: {e}")

        return fps, width, height, total_frames

    def _analyze_sample_positions(self, masks_folder, width, height, total_frames):
        sample_frames = [1, total_frames//4, total_frames//2, 3*total_frames//4, total_frames-1]
        sample_frames = [min(f, total_frames-1) for f in sample_frames if f > 0]
        votes = {'left': 0, 'center': 0, 'right': 0}
        for fi in sample_frames:
            mp = os.path.join(masks_folder, f"mask_{fi:05d}.npy")
            if os.path.exists(mp):
                mask = np.load(mp)
                votes[self.mask_processor.analyze_placement(mask, width, height)] += 1
        return max(votes, key=votes.get)

    def _get_hook_display_text(self, detected_text: str) -> str:
        if detected_text in HOOK_DISPLAY_OVERRIDES:
            return HOOK_DISPLAY_OVERRIDES[detected_text]
        dl = detected_text.lower()
        for k, v in HOOK_DISPLAY_OVERRIDES.items():
            if dl == k.lower():
                return v
        return detected_text.upper()

    def _collect_hook_phrases(self, timed_captions, styled_words, max_words_per_hook=1):
        """Collect hook phrases - ONLY from user-selected hook words (no auto-brand detection)."""
        hook_phrases = []
        if max_words_per_hook <= 0:
            return hook_phrases

        hook_ext = 0.8
        if styled_words:
            # NO AUTO-STYLING: removed brand name auto-detection
            all_hooks = []
            idx = 0
            while idx < len(styled_words):
                w = styled_words[idx]
                if w.get('style') == 'hook':
                    pw = [w['word']]
                    ps, pe = w['start'], w['end']
                    j = idx + 1
                    while (j < len(styled_words)
                           and styled_words[j].get('style') == 'hook'
                           and len(pw) < max_words_per_hook):
                        pw.append(styled_words[j]['word'])
                        pe = styled_words[j]['end']
                        j += 1
                    all_hooks.append((ps, pe, ' '.join(pw), pe - ps))
                    idx = j
                else:
                    idx += 1

            # Process all hooks equally (no brand name priority)
            for p in all_hooks:
                dt = self._get_hook_display_text(p[2])
                dw = dt.split()
                if len(dw) > max_words_per_hook:
                    dt = ' '.join(dw[:max_words_per_hook])
                hook_phrases.append((p[0], p[1] + hook_ext, dt))

        return hook_phrases

    # -------------------------------------------------------------------------
    # OTHER ANIMATION MODES (marquee, styled, standard -- unchanged)
    # -------------------------------------------------------------------------
    def _draw_marquee_caption_on_frame(self, frame, timed_captions, current_time,
                                       fps, mask_uint8, width, height, font_size):
        current_caption = None
        caption_start = caption_end = 0
        for start, end, text in timed_captions:
            if start <= current_time < end:
                current_caption = ' '.join(text) if isinstance(text, list) else str(text)
                caption_start, caption_end = start, end
                break
        if not current_caption:
            return frame

        progress = (current_time - caption_start) / max(0.001, caption_end - caption_start)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        background = Image.fromarray(rgb).convert("RGBA")
        cap_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(cap_layer)

        try:
            # Use font_manager instead of hardcoded path for cross-platform support
            font = self.font_manager.get_font('bold', font_size)
        except:
            font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), current_caption, font=font)
        text_w = bbox[2] - bbox[0]
        margin = 100
        x = int((-text_w - margin) + (width + margin + text_w + margin) * progress)
        y = int(height * self.y_position)

        draw.text((x+4, y+4), current_caption, font=font, fill=(0, 0, 0, 180))
        draw.text((x, y), current_caption, font=font, fill=(255, 255, 255, 255))

        combined = Image.alpha_composite(background, cap_layer)
        if mask_uint8 is not None:
            mr = cv2.resize(mask_uint8, (width, height), interpolation=cv2.INTER_LINEAR) \
                 if mask_uint8.shape[:2] != (height, width) else mask_uint8
            person = Image.fromarray(rgb).convert("RGBA")
            person.putalpha(Image.fromarray(mr).convert("L"))
            combined = Image.alpha_composite(combined, person)

        return cv2.cvtColor(np.array(combined.convert("RGB")), cv2.COLOR_RGB2BGR)

    def _get_styled_font(self, font_name, size):
        key = f"{font_name}_{size}"
        if key in self.styled_fonts:
            return self.styled_fonts[key]
        for path in self.font_paths.get(font_name, self.font_paths['regular']):
            if Path(path).exists():
                try:
                    f = ImageFont.truetype(path, size)
                    self.styled_fonts[key] = f
                    return f
                except:
                    continue
        f = ImageFont.load_default()
        self.styled_fonts[key] = f
        return f

    def _parse_styled_text(self, text):
        words = text.split()
        result = []
        for word in words:
            font_name, size_mult, clean_word = 'regular', 1.0, word
            clean = word.strip('!@#$%^&*()[]{},.<>?/\'"";:')
            if clean.isupper() and len(clean) > 2:
                font_name, size_mult = 'bold', 1.15
            elif clean.lower() in self.emotional_words:
                font_name, size_mult = 'cursive', 1.1
            if '***' in word:
                m = re.search(r'\*\*\*([^*]+)\*\*\*', word)
                if m: clean_word, font_name, size_mult = m.group(1), 'extra-bold', 1.3
            elif '**' in word:
                m = re.search(r'\*\*([^*]+)\*\*', word)
                if m: clean_word, font_name, size_mult = m.group(1), 'bold', 1.15
            elif '*' in word:
                m = re.search(r'\*([^*]+)\*', word)
                if m: clean_word, font_name = m.group(1), 'cursive'
            elif '~' in word:
                m = re.search(r'~([^~]+)~', word)
                if m: clean_word, font_name, size_mult = m.group(1), 'cursive', 1.1
            result.append({'text': clean_word, 'font': font_name, 'size_mult': size_mult})
        return result

    def _draw_text_with_outline_styled(self, draw, text, position, font, fill, outline=3):
        # Main text only - no outline/shadow
        x, y = position
        draw.text(position, text, font=font, fill=fill)

    def _draw_styled_captions_on_frame(self, frame, timed_captions, current_time,
                                       fps, width, height, hook_active):
        current_caption = None
        caption_start = caption_end = 0
        for start, end, text in timed_captions:
            if start <= current_time < end:
                current_caption = ' '.join(text) if isinstance(text, list) else str(text)
                caption_start, caption_end = start, end
                break
        if not current_caption or (self.exclusive_hooks and hook_active):
            return frame

        frames_in = int((current_time - caption_start) * fps)
        dur_frames = int((caption_end - caption_start) * fps)
        alpha = 1.0
        if dur_frames > 0:
            fade_start = max(0, dur_frames - 8)
            if frames_in >= fade_start:
                alpha = 1.0 - ((frames_in - fade_start) / (dur_frames - fade_start)) * 0.8

        text_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(text_layer)
        chunks = self._parse_styled_text(current_caption)
        total_w = 0
        chunk_sizes = []
        for c in chunks:
            size = int(self.font_size * c['size_mult'])
            font = self._get_styled_font(c['font'], size)
            bbox = draw.textbbox((0, 0), c['text'], font=font)
            tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
            chunk_sizes.append((tw, th, font, c))
            total_w += tw + 15
        total_w -= 15
        x = (width - total_w) // 2 if self.position == 'center' else \
            width - total_w - 50 if self.position == 'right' else 50
        y = (height - int(self.font_size * 1.2)) // 2
        cx = x
        for tw, th, font, c in chunk_sizes:
            color = tuple(int(ch * alpha * self.transparency) for ch in self.color)
            self._draw_text_with_outline_styled(draw, c['text'], (cx, y), font, color)
            cx += tw + 15

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_pil = Image.fromarray(frame_rgb).convert('RGBA')
        result = Image.alpha_composite(frame_pil, text_layer)
        return cv2.cvtColor(np.array(result.convert('RGB')), cv2.COLOR_RGB2BGR)

    def _draw_captions_on_frame(self, bg_pil, timed_captions, current_time, fps,
                                 mask_uint8, width, height, position, font_size, styled_words):
        if self.split_caption_mode and self.split_renderer:
            return self._draw_split_captions_on_frame(
                bg_pil, timed_captions, current_time, fps, styled_words,
                mask_uint8=mask_uint8, width=width, height=height)

        fixed = []
        for s, e, lines in timed_captions:
            if len(lines) > 1:
                lines = [" ".join(lines)]
            fixed.append((s, e, lines))

        for start_time, end_time, lines in fixed:
            if isinstance(start_time, int) and start_time > 1000:
                start_time /= fps; end_time /= fps
            if start_time <= current_time <= end_time:
                rel = int((current_time - start_time) * fps)
                dur = (end_time - start_time) * fps
                full_text = ' '.join(lines)
                list_items = self.caption_formatter.detect_list_format(full_text)
                if list_items:
                    bg_pil = self._draw_list_layout(bg_pil, list_items, rel, dur,
                                                    width, height, position, font_size, mask_uint8)
                elif styled_words:
                    bg_pil = self._draw_styled_layout(bg_pil, styled_words, start_time, end_time,
                                                      current_time, rel, dur, mask_uint8,
                                                      width, height, position, font_size)
                else:
                    bg_pil = self._draw_simple_layout(bg_pil, lines, rel, dur,
                                                      width, height, position, font_size, mask_uint8)
        return bg_pil

    def _draw_split_captions_on_frame(self, bg_pil, timed_captions, current_time,
                                       fps, styled_words, mask_uint8=None, width=0, height=0):
        if not self.split_renderer:
            return bg_pil
        words_list = []
        if styled_words:
            for i, wd in enumerate(styled_words):
                words_list.append({'word': wd.get('word',''), 'start': wd.get('start',0),
                                   'end': wd.get('end',0), 'global_idx': i})
        for start_time, end_time, lines in timed_captions:
            if isinstance(start_time, int) and start_time > 1000:
                start_time /= fps; end_time /= fps
            if start_time <= current_time <= end_time + 0.5:
                caption_text = ' '.join(lines)
                current_word_idx = -1
                for wd in words_list:
                    if start_time <= wd['start'] <= current_time:
                        current_word_idx = wd['global_idx']
                start_word_idx = next(
                    (wd['global_idx'] for wd in words_list if wd['start'] >= start_time), -1)
                bg_pil = self.split_renderer.render_split_captions(
                    bg_pil, caption_text, current_word_idx, start_word_idx, mask_uint8=mask_uint8)
                break
        return bg_pil

    def _draw_list_layout(self, bg_pil, list_items, rel, dur, width, height,
                          position, font_size, mask_uint8=None):
        is_portrait = height > width
        if mask_uint8 is not None and position in ['left', 'right']:
            tz = mask_uint8[int(height*0.15):int(height*0.30), :]
            y_pct = 0.22 if tz.size > 0 and np.sum(tz > 128)/tz.size < 0.2 else 0.82
        else:
            y_pct = 0.88 if is_portrait else 0.82
        FY = int(height * y_pct)
        fonts = {'bold': self.font_manager.get_font('bold', font_size),
                 'regular': self.font_manager.get_font('regular', font_size)}
        for i, (num, item) in enumerate(list_items):
            ll = f"{num}. {item.strip()}"
            y = FY
            x = int(width * self.left_margin_pct) if position == 'left' else \
                int(width * 0.75) if position == 'right' else int(width * 0.5)
            lf = rel - (i * 8)
            if lf > 0:
                x, _, a = self.animator.animate((x, y), lf, self.animation, self.anim_params, dur)
                ta = int(255 * self.transparency * a)
                tc = (*self.color, ta)
                gc = (255, 200, 80, 110) if i == 0 else (180, 210, 235, 100)
                bg_pil = self.text_effects.add_glossy_text(
                    bg_pil, ll, (int(x), int(y)), fonts['bold' if i == 0 else 'regular'], tc, gc)
        return bg_pil

    def _draw_styled_layout(self, bg_pil, styled_words, caption_start, caption_end,
                            current_time, rel, dur, mask_uint8, width, height, position, font_size):
        cw = [w for w in styled_words if caption_start <= w['start'] < caption_end]
        if not cw:
            return bg_pil
        is_portrait = height > width
        if position == 'center' and not is_portrait:
            return self._draw_split_layout(bg_pil, cw, rel, dur, mask_uint8, width, height, font_size)
        return self._draw_stacked_layout(bg_pil, cw, rel, dur, mask_uint8, width, height, position, font_size)

    def _draw_split_layout(self, bg_pil, words, rel, dur, mask_uint8, width, height, font_size):
        pl, pr = self.mask_processor.get_person_edges(mask_uint8, width)
        mid = len(words) // 2
        lw, rw = words[:mid], words[mid:]
        FY = int(height * 0.88)
        if rel > 0:
            _, _, a = self.animator.animate((0, FY), rel, self.animation, self.anim_params, dur)
            draw = ImageDraw.Draw(bg_pil)
            ta = int(255 * self.transparency * a)
            tc = (255, 255, 255, ta)
            for grp in [lw, rw]:
                xp = max(10, pl - 20 - 400) if grp is lw else pr + 20
                for w in grp:
                    sz = int(font_size * w.get('size_mult', 1.0) * 0.5)
                    f = self.font_manager.get_font(
                        'cursive' if w.get('style') in ('hook','emotional') else 'bold', sz)
                    draw.text((int(xp), FY), w['word'], font=f, fill=tc)
                    bb = f.getbbox(w['word'] + ' ')
                    xp += bb[2] - bb[0]
        return bg_pil

    def _draw_stacked_layout(self, bg_pil, words, rel, dur, mask_uint8,
                              width, height, position, font_size):
        # Use configured paths with fallbacks to system fonts
        COOLVETICA = self.centered_font_regular_path or 'C:/Windows/Fonts/arial.ttf'
        RUNETHIA = self.centered_font_emphasis_path or 'C:/Windows/Fonts/segoepr.ttf'
        if rel <= 0:
            return bg_pil

        ax = int(width * {'left': 0.25, 'right': 0.75}.get(position, 0.5))
        _, _, a = self.animator.animate((ax, int(height*0.82)), rel, self.animation, self.anim_params, dur)
        ta = int(255 * self.transparency * a)
        draw = ImageDraw.Draw(bg_pil)

        diag = np.sqrt(width**2 + height**2)
        bfs  = int(max(height*0.05, min((diag/2203.0)*110, height*0.12)))
        spm  = int(bfs * 0.25)
        sm   = int(width * 0.05)
        aw   = width - 2*sm

        # Smart Y
        if mask_uint8 is not None:
            zones = [(0.15,0.30,0.22),(0.30,0.50,0.40),(0.50,0.70,0.60),(0.75,0.90,0.82)]
            cx_range = (sm, sm + int(width*0.35)) if position == 'left' else \
                       (width - sm - int(width*0.35), width - sm) if position == 'right' else \
                       ((width - int(width*0.35))//2, (width + int(width*0.35))//2)
            best_y, best_cov = 0.82, 1.0
            for ys, ye, yc in zones:
                zm = mask_uint8[int(height*ys):int(height*ye),
                                max(0,cx_range[0]):min(width,cx_range[1])]
                if zm.size:
                    cov = np.sum(zm > 128) / zm.size
                    if cov < best_cov:
                        best_cov, best_y = cov, yc
            BY = int(height * max(0.15, min(best_y, 0.92)))
        else:
            BY = int(height * 0.82)

        metrics, total_w, max_asc = [], 0, 0
        for wd in words:
            sz = int(bfs * wd.get('size_mult', 1.0))
            fp = RUNETHIA if wd.get('style') in ('hook','emphasis','emotional') else COOLVETICA
            try:   font = ImageFont.truetype(fp, sz)
            except: font = self.font_manager.get_font('regular', sz)
            asc, _ = font.getmetrics()
            bb = draw.textbbox((0, 0), wd.get('word',''), font=font)
            ww = bb[2] - bb[0]
            metrics.append({'word': wd.get('word',''), 'font': font, 'ascent': asc, 'width': ww})
            max_asc = max(max_asc, asc)
            total_w += ww + spm
        if metrics: total_w -= spm

        sx = sm if position == 'left' else \
             max(sm, width - sm - total_w) if position == 'right' else \
             max(sm, sm + (aw - total_w)//2)
        cx = sx
        for m in metrics:
            draw.text((int(cx), int(BY - m['ascent'])), m['word'],
                      font=m['font'], fill=(255, 255, 255, ta))
            cx += m['width'] + spm
        return bg_pil

    def _draw_simple_layout(self, bg_pil, lines, rel, dur, width, height,
                            position, font_size, mask_uint8=None):
        is_portrait = height > width
        if mask_uint8 is not None and position in ['left', 'right']:
            tz = mask_uint8[int(height*0.15):int(height*0.30), :]
            yp = 0.22 if tz.size > 0 and np.sum(tz > 128)/tz.size < 0.2 else 0.82
        else:
            yp = 0.88 if is_portrait else 0.82
        FY = int(height * yp)
        fonts = {'bold':    self.font_manager.get_font('bold', font_size),
                 'regular': self.font_manager.get_font('regular', font_size)}
        for i, line in enumerate(lines):
            x = int(width * self.left_margin_pct) if position == 'left' else \
                int(width * 0.75) if position == 'right' else int(width * 0.5)
            lf = rel - (i * 8)
            if lf > 0:
                xa, _, a = self.animator.animate((x, FY), lf, self.animation, self.anim_params, dur)
                ta = int(255 * self.transparency * a)
                tc = (*self.color, ta)
                emp = any(w.lower() in self.caption_formatter.emphasis_words
                          for w in line.lower().split())
                gc = (255, 200, 80, 110) if emp else (180, 210, 235, 100)
                bg_pil = self.text_effects.add_glossy_text(
                    bg_pil, line, (int(xa), FY),
                    fonts['bold' if emp else 'regular'], tc, gc)
        return bg_pil

