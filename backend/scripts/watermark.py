"""
Watermark Module

Adds branded watermark to videos with customizable:
- Text or image watermark
- Position (corners, center, custom)
- Opacity
- Size
- Animation (pulse, fade, static)
"""

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from typing import Optional, Tuple, Union
import os


class WatermarkRenderer:
    """
    Render watermarks on video frames.
    
    Supports:
    - Text watermarks with custom fonts
    - Image/logo watermarks (PNG with alpha)
    - Multiple positions
    - Opacity control
    - Animated effects
    
    Example:
        >>> renderer = WatermarkRenderer()
        >>> frame_with_watermark = renderer.add_text_watermark(
        ...     frame, "OBULA", position="bottom-right", opacity=0.7
        ... )
    """
    
    # Position mappings (x, y) as percentage of frame
    POSITIONS = {
        'top-left': (0.02, 0.02),
        'top-right': (0.98, 0.02),
        'bottom-left': (0.02, 0.98),
        'bottom-right': (0.98, 0.98),
        'center': (0.5, 0.5),
        'top-center': (0.5, 0.02),
        'bottom-center': (0.5, 0.98),
    }
    
    def __init__(self, font_path: Optional[str] = None):
        """
        Initialize watermark renderer.
        
        Args:
            font_path: Path to font file (TTF/OTF). Uses default if not provided.
        """
        self.font_path = font_path or self._get_default_font()
        
    def _get_default_font(self) -> str:
        """Get system default font path."""
        # Try common font locations
        font_paths = [
            # Windows
            'C:/Windows/Fonts/segoeui.ttf',
            'C:/Windows/Fonts/arial.ttf',
            'C:/Windows/Fonts/calibri.ttf',
            # Linux
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
            # macOS
            '/System/Library/Fonts/Helvetica.ttc',
            '/Library/Fonts/Arial.ttf',
        ]
        
        for path in font_paths:
            if os.path.exists(path):
                return path
        
        # Fallback - will use PIL default
        return ""
    
    def _get_font(self, size: int) -> ImageFont.FreeTypeFont:
        """Load font at given size."""
        try:
            if self.font_path and os.path.exists(self.font_path):
                return ImageFont.truetype(self.font_path, size)
        except Exception as e:
            print(f"[Watermark] Font load error: {e}")
        
        # Fallback to default
        return ImageFont.load_default()
    
    def add_text_watermark(
        self,
        frame: np.ndarray,
        text: str,
        position: Union[str, Tuple[float, float]] = "bottom-right",
        opacity: float = 0.6,
        size: int = 24,
        color: Tuple[int, int, int] = (255, 255, 255),
        shadow: bool = True,
        padding: int = 20
    ) -> np.ndarray:
        """
        Add text watermark to a frame.
        
        Args:
            frame: Input frame (BGR from OpenCV)
            text: Watermark text
            position: Position name ('bottom-right', 'center', etc.) or (x, y) tuple (0-1)
            opacity: Opacity 0.0-1.0
            size: Font size in pixels
            color: RGB color tuple
            shadow: Add shadow/glow for visibility
            padding: Padding from edges in pixels
            
        Returns:
            Frame with watermark (BGR)
        """
        if not text:
            return frame
        
        # Convert to RGBA for compositing
        if len(frame.shape) == 2:  # Grayscale
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_GRAY2RGB)
        else:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        pil_img = Image.fromarray(frame_rgb).convert('RGBA')
        overlay = Image.new('RGBA', pil_img.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        
        # Load font
        font = self._get_font(size)
        
        # Get text dimensions
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        
        # Calculate position
        frame_w, frame_h = pil_img.size
        
        if isinstance(position, str):
            pos_norm = self.POSITIONS.get(position, self.POSITIONS['bottom-right'])
        else:
            pos_norm = position
        
        # Calculate actual pixel position
        if pos_norm[0] < 0.5:  # Left side
            x = padding
        elif pos_norm[0] == 0.5:  # Center
            x = (frame_w - text_w) // 2
        else:  # Right side
            x = frame_w - text_w - padding
        
        if pos_norm[1] < 0.5:  # Top
            y = padding
        elif pos_norm[1] == 0.5:  # Center
            y = (frame_h - text_h) // 2
        else:  # Bottom
            y = frame_h - text_h - padding
        
        # Draw shadow for visibility
        if shadow:
            shadow_offset = max(2, size // 12)
            shadow_color = (0, 0, 0, int(255 * opacity * 0.5))
            for offset in range(shadow_offset, 0, -1):
                draw.text(
                    (x + offset, y + offset),
                    text,
                    font=font,
                    fill=shadow_color
                )
        
        # Draw main text
        alpha = int(255 * opacity)
        text_color = (*color, alpha)
        draw.text((x, y), text, font=font, fill=text_color)
        
        # Composite
        result = Image.alpha_composite(pil_img, overlay)
        
        # Convert back to BGR
        return cv2.cvtColor(np.array(result.convert('RGB')), cv2.COLOR_RGB2BGR)
    
    def add_image_watermark(
        self,
        frame: np.ndarray,
        image_path: str,
        position: Union[str, Tuple[float, float]] = "bottom-right",
        opacity: float = 0.6,
        scale: float = 0.1,
        padding: int = 20
    ) -> np.ndarray:
        """
        Add image/logo watermark to a frame.
        
        Args:
            frame: Input frame (BGR from OpenCV)
            image_path: Path to watermark image (PNG with alpha preferred)
            position: Position name or (x, y) tuple
            opacity: Opacity 0.0-1.0
            scale: Scale relative to frame width (0.1 = 10% of frame width)
            padding: Padding from edges
            
        Returns:
            Frame with watermark (BGR)
        """
        if not os.path.exists(image_path):
            print(f"[Watermark] Image not found: {image_path}")
            return frame
        
        # Load watermark image
        watermark = Image.open(image_path).convert('RGBA')
        
        # Get frame dimensions
        frame_h, frame_w = frame.shape[:2]
        
        # Calculate new size
        new_w = int(frame_w * scale)
        aspect = watermark.height / watermark.width
        new_h = int(new_w * aspect)
        
        # Resize watermark
        watermark = watermark.resize((new_w, new_h), Image.LANCZOS)
        
        # Adjust opacity
        if opacity < 1.0:
            alpha = np.array(watermark)[:, :, 3]
            alpha = (alpha * opacity).astype(np.uint8)
            watermark.putalpha(Image.fromarray(alpha))
        
        # Calculate position
        if isinstance(position, str):
            pos_norm = self.POSITIONS.get(position, self.POSITIONS['bottom-right'])
        else:
            pos_norm = position
        
        if pos_norm[0] < 0.5:  # Left
            x = padding
        elif pos_norm[0] == 0.5:  # Center
            x = (frame_w - new_w) // 2
        else:  # Right
            x = frame_w - new_w - padding
        
        if pos_norm[1] < 0.5:  # Top
            y = padding
        elif pos_norm[1] == 0.5:  # Center
            y = (frame_h - new_h) // 2
        else:  # Bottom
            y = frame_h - new_h - padding
        
        # Convert frame to PIL
        if len(frame.shape) == 2:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_GRAY2RGB)
        else:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        pil_img = Image.fromarray(frame_rgb).convert('RGBA')
        
        # Paste watermark
        pil_img.paste(watermark, (x, y), watermark)
        
        # Convert back
        return cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)


def apply_watermark_to_video(
    input_video: str,
    output_video: str,
    text: Optional[str] = None,
    image_path: Optional[str] = None,
    position: str = "bottom-right",
    opacity: float = 0.6,
    font_size: int = 24,
    fps: Optional[int] = None
) -> bool:
    """
    Apply watermark to entire video file.
    
    Args:
        input_video: Input video path
        output_video: Output video path
        text: Text watermark (if using text)
        image_path: Image watermark path (if using image)
        position: Watermark position
        opacity: Opacity 0.0-1.0
        font_size: Font size for text watermark
        fps: Output FPS (uses input FPS if None)
        
    Returns:
        True if successful
    """
    try:
        # Open input video
        cap = cv2.VideoCapture(input_video)
        if not cap.isOpened():
            print(f"[Watermark] Cannot open video: {input_video}")
            return False
        
        # Get video properties
        frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        input_fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        output_fps = fps or input_fps
        
        # Setup output writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video, fourcc, output_fps, (frame_w, frame_h))
        
        if not out.isOpened():
            print(f"[Watermark] Cannot create output: {output_video}")
            cap.release()
            return False
        
        # Initialize renderer
        renderer = WatermarkRenderer()
        
        # Process frames
        frame_count = 0
        print(f"[Watermark] Processing {total_frames} frames...")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Add watermark
            if image_path and os.path.exists(image_path):
                frame = renderer.add_image_watermark(
                    frame, image_path, position, opacity
                )
            elif text:
                frame = renderer.add_text_watermark(
                    frame, text, position, opacity, font_size
                )
            
            out.write(frame)
            
            frame_count += 1
            if frame_count % 100 == 0:
                progress = (frame_count / total_frames) * 100
                print(f"[Watermark] Progress: {progress:.1f}%")
        
        # Cleanup
        cap.release()
        out.release()
        
        print(f"[Watermark] Completed: {output_video}")
        return True
        
    except Exception as e:
        print(f"[Watermark] Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    # Test
    import tempfile
    
    # Create test frame
    test_frame = np.ones((1080, 1920, 3), dtype=np.uint8) * 128
    
    renderer = WatermarkRenderer()
    
    # Test text watermark
    result = renderer.add_text_watermark(
        test_frame, "OBULA", position="bottom-right", opacity=0.7, size=32
    )
    
    # Save test
    cv2.imwrite("watermark_test.jpg", result)
    print("Test watermark saved to watermark_test.jpg")
