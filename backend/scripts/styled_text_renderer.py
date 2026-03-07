"""
Styled Text Renderer Module
============================
Advanced text styling and placement from standalone caption_renderer.py

Features:
- Multi-font styling (regular, bold, extra-bold, cursive)
- Text markers: **bold**, ***extra-bold***, *cursive*, ~emotional~
- Auto-bold for UPPERCASE words
- Custom color support
- Advanced placement logic
"""

import re
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from dataclasses import dataclass
from typing import List, Tuple, Optional, Dict
from pathlib import Path


@dataclass
class CaptionStyle:
    """Style configuration for a word/phrase."""
    text: str
    font_name: str = 'regular'  # 'regular', 'bold', 'extra-bold', 'cursive'
    size_mult: float = 1.0
    color: Tuple[int, int, int] = (255, 255, 255)  # RGB
    outline: bool = False  # No outline by default


class StyledTextRenderer:
    """
    Advanced text renderer with multi-font styling support.
    
    Based on standalone caption_renderer.py styling logic.
    """
    
    # Font paths - customize these for your setup
    FONT_PATHS = {
        'regular': [
            'coolvetica rg.otf',
            'Montserrat-Regular.ttf',
            'C:/Windows/Fonts/Montserrat-Regular.ttf',
            'C:/Windows/Fonts/segoeui.ttf',
            'C:/Windows/Fonts/arial.ttf',
            'arial.ttf',
        ],
        'bold': [
            'coolvetica rg.otf',
            'Montserrat-Bold.ttf',
            'C:/Windows/Fonts/Montserrat-Bold.ttf',
            'C:/Windows/Fonts/segoeuib.ttf',
            'C:/Windows/Fonts/arialbd.ttf',
            'arialbd.ttf',
        ],
        'extra-bold': [
            'Montserrat-Black.ttf',
            'C:/Windows/Fonts/Montserrat-Black.ttf',
            'C:/Windows/Fonts/segoeuib.ttf',
            'C:/Windows/Fonts/arialbd.ttf',
            'arialbd.ttf',
        ],
        'cursive': [
            'Runethia.otf',
            'Runethia.ttf',
            'C:/Windows/Fonts/Runethia.ttf',
            'Pacifico-Regular.ttf',
            'C:/Windows/Fonts/segoepr.ttf',
        ],
    }
    
    # Emotional words that trigger cursive
    EMOTIONAL_WORDS = {
        'believe', 'dream', 'love', 'hope', 'passion', 'amazing',
        'incredible', 'beautiful', 'wonderful', 'fantastic', 'awesome'
    }
    
    def __init__(self, font_size: int = 100, line_spacing: int = 20):
        self.font_size = font_size
        self.line_spacing = line_spacing
        self._fonts: Dict[str, ImageFont.FreeTypeFont] = {}
    
    def _get_font(self, font_name: str, size: int) -> ImageFont.FreeTypeFont:
        """Load font with caching."""
        cache_key = f"{font_name}_{size}"
        if cache_key in self._fonts:
            return self._fonts[cache_key]
        
        # Try custom paths first
        for path in self.FONT_PATHS.get(font_name, self.FONT_PATHS['regular']):
            if Path(path).exists():
                try:
                    font = ImageFont.truetype(path, size)
                    self._fonts[cache_key] = font
                    return font
                except:
                    continue
        
        # Fallback to default
        font = ImageFont.load_default()
        self._fonts[cache_key] = font
        return font
    
    def parse_styled_text(self, text: str) -> List[CaptionStyle]:
        """
        Parse text with style markers into styled chunks.
        
        Markers:
            **word** -> bold
            ***word*** -> extra-bold
            *word* -> cursive
            ~word~ -> cursive (emotional)
            #RRGGBB#word#/ -> custom color
            UPPERCASE -> auto-bold
        """
        words = text.split()
        result = []
        
        for word in words:
            font_name = 'regular'
            size_mult = 1.0
            color = (255, 255, 255)
            
            # Remove punctuation for checking
            clean = word.strip('!@#$%^&*()[]{},.<>?/\'"";:')
            
            # Auto-bold for UPPERCASE words (>2 chars)
            if clean.isupper() and len(clean) > 2:
                font_name = 'bold'
                size_mult = 1.15
            
            # Auto-cursive for emotional words
            elif clean.lower() in self.EMOTIONAL_WORDS:
                font_name = 'cursive'
                size_mult = 1.1
            
            # Parse manual markers
            # Extra-bold: ***word***
            if '***' in word:
                match = re.search(r'\*\*\*([^*]+)\*\*\*', word)
                if match:
                    word = match.group(1)
                    font_name = 'extra-bold'
                    size_mult = 1.3
            
            # Bold: **word**
            elif '**' in word:
                match = re.search(r'\*\*([^*]+)\*\*', word)
                if match:
                    word = match.group(1)
                    font_name = 'bold'
                    size_mult = 1.15
            
            # Cursive: *word*
            elif '*' in word:
                match = re.search(r'\*([^*]+)\*', word)
                if match:
                    word = match.group(1)
                    font_name = 'cursive'
                    size_mult = 1.0
            
            # Emotional cursive: ~word~
            elif '~' in word:
                match = re.search(r'~([^~]+)~', word)
                if match:
                    word = match.group(1)
                    font_name = 'cursive'
                    size_mult = 1.1
            
            # Custom color: #RRGGBB#word#/
            color_match = re.search(r'#([0-9A-Fa-f]{6})#([^#]+)#/', word)
            if color_match:
                hex_color = color_match.group(1)
                word = color_match.group(2)
                color = (
                    int(hex_color[0:2], 16),
                    int(hex_color[2:4], 16),
                    int(hex_color[4:6], 16)
                )
            
            result.append(CaptionStyle(word, font_name, size_mult, color))
        
        return result if result else [CaptionStyle(text)]
    
    def calculate_animation(self, frame_idx: int, duration: int, 
                           animation: str) -> Tuple[int, int, float]:
        """
        Calculate animation offsets and alpha.
        
        Returns: (x_offset, y_offset, alpha_multiplier)
        """
        if animation == 'none':
            return 0, 0, 1.0
        
        if animation == 'fade_in':
            fade_frames = min(10, duration // 4)
            if frame_idx < fade_frames:
                alpha = frame_idx / fade_frames
            else:
                alpha = 1.0
            return 0, 0, alpha
        
        if animation == 'slide_up':
            slide_frames = min(15, duration // 3)
            distance = 50
            if frame_idx < slide_frames:
                progress = frame_idx / slide_frames
                y_offset = int(distance * (1 - progress))
                alpha = progress
            else:
                y_offset = 0
                alpha = 1.0
            return 0, y_offset, alpha
        
        if animation == 'hard_cut_fade_out':
            fade_start = max(0, duration - 8)
            if frame_idx >= fade_start:
                fade_progress = (frame_idx - fade_start) / (duration - fade_start)
                alpha = 1.0 - (fade_progress * 0.8)
            else:
                alpha = 1.0
            return 0, 0, alpha
        
        return 0, 0, 1.0
    
    def render_styled_line(self, draw: ImageDraw.Draw, line: str, 
                          position: Tuple[int, int], frame_width: int,
                          position_align: str = 'left',
                          alpha: float = 1.0) -> int:
        """
        Render a line of text with styling.
        
        Args:
            draw: PIL ImageDraw
            line: Text line to render
            position: (x, y) position
            frame_width: Width of frame for alignment
            position_align: 'left', 'center', or 'right'
            alpha: Opacity multiplier
            
        Returns:
            X position where text was drawn
        """
        styled_chunks = self.parse_styled_text(line)
        
        # Calculate total width for positioning
        total_width = 0
        chunk_sizes = []
        
        for chunk in styled_chunks:
            size = int(self.font_size * chunk.size_mult)
            font = self._get_font(chunk.font_name, size)
            bbox = draw.textbbox((0, 0), chunk.text, font=font)
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            chunk_sizes.append((width, height, font, chunk))
            total_width += width + 15  # 15px spacing between chunks
        
        total_width -= 15  # Remove last spacing
        
        # Calculate X position based on alignment
        if position_align == 'center':
            x = (frame_width - total_width) // 2
        elif position_align == 'right':
            x = frame_width - total_width - 50
        else:  # left
            x = 50
        
        y = position[1]
        
        # Draw each chunk
        current_x = x
        for width, height, font, chunk in chunk_sizes:
            # Apply transparency
            color = tuple(int(c * alpha) for c in chunk.color)
            
            # Draw text without outline
            draw.text((current_x, y), chunk.text, font=font, fill=color)
            
            current_x += width + 15
        
        return x
    
    def _draw_text_with_outline(self, draw: ImageDraw.Draw, text: str,
                                position: Tuple[int, int], font,
                                fill: Tuple[int, int, int],
                                outline_thickness: int = 0):
        """Draw text without outline (kept for compatibility)."""
        # Draw main text only
        draw.text(position, text, font=font, fill=fill)
    
    def render_on_frame(self, frame: np.ndarray, lines: List[str],
                       position: str = 'left',
                       animation: str = 'hard_cut_fade_out',
                       frame_in_caption: int = 0,
                       caption_duration: int = 30) -> np.ndarray:
        """
        Render styled captions on a video frame.
        
        Args:
            frame: Input video frame (BGR numpy array)
            lines: List of caption lines
            position: 'left', 'center', or 'right'
            animation: Animation style
            frame_in_caption: Current frame index within caption
            caption_duration: Total frames this caption will show
            
        Returns:
            Frame with captions rendered
        """
        height, width = frame.shape[:2]
        
        # Create PIL image for text rendering
        text_layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(text_layer)
        
        # Calculate animation
        x_offset, y_offset, anim_alpha = self.calculate_animation(
            frame_in_caption, caption_duration, animation
        )
        
        # Calculate vertical positioning
        line_height = int(self.font_size * 1.2)
        total_height = len(lines) * line_height + (len(lines) - 1) * self.line_spacing
        start_y = (height - total_height) // 2 + y_offset
        
        # Render each line
        for i, line in enumerate(lines):
            y = start_y + i * (line_height + self.line_spacing)
            self.render_styled_line(
                draw, line, (0, y), width,
                position_align=position,
                alpha=anim_alpha
            )
        
        # Composite with frame
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_pil = Image.fromarray(frame_rgb).convert('RGBA')
        result = Image.alpha_composite(frame_pil, text_layer)
        result_rgb = result.convert('RGB')
        
        return cv2.cvtColor(np.array(result_rgb), cv2.COLOR_RGB2BGR)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def add_styled_caption_to_frame(frame: np.ndarray, text: str,
                                position: str = 'left',
                                font_size: int = 100,
                                animation: str = 'hard_cut_fade_out',
                                frame_idx: int = 0,
                                duration: int = 30) -> np.ndarray:
    """
    Simple function to add styled caption to a single frame.
    
    Example:
        frame = add_styled_caption_to_frame(
            frame, 
            "This is **bold** and *cursive* text",
            position='center'
        )
    """
    renderer = StyledTextRenderer(font_size=font_size)
    return renderer.render_on_frame(
        frame, [text], position, animation, frame_idx, duration
    )


def parse_caption_with_styles(text: str) -> List[CaptionStyle]:
    """
    Parse caption text and return styled chunks.
    
    Example:
        chunks = parse_caption_with_styles("This is **bold** text")
        for chunk in chunks:
            print(f"{chunk.text}: {chunk.font_name}, {chunk.size_mult}x")
    """
    renderer = StyledTextRenderer()
    return renderer.parse_styled_text(text)

