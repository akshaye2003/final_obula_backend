"""
Text Animator Module

Animation calculations for text effects:
- Fade in
- Slide up
- Hard cut with fade out
"""

from typing import Tuple, Dict, Optional


class TextAnimator:
    """
    Calculates animated text positions and alpha values.
    
    All methods are pure functions - no state maintained.
    
    Example:
        >>> animator = TextAnimator()
        >>> x, y, alpha = animator.animate(
        ...     position=(100, 200),
        ...     frame=15,
        ...     animation_type='slide_up',
        ...     duration=45,
        ...     distance=200
        ... )
    """
    
    def __init__(self, default_params: Optional[Dict] = None):
        """
        Initialize animator with default parameters.
        
        Args:
            default_params: Default animation parameters
        """
        self.default_params = default_params or {
            'fade_duration': 30,      # frames
            'slide_duration': 45,     # frames
            'slide_distance': 200,    # pixels
            'fade_out_duration': 20,  # frames
        }
    
    def animate(self, position: Tuple[int, int], frame_number: int,
                animation_type: str, params: Optional[Dict] = None,
                caption_duration_frames: Optional[int] = None) -> Tuple[int, int, float]:
        """
        Calculate animated position and alpha.
        
        Args:
            position: Base (x, y) position
            frame_number: Current frame in animation
            animation_type: 'fade_in', 'slide_up', 'hard_cut_fade_out'
            params: Override default parameters
            caption_duration_frames: Total frames caption is shown (for fade out)
            
        Returns:
            Tuple of (x, y, alpha) where alpha is 0.0 to 1.0
            
        Example:
            >>> animator = TextAnimator()
            >>> # Slide up animation at frame 20
            >>> x, y, alpha = animator.animate(
            ...     (100, 400), 20, 'slide_up',
            ...     {'slide_duration': 45, 'slide_distance': 200}
            ... )
        """
        params = params or self.default_params
        x, y = position
        alpha = 1.0
        
        if animation_type == "fade_in":
            duration = params.get('fade_duration', 30)
            alpha = min(1.0, frame_number / duration)
        
        elif animation_type == "slide_up":
            duration = params.get('slide_duration', 45)
            distance = params.get('slide_distance', 200)
            
            if frame_number < duration:
                progress = frame_number / duration
                # Ease out cubic
                progress = 1 - pow(1 - progress, 3)
                y += int(distance * (1 - progress))
                alpha = progress
        
        elif animation_type == "hard_cut_fade_out":
            if caption_duration_frames:
                fade_out_duration = params.get('fade_out_duration', 20)
                visible_until = caption_duration_frames - fade_out_duration
                
                if frame_number < visible_until:
                    alpha = 1.0  # Full opacity while visible
                else:
                    # Fade out phase
                    fade_progress = (frame_number - visible_until) / fade_out_duration
                    alpha = max(0.0, 1.0 - fade_progress)
            else:
                alpha = 1.0
        
        elif animation_type == "marquee_scroll":
            # Marquee scroll: text moves from left to right
            # Progress is based on frame number relative to caption duration
            if caption_duration_frames and caption_duration_frames > 0:
                progress = frame_number / caption_duration_frames
                # Start off-screen left, end off-screen right
                # This will be handled by the renderer using this progress
                alpha = 1.0
            else:
                alpha = 1.0
        
        elif animation_type == "split_caption":
            # Split captions: no animation movement, just word highlighting
            # Alpha is always full, highlighting handled by renderer
            alpha = 1.0
        
        return x, y, alpha
    
    def calculate_staggered_frame(self, base_frame: int, 
                                  line_index: int, 
                                  stagger_delay: int = 8) -> int:
        """
        Calculate frame number with stagger delay for multi-line animations.
        
        Args:
            base_frame: Base animation frame
            line_index: Line index (0, 1, 2...)
            stagger_delay: Frames to delay each line
            
        Returns:
            Adjusted frame number
        """
        return base_frame - (line_index * stagger_delay)
    
    @staticmethod
    def ease_out_cubic(t: float) -> float:
        """Ease out cubic interpolation."""
        return 1 - pow(1 - t, 3)
    
    @staticmethod
    def ease_out_quad(t: float) -> float:
        """Ease out quadratic interpolation."""
        return 1 - (1 - t) * (1 - t)
    
    @staticmethod
    def ease_in_out_cubic(t: float) -> float:
        """Ease in-out cubic interpolation."""
        return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


# =============================================================================
# Standalone functions
# =============================================================================

def animate_text(position: Tuple[int, int], frame_number: int,
                 animation_type: str = 'hard_cut_fade_out',
                 **kwargs) -> Tuple[int, int, float]:
    """
    Simple function interface for text animation.
    
    Args:
        position: (x, y) base position
        frame_number: Current frame
        animation_type: Animation type
        **kwargs: Animation parameters
        
    Returns:
        (x, y, alpha) tuple
        
    Example:
        >>> x, y, alpha = animate_text((100, 200), 30, 'slide_up', slide_distance=150)
    """
    animator = TextAnimator()
    return animator.animate(position, frame_number, animation_type, kwargs)
