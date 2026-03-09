"""
Hook Renderer Module

Renders giant red ALL CAPS background text behind the person.
Uses Impact font for maximum visual impact.
"""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from typing import Tuple, List
from .font_manager import FontManager
from .config import COLORS


class HookRenderer:
    """
    Renders giant "hook" background text.
    
    Creates large red text that appears behind the person,
    emphasizing key phrases and brand names.
    
    Example:
        >>> renderer = HookRenderer()
        >>> # Create hook text layer
        >>> layer = renderer.create_hook_layer((1080, 1920), "ZYPIT", 1920, 1080)
        >>> # Composite with mask
        >>> frame = renderer.composite_hook(frame, layer, mask)
    """
    
    def __init__(self, hook_color: Tuple[int, int, int] = None, font_scale: float = 1.0,
                 y_position: float = None, position: str = 'center',
                 mask_quality: str = 'medium'):
        """Initialize hook renderer with font manager.

        Args:
            hook_color: RGB color tuple for hook text (default: bright red)
            font_scale: Multiplier for max font size (1.0=normal, 2.0=double)
            y_position: Vertical position as fraction (0.0=top, 1.0=bottom). None = auto.
            position: Horizontal alignment: 'left', 'center', or 'right'
            mask_quality: Mask edge refinement: 'off', 'light', 'medium', 'strong', 'maximum'
        """
        self.font_manager = FontManager()
        self.font_cache = {}
        self.hook_color = hook_color or (255, 25, 0)  # Default bright red
        self.font_scale = max(1.0, float(font_scale))
        self.y_position = y_position  # None = auto from aspect ratio
        self.position = position if position in ('left', 'center', 'right') else 'center'
        _valid_quality = ('off', 'light', 'medium', 'strong', 'maximum')
        self.mask_quality = mask_quality if mask_quality in _valid_quality else 'medium'
    
    def create_hook_layer(self, frame_shape: Tuple[int, ...], text: str,
                         width: int, height: int) -> np.ndarray:
        """
        Create hook text layer using Impact font.
        
        Args:
            frame_shape: Frame shape tuple (H, W) or (H, W, C)
            text: Text to render (will be uppercased)
            width: Frame width
            height: Frame height
            
        Returns:
            BGR image with red text on black background
            
        Example:
            >>> renderer = HookRenderer()
            >>> layer = renderer.create_hook_layer((1080, 1920), "ZYPIT", 1920, 1080)
        """
        h = frame_shape[0] if len(frame_shape) >= 1 else height
        w = frame_shape[1] if len(frame_shape) >= 2 else width
        
        # Black background layer
        layer = np.zeros((h, w, 3), dtype=np.uint8)
        
        text = text.upper()
        
        # Split text for optimal display
        words = text.split()
        if len(words) <= 4:
            lines = [text]
        else:
            mid = len(words) // 2
            line1 = ' '.join(words[:mid])
            line2 = ' '.join(words[mid:])
            lines = [l for l in [line1, line2] if l]
        
        # Convert to PIL for drawing
        layer_rgb = cv2.cvtColor(layer, cv2.COLOR_BGR2RGB)
        pil_layer = Image.fromarray(layer_rgb)
        draw = ImageDraw.Draw(pil_layer)
        
        # Find optimal font size (cache per text/width)
        cache_key = f"hook_impact_{text}_{width}_{self.font_scale}_{self.position}"
        
        if cache_key not in self.font_cache:
            # ASPECT RATIO AWARE FONT SIZING
            aspect_ratio = width / height if height > 0 else 1.0

            # Find best available font — prefer Impact, fall back to Coolvetica
            import os
            font_candidates = [
                "/usr/share/fonts/truetype/msttcorefonts/Impact.ttf",
                "/usr/share/fonts/truetype/impact.ttf",
                "impact.ttf",
                "/app/fonts/Coolvetica Rg.otf",
                "/app/fonts/Runethia.otf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            ]
            hook_font_path = None
            for fp in font_candidates:
                if os.path.exists(fp):
                    hook_font_path = fp
                    break

            # Adjust max font size based on aspect ratio (scaled by font_scale)
            if aspect_ratio < 0.8:  # Vertical (9:16, 4:5)
                max_font = int(300 * self.font_scale)
                min_font = 60
            elif aspect_ratio < 1.1:  # Square (1:1)
                max_font = int(350 * self.font_scale)
                min_font = 70
            else:  # Horizontal (16:9, 21:9)
                max_font = int(400 * self.font_scale)
                min_font = 80

            best_size = min_font
            if hook_font_path:
                for size in range(max_font, min_font, -5):
                    try:
                        test_font = ImageFont.truetype(hook_font_path, size)
                        max_w = max(draw.textbbox((0, 0), l, font=test_font)[2] for l in lines)
                        max_width_pct = 0.90 if aspect_ratio < 0.8 else 0.95
                        if max_w <= width * max_width_pct:
                            best_size = size
                            break
                    except:
                        continue

            self.font_cache[cache_key] = (best_size, hook_font_path)

        font_size, hook_font_path = self.font_cache[cache_key]

        # Load font
        try:
            font = ImageFont.truetype(hook_font_path, font_size) if hook_font_path else ImageFont.load_default()
        except:
            font = ImageFont.load_default()
        
        # Calculate line positions
        line_sizes = [draw.textbbox((0, 0), l, font=font) for l in lines]
        line_heights = [bbox[3] - bbox[1] for bbox in line_sizes]
        line_widths = [bbox[2] - bbox[0] for bbox in line_sizes]
        line_gap = int(font_size * 0.3)
        
        # ASPECT RATIO AWARE POSITIONING
        aspect_ratio = width / height if height > 0 else 1.0
        
        # Y position: use user setting if provided, else auto from aspect ratio
        if self.y_position is not None:
            y_percent = float(self.y_position)
        elif aspect_ratio < 0.8:  # 9:16 vertical
            y_percent = 0.08
        elif aspect_ratio < 1.1:  # 1:1 square
            y_percent = 0.06
        else:  # 16:9 horizontal
            y_percent = 0.05

        total_height = sum(line_heights) + line_gap * (len(lines) - 1)
        start_y = int(height * y_percent) + line_heights[0]

        # Use configured hook color (default is bright red)
        hook_color_rgb = self.hook_color

        # Draw each line
        for i, (line, line_w, line_h) in enumerate(zip(lines, line_widths, line_heights)):
            # X position: left / center / right
            if self.position == 'left':
                x = int(width * 0.05)
            elif self.position == 'right':
                x = max(0, int(width * 0.95) - line_w)
            else:  # center
                x = (width - line_w) // 2
            y = start_y + i * (line_h + line_gap)
            text_y = y - line_h

            draw.text((x, text_y), line, font=font, fill=hook_color_rgb)
        
        # Convert back to OpenCV BGR
        return cv2.cvtColor(np.array(pil_layer), cv2.COLOR_RGB2BGR)
    
    def _refine_mask(self, mask: np.ndarray) -> np.ndarray:
        """Refine mask edges based on self.mask_quality setting.

        off     → no change
        light   → small gaussian blur (soften edges slightly)
        medium  → blur + 1 erosion pass (default, clean cutout)
        strong  → blur + 2 erosion passes + 1 dilation (smooth but tight)
        maximum → 3 erosion passes + sharpen (sharpest person boundary)
        """
        if self.mask_quality == 'off':
            return mask

        m = mask.copy()
        if m.ndim == 3:
            m = m[:, :, 0]

        if self.mask_quality == 'light':
            m = cv2.GaussianBlur(m, (5, 5), 0)

        elif self.mask_quality == 'medium':
            m = cv2.GaussianBlur(m, (7, 7), 0)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            m = cv2.erode(m, kernel, iterations=1)

        elif self.mask_quality == 'strong':
            m = cv2.GaussianBlur(m, (9, 9), 0)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            m = cv2.erode(m, kernel, iterations=2)
            m = cv2.dilate(m, kernel, iterations=1)

        elif self.mask_quality == 'maximum':
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            m = cv2.erode(m, kernel, iterations=3)
            # Sharpen the edges
            m = cv2.GaussianBlur(m, (3, 3), 0)
            _, m = cv2.threshold(m, 100, 255, cv2.THRESH_BINARY)

        return m

    def composite_hook(self, frame: np.ndarray, hook_layer: np.ndarray,
                      mask_uint8: np.ndarray) -> np.ndarray:
        """
        Composite hook text layer onto frame using mask.
        
        Only shows hook text in background areas (behind person).
        
        Args:
            frame: Original frame (BGR)
            hook_layer: Hook text layer (BGR, black background)
            mask_uint8: Binary mask of person
            
        Returns:
            Composited frame
            
        Example:
            >>> renderer = HookRenderer()
            >>> layer = renderer.create_hook_layer(frame.shape, "ZYPIT", w, h)
            >>> result = renderer.composite_hook(frame, layer, mask)
        """
        # Ensure mask matches frame dimensions
        frame_h, frame_w = frame.shape[:2]
        if mask_uint8.shape[:2] != (frame_h, frame_w):
            mask_uint8 = cv2.resize(mask_uint8, (frame_w, frame_h), interpolation=cv2.INTER_NEAREST)
        
        # Ensure hook_layer matches frame dimensions
        if hook_layer.shape[:2] != (frame_h, frame_w):
            hook_layer = cv2.resize(hook_layer, (frame_w, frame_h))
        
        # Refine mask edges based on quality setting
        mask_uint8 = self._refine_mask(mask_uint8)

        # Build alpha for hook text: fully visible in background, min 40% opacity behind person
        if mask_uint8.ndim == 2:
            person_mask = (mask_uint8 > 128).astype(np.float32)
        else:
            person_mask = (mask_uint8[:, :, 0] > 128).astype(np.float32)

        # Where text exists: alpha = 1.0 in background, 0.4 behind person
        has_text = (hook_layer.sum(axis=2) > 0)
        alpha = np.where(person_mask > 0, 0.4, 1.0)  # 40% opacity behind person, full elsewhere
        alpha_3ch = alpha[:, :, np.newaxis]

        result = frame.copy().astype(np.float32)
        hook_f = hook_layer.astype(np.float32)
        # Blend only where text exists
        mask_3ch = has_text[:, :, np.newaxis]
        result = np.where(mask_3ch, result * (1 - alpha_3ch) + hook_f * alpha_3ch, result)
        return np.clip(result, 0, 255).astype(np.uint8)
    
    def create_simple_hook(self, frame: np.ndarray, text: str,
                          position: str = 'center') -> np.ndarray:
        """
        Create simple hook text directly on frame (no masking).
        
        Args:
            frame: Frame to draw on
            text: Text to render
            position: 'top', 'center', 'bottom'
            
        Returns:
            Frame with hook text
        """
        height, width = frame.shape[:2]
        text = text.upper()
        
        # Find font size
        font_scale = 3.0
        thickness = max(4, width // 40)
        
        # Measure text
        (text_w, text_h), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX, 
                                               font_scale, thickness)
        
        # Adjust if too wide
        while text_w > width * 0.85 and font_scale > 0.5:
            font_scale -= 0.2
            (text_w, text_h), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX,
                                                   font_scale, thickness)
        
        # Position
        x = (width - text_w) // 2
        if position == 'top':
            y = int(height * 0.25)
        elif position == 'bottom':
            y = int(height * 0.75)
        else:
            y = height // 2
        
        # Colors (BGR)
        red_main = (0, 30, 255)
        red_shadow = (0, 0, 140)
        red_outline = (0, 0, 40)
        
        # Draw outline
        for ox, oy in [(-5, -5), (5, -5), (-5, 5), (5, 5),
                       (0, -5), (0, 5), (-5, 0), (5, 0)]:
            cv2.putText(frame, text, (x + ox, y + oy), cv2.FONT_HERSHEY_DUPLEX,
                       font_scale, red_outline, thickness + 4, cv2.LINE_AA)
        
        # Draw shadow
        cv2.putText(frame, text, (x + 6, y + 6), cv2.FONT_HERSHEY_DUPLEX,
                   font_scale, red_shadow, thickness + 2, cv2.LINE_AA)
        
        # Draw main text
        cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_DUPLEX,
                   font_scale, red_main, thickness, cv2.LINE_AA)
        
        return frame


# =============================================================================
# Standalone functions
# =============================================================================

def render_hook_text(frame_shape: Tuple[int, int], text: str, 
                    width: int, height: int) -> np.ndarray:
    """
    Simple function to create hook text layer.
    
    Args:
        frame_shape: (height, width) tuple
        text: Text to render
        width: Frame width
        height: Frame height
        
    Returns:
        BGR image with red text
    """
    renderer = HookRenderer()
    return renderer.create_hook_layer(frame_shape, text, width, height)
