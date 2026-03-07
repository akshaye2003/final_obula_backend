"""
Mask Utilities Module

Person segmentation mask processing including:
- Erosion/blur for text "behind person" effect
- Smart placement analysis (left/center/right)
- Coverage-based font sizing
- Edge detection for split layouts
"""

import os
import cv2
import numpy as np
from typing import Tuple, Optional


class MaskProcessor:
    """
    Processes person segmentation masks for caption placement.
    
    Handles mask erosion, blur, and placement analysis to create
    the "captions behind person" effect.
    
    Example:
        >>> processor = MaskProcessor(erode_pixels=50, blur_radius=5)
        >>> mask = processor.load_mask("mask_00001.npy")
        >>> position = processor.analyze_placement(mask, 1920, 1080)
        >>> processed = processor.process_mask(mask)
    """
    
    def __init__(self, erode_pixels: int = 0, blur_radius: int = 0, 
                 adaptive: bool = True, target_overlap: int = 100):
        """
        Initialize mask processor.
        
        Args:
            erode_pixels: Pixels to erode (0 = use adaptive)
            blur_radius: Gaussian blur radius for soft edges
            adaptive: Enable adaptive erosion based on person position
            target_overlap: Target text-person overlap in pixels
        """
        self.erode_pixels = erode_pixels
        self.blur_radius = blur_radius
        self.adaptive = adaptive
        self.target_overlap = target_overlap
    
    @staticmethod
    def load_mask(mask_path: str) -> np.ndarray:
        """
        Load mask from .npy file.
        
        Args:
            mask_path: Path to .npy mask file
            
        Returns:
            Binary mask as uint8 array (0 or 255)
        """
        return np.load(mask_path)
    
    def process_mask(self, mask_uint8: np.ndarray, 
                     custom_erode: Optional[int] = None) -> np.ndarray:
        """
        Process mask with erosion and blur.
        
        Args:
            mask_uint8: Binary mask (0 or 255)
            custom_erode: Override erosion pixels (optional)
            
        Returns:
            Processed mask as float32 (0.0 to 1.0)
        """
        erode = custom_erode if custom_erode is not None else self.erode_pixels
        
        # Start with binary mask
        mask = (mask_uint8 > 128).astype(np.uint8) * 255
        
        # Apply erosion
        if erode > 0:
            kernel_size = int(erode * 2 + 1)
            kernel = np.ones((kernel_size, kernel_size), np.uint8)
            mask = cv2.erode(mask, kernel, iterations=1)
        
        # Apply blur
        if self.blur_radius > 0:
            mask = cv2.GaussianBlur(mask, (0, 0), self.blur_radius)
        
        # Normalize to 0-1
        return mask.astype(np.float32) / 255.0
    
    def calculate_adaptive_erosion(self, mask_uint8: np.ndarray, 
                                   width: int, height: int,
                                   position: str, font_size: int) -> int:
        """
        Calculate optimal erosion for "text behind person" effect.
        
        Targets specific overlap between text and person mask.
        
        Args:
            mask_uint8: Binary mask
            width: Frame width
            height: Frame height
            position: Caption position ('left', 'center', 'right')
            font_size: Font size in pixels
            
        Returns:
            Optimal erosion in pixels
        """
        if mask_uint8.dtype != np.uint8:
            mask_uint8 = (mask_uint8 * 255).astype(np.uint8)
        
        # Find person bounds
        y_idx, x_idx = np.where(mask_uint8 > 128)
        if len(x_idx) == 0:
            return self.erode_pixels
        
        person_left = x_idx.min()
        person_right = x_idx.max()
        
        # Estimate text position and width
        text_x = 30
        text_width = 650
        text_end = text_x + text_width
        
        if position == 'left':
            target_person_left = text_end - self.target_overlap
            target_erosion = person_left - target_person_left
            target_erosion = max(50, min(180, target_erosion))
            return int(target_erosion)
        
        elif position == 'right':
            text_start = width - text_end
            target_person_right = text_start - self.target_overlap
            target_erosion = person_right - target_person_right
            target_erosion = max(50, min(180, target_erosion))
            return int(target_erosion)
        
        else:  # center
            return 100
    
    def analyze_placement(self, mask_uint8: np.ndarray, 
                         width: int, height: int) -> str:
        """
        Analyze mask to find optimal text placement.
        
        Divides frame into left/center/right zones and finds
        the zone with least person pixels.
        
        Args:
            mask_uint8: Binary mask
            width: Frame width
            height: Frame height
            
        Returns:
            Position string: 'left', 'center', or 'right'
            
        Example:
            >>> mask = processor.load_mask("mask_00001.npy")
            >>> pos = processor.analyze_placement(mask, 1920, 1080)
            >>> print(f"Place captions on: {pos}")
        """
        # Ensure binary mask
        if mask_uint8.dtype != np.uint8:
            mask_uint8 = (mask_uint8 * 255).astype(np.uint8)
        
        # Divide into zones
        left_zone = mask_uint8[:, :width//3]
        center_zone = mask_uint8[:, width//3:2*width//3]
        right_zone = mask_uint8[:, 2*width//3:]
        
        # Count person pixels in each zone
        left_pixels = np.sum(left_zone > 128)
        center_pixels = np.sum(center_zone > 128)
        right_pixels = np.sum(right_zone > 128)
        
        # Find zone with least person (most background)
        min_pixels = min(left_pixels, center_pixels, right_pixels)
        
        if min_pixels == left_pixels:
            return 'left'
        elif min_pixels == right_pixels:
            return 'right'
        else:
            return 'center'
    
    def get_person_edges(self, mask_uint8: np.ndarray, 
                        width: int) -> Tuple[int, int]:
        """
        Get left and right edges of person in mask.
        
        Args:
            mask_uint8: Binary mask
            width: Frame width
            
        Returns:
            Tuple of (left_edge, right_edge) in pixels
        """
        mask_binary = (mask_uint8 > 128).astype(np.uint8)
        cols = np.any(mask_binary, axis=0)
        x_coords = np.where(cols)[0]
        
        if len(x_coords) == 0:
            return width // 3, 2 * width // 3
        
        return int(x_coords[0]), int(x_coords[-1])
    
    def calculate_coverage(self, mask_uint8: np.ndarray) -> float:
        """
        Calculate person coverage ratio (0.0 to 1.0).
        
        Args:
            mask_uint8: Binary mask
            
        Returns:
            Coverage ratio
        """
        person_pixels = int(np.sum(mask_uint8 > 128))
        total_pixels = mask_uint8.shape[0] * mask_uint8.shape[1]
        return person_pixels / total_pixels
    
    def calculate_font_scale(self, mask_uint8: np.ndarray, 
                            base_font_size: int) -> int:
        """
        Calculate dynamic font size based on person coverage.
        
        Large person (close-up) -> smaller font
        Small person (wide shot) -> larger font
        
        Args:
            mask_uint8: Binary mask
            base_font_size: Base font size
            
        Returns:
            Adjusted font size
        """
        coverage = self.calculate_coverage(mask_uint8)
        
        if coverage > 0.6:
            scale = 0.50
        elif coverage > 0.45:
            scale = 0.65
        elif coverage > 0.30:
            scale = 0.80
        elif coverage > 0.15:
            scale = 1.00
        else:
            scale = 1.30
        
        result = int(base_font_size * scale)
        return max(24, result)
    
    def check_text_overlap(self, mask_uint8: np.ndarray,
                          text_x: int, text_y: int,
                          text_width: int, text_height: int,
                          max_overlap: float = 0.15) -> bool:
        """
        Check if text would overlap with person.
        
        Args:
            mask_uint8: Binary mask
            text_x: Text X position
            text_y: Text Y position
            text_width: Text width
            text_height: Text height
            max_overlap: Maximum allowed overlap ratio
            
        Returns:
            True if placement is safe (low overlap)
        """
        if mask_uint8 is None:
            return True
        
        if mask_uint8.dtype != np.uint8:
            mask_uint8 = (mask_uint8 * 255).astype(np.uint8)
        
        height, width = mask_uint8.shape
        
        # Clip to bounds
        y_start = max(0, min(text_y, height - 1))
        y_end = max(0, min(text_y + text_height, height))
        x_start = max(0, min(text_x, width - 1))
        x_end = max(0, min(text_x + text_width, width))
        
        if y_end <= y_start or x_end <= x_start:
            return True
        
        # Check overlap
        region = mask_uint8[y_start:y_end, x_start:x_end]
        person_pixels = np.sum(region > 128)
        total_pixels = region.size
        
        if total_pixels == 0:
            return True
        
        overlap_ratio = person_pixels / total_pixels
        return overlap_ratio < max_overlap
    
    def calculate_safe_text_width(self, mask_uint8: np.ndarray,
                                  position: str, width: int, 
                                  height: int, font_size: int) -> int:
        """
        Calculate maximum safe text width for position.
        
        Args:
            mask_uint8: Binary mask
            position: 'left', 'center', or 'right'
            width: Frame width
            height: Frame height
            font_size: Font size
            
        Returns:
            Maximum safe width in pixels
        """
        mask_binary = (mask_uint8 > 128).astype(np.uint8)
        
        if position == 'left':
            # Find first person pixel from left
            for x in range(0, width, 10):
                column = mask_binary[:, x]
                if np.sum(column) > height * 0.1:
                    return max(x - 50, 200)
            return width // 2
        
        elif position == 'right':
            # Find first person pixel from right
            for x in range(width-1, 0, -10):
                column = mask_binary[:, x]
                if np.sum(column) > height * 0.1:
                    return max((width - x) - 50, 200)
            return width // 2
        
        else:  # center
            return width // 3


class MaskInterpolator:
    """
    Interpolates masks between keyframes to reduce generation time.
    
    Generates masks every N frames and interpolates intermediate frames.
    80% reduction in mask generation time with minimal quality loss.
    
    Example:
        >>> interpolator = MaskInterpolator(frame_skip=5)
        >>> # Generate mask for frame 10 (interpolates from frames 5 and 10)
        >>> mask = interpolator.get_interpolated_mask(masks_folder, frame_num=10)
    """
    
    def __init__(self, frame_skip: int = 5):
        """
        Initialize mask interpolator.
        
        Args:
            frame_skip: Generate mask every N frames (1 = every frame, 5 = every 5th)
        """
        self.frame_skip = max(1, frame_skip)
        self._cache = {}  # Cache for loaded masks
        self._max_cache_size = 10
    
    def should_generate_mask(self, frame_num: int) -> bool:
        """
        Check if mask should be generated for this frame.
        
        Args:
            frame_num: Frame number (1-based)
            
        Returns:
            True if mask should be generated
        """
        return (frame_num - 1) % self.frame_skip == 0
    
    def get_interpolated_mask(self, masks_folder: str, frame_num: int,
                              width: int, height: int) -> Optional[np.ndarray]:
        """
        Get mask for frame, interpolated if necessary.
        
        Args:
            masks_folder: Folder containing mask files
            frame_num: Target frame number (1-based)
            width: Frame width
            height: Frame height
            
        Returns:
            Interpolated mask or None if not available
        """
        import os
        
        # Check if exact mask exists
        exact_path = os.path.join(masks_folder, f"mask_{frame_num:05d}.npy")
        if os.path.exists(exact_path):
            return np.load(exact_path)
        
        # Need to interpolate
        # Find nearest generated frames
        prev_frame = ((frame_num - 1) // self.frame_skip) * self.frame_skip + 1
        next_frame = prev_frame + self.frame_skip
        
        # Load or get from cache
        prev_mask = self._load_mask_cached(masks_folder, prev_frame)
        next_mask = self._load_mask_cached(masks_folder, next_frame)
        
        if prev_mask is None:
            # No previous mask, return empty
            return np.ones((height, width), dtype=np.uint8) * 255
        
        if next_mask is None:
            # No next mask, use previous
            return prev_mask
        
        # Interpolate between masks
        # Calculate interpolation factor (0.0 to 1.0)
        factor = (frame_num - prev_frame) / self.frame_skip
        
        return self._interpolate_masks(prev_mask, next_mask, factor)
    
    def _load_mask_cached(self, masks_folder: str, frame_num: int) -> Optional[np.ndarray]:
        """Load mask with LRU caching."""
        cache_key = f"{masks_folder}:{frame_num}"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        mask_path = os.path.join(masks_folder, f"mask_{frame_num:05d}.npy")
        if not os.path.exists(mask_path):
            return None
        
        mask = np.load(mask_path)
        
        # Simple LRU: remove oldest if cache is full
        if len(self._cache) >= self._max_cache_size:
            self._cache.pop(next(iter(self._cache)))
        
        self._cache[cache_key] = mask
        return mask
    
    def _interpolate_masks(self, mask1: np.ndarray, mask2: np.ndarray,
                          factor: float) -> np.ndarray:
        """
        Interpolate between two binary masks.
        
        Uses morphological interpolation for better quality.
        
        Args:
            mask1: First mask (earlier frame)
            mask2: Second mask (later frame)
            factor: Interpolation factor (0.0 = mask1, 1.0 = mask2)
            
        Returns:
            Interpolated mask
        """
        # Ensure same shape
        if mask1.shape != mask2.shape:
            mask2 = cv2.resize(mask2, (mask1.shape[1], mask1.shape[0]))
        
        # Convert to float for interpolation
        m1 = mask1.astype(np.float32) / 255.0
        m2 = mask2.astype(np.float32) / 255.0
        
        # Linear interpolation
        interpolated = m1 * (1 - factor) + m2 * factor
        
        # Threshold back to binary
        result = (interpolated >= 0.5).astype(np.uint8) * 255
        
        return result
    
    def estimate_total_masks(self, total_frames: int) -> int:
        """
        Estimate number of masks that will be generated.
        
        Args:
            total_frames: Total video frames
            
        Returns:
            Estimated mask count
        """
        return (total_frames + self.frame_skip - 1) // self.frame_skip
    
    def clear_cache(self):
        """Clear the mask cache to free memory."""
        self._cache.clear()

