"""
Text Effects Module

Glossy text rendering effects using PIL:
- Outer glow
- Drop shadow
- Stroke/outline
- Highlight/shine
- Color handling
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from typing import Tuple, Optional
from .font_manager import FontManager


class TextEffects:
    """
    Renders text with glossy effects using PIL.
    
    Uses small canvases for performance instead of full-frame images.
    
    Example:
        >>> effects = TextEffects()
        >>> frame_rgba = effects.add_glossy_text(
        ...     frame_rgba, "Hello", (100, 200),
        ...     font, text_color=(255,255,255), glow_color=(255,200,80)
        ... )
    """
    
    def __init__(self, glow_blur: int = 12, shadow_blur: int = 5):
        """
        Initialize text effects renderer.
        
        Args:
            glow_blur: Blur radius for outer glow
            shadow_blur: Blur radius for shadow
        """
        self.glow_blur = glow_blur
        self.shadow_blur = shadow_blur
        self.font_manager = FontManager()
    
    def add_glossy_text(self, frame_rgba: Image.Image, text: str,
                       position: Tuple[int, int], font,
                       text_color: Tuple[int, int, int, int],
                       glow_color: Tuple[int, int, int, int] = (255, 200, 80, 120),
                       stroke_width: int = 0) -> Image.Image:
        """
        Add glossy text with glow and highlight (no stroke/outline).
        
        Uses small bounding-box canvases for performance.
        
        Args:
            frame_rgba: PIL RGBA image to draw on
            text: Text string
            position: (x, y) position
            font: PIL ImageFont
            text_color: RGBA tuple for text
            glow_color: RGBA tuple for glow
            stroke_width: Width of outline stroke
            
        Returns:
            Modified frame_rgba
            
        Example:
            >>> from PIL import Image
            >>> frame = Image.new('RGBA', (1920, 1080), (0,0,0,0))
            >>> font = font_manager.get_font('bold', 110)
            >>> frame = effects.add_glossy_text(
            ...     frame, "HELLO", (100, 200), font,
            ...     (255,255,255,230), (255,200,80,120)
            ... )
        """
        x, y = position
        frame_w, frame_h = frame_rgba.size
        
        # Get text bounding box
        bbox = font.getbbox(text)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        
        # Padding for blur overflow
        pad = self.glow_blur * 2 + 10
        canvas_w = text_w + pad * 2
        canvas_h = text_h + pad * 2
        tx = pad - bbox[0]
        ty = pad - bbox[1]
        
        # 1. OUTER GLOW
        glow_layer = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        ImageDraw.Draw(glow_layer).text((tx, ty), text, font=font, fill=(255, 255, 255, 255))
        glow = glow_layer.filter(ImageFilter.GaussianBlur(self.glow_blur))
        glow_data = np.array(glow)
        glow_colored = np.zeros_like(glow_data)
        glow_colored[glow_data[:, :, 3] > 0] = glow_color
        glow_colored[:, :, 3] = glow_data[:, :, 3] // 2
        glow_img = Image.fromarray(glow_colored.astype(np.uint8))
        
        # 2. HIGHLIGHT (top edge shine)
        highlight = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        ImageDraw.Draw(highlight).text((tx, ty - 2), text, font=font, fill=(255, 255, 220, 180))
        
        # 3. MAIN TEXT
        main_text = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        ImageDraw.Draw(main_text).text((tx, ty), text, font=font, fill=text_color)
        
        # Composite layers (bottom to top) - no shadow, no stroke
        result_small = Image.alpha_composite(glow_img, main_text)
        result_small = Image.alpha_composite(result_small, highlight)
        
        # Paste onto full frame with clipping
        paste_x = x - pad
        paste_y = y - pad
        
        cx1 = max(0, -paste_x)
        cy1 = max(0, -paste_y)
        cx2 = min(canvas_w, frame_w - paste_x)
        cy2 = min(canvas_h, frame_h - paste_y)
        
        if cx2 > cx1 and cy2 > cy1:
            clipped = result_small.crop((cx1, cy1, cx2, cy2))
            frame_rgba.paste(clipped, (max(0, paste_x), max(0, paste_y)), clipped)
        
        return frame_rgba
    
    def add_simple_text(self, frame_rgba: Image.Image, text: str,
                       position: Tuple[int, int], font,
                       text_color: Tuple[int, int, int, int],
                       shadow: bool = False) -> Image.Image:
        """
        Add simple text without shadow (faster than glossy).
        
        Args:
            frame_rgba: PIL RGBA image
            text: Text string
            position: (x, y) position
            font: PIL ImageFont
            text_color: RGBA tuple
            shadow: Add drop shadow
            
        Returns:
            Modified frame_rgba
        """
        # Draw main text only (no shadow)
        text_layer = Image.new('RGBA', frame_rgba.size, (0, 0, 0, 0))
        text_draw = ImageDraw.Draw(text_layer)
        text_draw.text(position, text, font=font, fill=text_color)
        frame_rgba = Image.alpha_composite(frame_rgba, text_layer)
        
        return frame_rgba
    
    @staticmethod
    def hex_to_rgba(hex_color: str, alpha: int = 255) -> Tuple[int, int, int, int]:
        """
        Convert hex color to RGBA tuple.
        
        Args:
            hex_color: Hex string like 'FF0000' or '#FF0000'
            alpha: Alpha value (0-255)
            
        Returns:
            RGBA tuple
        """
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return (r, g, b, alpha)
    
    @staticmethod
    def apply_alpha(color: Tuple[int, int, int], alpha: float) -> Tuple[int, int, int, int]:
        """
        Apply alpha to RGB color.
        
        Args:
            color: RGB tuple
            alpha: Alpha 0.0 to 1.0
            
        Returns:
            RGBA tuple
        """
        return (color[0], color[1], color[2], int(255 * alpha))


# =============================================================================
# Standalone functions
# =============================================================================

def add_glow_text(frame_rgba: Image.Image, text: str, position: Tuple[int, int],
                  font, text_color: Tuple[int, int, int],
                  glow_color: Tuple[int, int, int] = (255, 200, 80),
                  transparency: float = 0.9) -> Image.Image:
    """
    Simple function interface for adding glow text.
    
    Args:
        frame_rgba: PIL RGBA image
        text: Text to draw
        position: (x, y) position
        font: PIL ImageFont
        text_color: RGB tuple
        glow_color: RGB tuple
        transparency: Text opacity
        
    Returns:
        Modified frame_rgba
    """
    effects = TextEffects()
    text_rgba = (*text_color, int(255 * transparency))
    glow_rgba = (*glow_color, 120)
    return effects.add_glossy_text(frame_rgba, text, position, font, text_rgba, glow_rgba)
