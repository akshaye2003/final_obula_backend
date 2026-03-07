"""
Font Manager Module

Handles font loading with intelligent caching and fallback mechanisms.
Supports multiple font types: regular, bold, extra-bold, cursive, impact.
"""

import os
from PIL import ImageFont
from typing import Optional, Dict, List
from .config import FONT_PATHS


class FontManager:
    """
    Manages font loading with caching for optimal performance.
    
    Attributes:
        cache: Dictionary mapping (font_name, size) -> ImageFont
        font_paths: Dictionary of font names to possible file paths
    
    Example:
        >>> fm = FontManager()
        >>> font = fm.get_font('bold', 110)
        >>> cursive = fm.get_font('cursive', 100)
    """
    
    def __init__(self, font_paths: Optional[Dict[str, List[str]]] = None):
        """
        Initialize font manager with caching.
        
        Args:
            font_paths: Optional custom font paths. Uses config.FONT_PATHS if None.
        """
        self.cache: Dict[str, ImageFont.FreeTypeFont] = {}
        self.font_paths = font_paths or FONT_PATHS
    
    def get_font(self, font_name: str, size: int) -> ImageFont.FreeTypeFont:
        """
        Load font with caching.
        
        Tries multiple paths in order. Falls back to default if none work.
        
        Args:
            font_name: Font type ('regular', 'bold', 'extra-bold', 'cursive', 'impact')
            size: Font size in pixels
            
        Returns:
            Loaded ImageFont object
            
        Example:
            >>> fm = FontManager()
            >>> font = fm.get_font('cursive', 120)
        """
        cache_key = f"{font_name}_{size}"
        
        # Check cache first
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        # Try each path for this font type
        if font_name in self.font_paths:
            for path in self.font_paths[font_name]:
                if os.path.exists(path):
                    try:
                        font = ImageFont.truetype(path, size)
                        self.cache[cache_key] = font
                        return font
                    except Exception:
                        continue
        
        # Try common system fallbacks (Linux production paths)
        fallbacks = [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
        ]
        for path in fallbacks:
            if os.path.exists(path):
                try:
                    font = ImageFont.truetype(path, size)
                    self.cache[cache_key] = font
                    return font
                except Exception:
                    continue
        
        # Ultimate fallback: default font
        font = ImageFont.load_default()
        self.cache[cache_key] = font
        return font
    
    def get_text_size(self, text: str, font_name: str, size: int) -> tuple:
        """
        Get text dimensions without rendering.
        
        Args:
            text: Text to measure
            font_name: Font type
            size: Font size
            
        Returns:
            Tuple of (width, height) in pixels
        """
        font = self.get_font(font_name, size)
        
        # Use getbbox for PIL >= 8.0
        if hasattr(font, 'getbbox'):
            bbox = font.getbbox(text)
            return (bbox[2] - bbox[0], bbox[3] - bbox[1])
        else:
            # Fallback for older PIL
            return font.getsize(text)
    
    def clear_cache(self) -> None:
        """Clear the font cache to free memory."""
        self.cache.clear()
    
    def preload_fonts(self, size: int) -> None:
        """
        Preload all font types at given size for faster rendering.
        
        Args:
            size: Font size to preload
        """
        for font_name in self.font_paths.keys():
            self.get_font(font_name, size)


# =============================================================================
# Standalone functions for simple usage
# =============================================================================

def get_font(font_name: str, size: int) -> ImageFont.FreeTypeFont:
    """
    Get font using default font manager (simple function interface).
    
    Args:
        font_name: 'regular', 'bold', 'extra-bold', 'cursive', 'impact'
        size: Font size in pixels
        
    Returns:
        Loaded ImageFont
        
    Example:
        >>> from scripts.font_manager import get_font
        >>> font = get_font('bold', 110)
    """
    manager = FontManager()
    return manager.get_font(font_name, size)


def get_text_width(text: str, font_name: str, size: int) -> int:
    """
    Get text width in pixels.
    
    Args:
        text: Text to measure
        font_name: Font type
        size: Font size
        
    Returns:
        Width in pixels
    """
    manager = FontManager()
    width, _ = manager.get_text_size(text, font_name, size)
    return width
