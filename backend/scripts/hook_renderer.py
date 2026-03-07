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
    
    def __init__(self, hook_color: Tuple[int, int, int] = None):
        """Initialize hook renderer with font manager.
        
        Args:
            hook_color: RGB color tuple for hook text (default: bright red)
        """
        self.font_manager = FontManager()
        self.font_cache = {}
        self.hook_color = hook_color or (255, 25, 0)  # Default bright red
    
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
        cache_key = f"hook_impact_{text}_{width}"
        
        if cache_key not in self.font_cache:
            # ASPECT RATIO AWARE FONT SIZING
            aspect_ratio = width / height if height > 0 else 1.0
            impact_path = "impact.ttf"
            
            # Adjust max font size based on aspect ratio
            if aspect_ratio < 0.8:  # Vertical (9:16, 4:5)
                max_font = 300
                min_font = 60
            elif aspect_ratio < 1.1:  # Square (1:1)
                max_font = 350
                min_font = 70
            else:  # Horizontal (16:9, 21:9)
                max_font = 400
                min_font = 80
            
            best_size = min_font
            for size in range(max_font, min_font, -5):
                try:
                    test_font = ImageFont.truetype(impact_path, size)
                    max_w = max(draw.textbbox((0, 0), l, font=test_font)[2] for l in lines)
                    # Leave some margin (90% of width for vertical, 95% for horizontal)
                    max_width_pct = 0.90 if aspect_ratio < 0.8 else 0.95
                    if max_w <= width * max_width_pct:
                        best_size = size
                        break
                except:
                    continue
            
            self.font_cache[cache_key] = best_size
        
        font_size = self.font_cache[cache_key]
        
        # Load font
        try:
            font = ImageFont.truetype("impact.ttf", font_size)
        except:
            font = ImageFont.load_default()
        
        # Calculate line positions
        line_sizes = [draw.textbbox((0, 0), l, font=font) for l in lines]
        line_heights = [bbox[3] - bbox[1] for bbox in line_sizes]
        line_widths = [bbox[2] - bbox[0] for bbox in line_sizes]
        line_gap = int(font_size * 0.3)
        
        # ASPECT RATIO AWARE POSITIONING
        aspect_ratio = width / height if height > 0 else 1.0
        
        # Adjust Y position based on aspect ratio
        # Vertical videos need higher position to avoid being too low
        if aspect_ratio < 0.8:  # 9:16, 4:5, 2:3 vertical
            y_percent = 0.08  # 8% from top
        elif aspect_ratio < 1.1:  # 1:1 square
            y_percent = 0.06  # 6% from top
        else:  # 16:9, 21:9 horizontal
            y_percent = 0.05  # 5% from top
        
        # Position at calculated percentage of screen
        total_height = sum(line_heights) + line_gap * (len(lines) - 1)
        start_y = int(height * y_percent) + line_heights[0]
        
        # Use configured hook color (default is bright red)
        hook_color_rgb = self.hook_color
        
        # Draw each line
        for i, (line, line_w, line_h) in enumerate(zip(lines, line_widths, line_heights)):
            x = (width - line_w) // 2
            y = start_y + i * (line_h + line_gap)
            text_y = y - line_h
            
            draw.text((x, text_y), line, font=font, fill=hook_color_rgb)
        
        # Convert back to OpenCV BGR
        return cv2.cvtColor(np.array(pil_layer), cv2.COLOR_RGB2BGR)
    
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
        
        # Create background visibility mask
        if mask_uint8.ndim == 2:
            bg_visibility = (mask_uint8 <= 128).astype(np.uint8)
        else:
            bg_visibility = (mask_uint8[:, :, 0] <= 128).astype(np.uint8)
        
        # Apply mask to hook layer
        text_layer_masked = hook_layer * bg_visibility[:, :, np.newaxis]
        
        # Find where hook text exists
        has_text = (text_layer_masked.sum(axis=2) > 0)
        
        # Composite onto frame
        result = frame.copy()
        result[has_text] = text_layer_masked[has_text]
        
        return result
    
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
