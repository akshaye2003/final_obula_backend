"""
Post-Processing Module
Standalone utilities for video post-processing.

Usage:
    from scripts.post_processor import PostProcessor
    
    pp = PostProcessor()
    pp.convert_aspect_ratio("input.mp4", "output.mp4", "9:16")
    pp.apply_rounded_corners("input.mp4", "output.mp4", radius_style="medium")
    pp.apply_color_grade("input.mp4", "output.mp4", lut_path="filter.cube")
"""

import subprocess
import json
from pathlib import Path
from typing import Literal, Optional, Tuple, Dict
import os


# Aspect ratio canvas sizes (width, height)
ASPECT_RATIOS = {
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "2:3": (1080, 1620),
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
    "21:9": (1920, 822),
}

# Rounded corner radii by style (in pixels)
CORNER_RADII = {
    "none": 0,
    "subtle": 20,
    "medium": 40,
    "heavy": 80,
}


class PostProcessor:
    """
    Standalone post-processing utilities for video files.
    
    Can be used independently from the main caption pipeline.
    """
    
    def __init__(self, verbose: bool = False):
        """
        Initialize post-processor.
        
        Args:
            verbose: Print detailed FFmpeg output
        """
        self.verbose = verbose
    
    def _run_ffmpeg(self, cmd: list, description: str = "Processing") -> bool:
        """Execute FFmpeg command."""
        if self.verbose:
            print(f"[FFmpeg] {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"[Error] {description} failed: {result.stderr[-500:]}")
            return False
        
        print(f"[Success] {description} complete")
        return True
    
    def _get_video_info(self, video_path: str) -> Dict:
        """Get video dimensions and info using ffprobe."""
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration",
            "-of", "json",
            video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            return {"width": 1920, "height": 1080, "fps": 30.0, "duration": 0.0}
        
        try:
            data = json.loads(result.stdout)
            stream = data.get("streams", [{}])[0]
            
            width = stream.get("width", 1920)
            height = stream.get("height", 1080)
            
            # Parse FPS
            fps_str = stream.get("r_frame_rate", "30/1")
            if "/" in fps_str:
                num, den = fps_str.split("/")
                fps = float(num) / float(den) if float(den) != 0 else 30.0
            else:
                fps = float(fps_str)
            
            # Parse duration
            duration = float(stream.get("duration", 0.0))
            
            aspect_ratio = width / height if height > 0 else 1.0
            
            return {
                "width": width,
                "height": height,
                "fps": fps,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "is_vertical": aspect_ratio < 0.8,
                "is_square": 0.9 <= aspect_ratio <= 1.1,
                "is_horizontal": aspect_ratio > 1.2,
            }
        except Exception as e:
            print(f"[Warning] Could not parse video info: {e}")
            return {"width": 1920, "height": 1080, "fps": 30.0, "duration": 0.0}
    
    def convert_aspect_ratio(
        self,
        input_path: str,
        output_path: str,
        target_ratio: Literal["1:1", "4:5", "2:3", "9:16", "16:9", "21:9"],
        strategy: Literal["crop", "pad", "auto"] = "auto"
    ) -> bool:
        """
        Convert video to target aspect ratio.
        
        Args:
            input_path: Input video path
            output_path: Output video path
            target_ratio: Target aspect ratio
            strategy: 'crop' = center crop, 'pad' = blur background, 'auto' = decide based on input
            
        Returns:
            True if successful
            
        Example:
            >>> pp = PostProcessor()
            >>> pp.convert_aspect_ratio("input.mp4", "output.mp4", "9:16")
        """
        if target_ratio not in ASPECT_RATIOS:
            print(f"[Error] Unknown ratio: {target_ratio}")
            print(f"[Info] Available: {', '.join(ASPECT_RATIOS.keys())}")
            return False
        
        # Get input info
        info = self._get_video_info(input_path)
        input_width = info["width"]
        input_height = info["height"]
        fps = info["fps"]
        
        target_width, target_height = ASPECT_RATIOS[target_ratio]
        target_aspect = target_width / target_height
        input_aspect = input_width / input_height
        
        print(f"[Aspect Ratio] Input: {input_width}x{input_height} ({input_aspect:.2f})")
        print(f"[Aspect Ratio] Target: {target_width}x{target_height} ({target_ratio})")
        
        # Determine strategy
        if strategy == "auto":
            if input_aspect > target_aspect:
                strategy = "crop"  # Input wider, crop sides
            elif input_aspect < target_aspect:
                strategy = "pad"   # Input narrower, add blurred background
            else:
                strategy = "crop"  # Same ratio, just scale
        
        print(f"[Aspect Ratio] Strategy: {strategy}")
        
        if strategy == "crop":
            # Center crop to target ratio then scale
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", input_path,
                "-vf",
                f"crop=ih*{target_width}/{target_height}:ih,"
                f"scale={target_width}:{target_height}:force_original_aspect_ratio=disable",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-r", str(fps),
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                "-pix_fmt", "yuv420p",
                output_path
            ]
        else:  # pad with blurred background
            filter_complex = (
                "[0:v]split[original][bg];"
                f"[bg]scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
                f"crop={target_width}:{target_height},boxblur=40:20[blurred];"
                f"[original]scale={target_width}:{target_height}:force_original_aspect_ratio=decrease[scaled];"
                f"[blurred][scaled]overlay=(W-w)/2:(H-h)/2:shortest=1[final]"
            )
            
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", input_path,
                "-filter_complex", filter_complex,
                "-map", "[final]",
                "-map", "0:a?",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-r", str(fps),
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                "-pix_fmt", "yuv420p",
                output_path
            ]
        
        return self._run_ffmpeg(cmd, f"Aspect ratio conversion to {target_ratio}")
    
    def apply_rounded_corners(
        self,
        input_path: str,
        output_path: str,
        radius_style: Literal["none", "subtle", "medium", "heavy"] = "medium",
        radius_px: Optional[int] = None
    ) -> bool:
        """
        Apply rounded corners to video.
        
        Args:
            input_path: Input video path
            output_path: Output video path
            radius_style: Predefined corner style
            radius_px: Custom radius in pixels (overrides style)
            
        Returns:
            True if successful
            
        Example:
            >>> pp = PostProcessor()
            >>> pp.apply_rounded_corners("input.mp4", "output.mp4", "medium")
        """
        # Determine radius
        if radius_px is not None:
            radius = radius_px
        else:
            radius = CORNER_RADII.get(radius_style, 40)
        
        if radius == 0:
            # No corners, just copy
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", input_path,
                "-c", "copy",
                output_path
            ]
            return self._run_ffmpeg(cmd, "Copy (no corners)")
        
        # Get video info for dynamic radius scaling
        info = self._get_video_info(input_path)
        width = info["width"]
        height = info["height"]
        fps = info["fps"]
        
        # Scale radius for lower resolutions
        min_dimension = min(width, height)
        if min_dimension < 500:
            radius = int(radius * 0.6)
        elif min_dimension > 1500:
            radius = int(radius * 1.5)
        
        print(f"[Rounded Corners] Style: {radius_style} | Radius: {radius}px | Resolution: {width}x{height}")
        
        # Create rounded corners using drawbox corners + fill
        # This draws 4 corner arcs using multiple drawbox filters
        # Top-left corner
        filters = []
        
        # Build the complex filter for rounded corners
        # Using alphamerge approach with a generated mask
        filter_complex = (
            f"[0:v]format=rgba,split[main][for_mask];"
            f"[for_mask]geq="
            f"a='if(gt(X,{radius})*lt(X,W-{radius})+gte(X,{radius})*lte(X,W-{radius})*gt(Y,{radius})*lt(Y,H-{radius}),255,"
            f"if(lte(pow(X-{radius},2)+pow(Y-{radius},2),pow({radius},2)),255,"
            f"if(lte(pow(X-(W-{radius}),2)+pow(Y-{radius},2),pow({radius},2)),255,"
            f"if(lte(pow(X-{radius},2)+pow(Y-(H-{radius}),2),pow({radius},2)),255,"
            f"if(lte(pow(X-(W-{radius}),2)+pow(Y-(H-{radius}),2),pow({radius},2)),255,0)))))'[mask];"
            f"[main][mask]alphamerge[rounded];"
            f"[rounded]format=yuv420p[final]"
        )
        
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", input_path,
            "-filter_complex", filter_complex,
            "-map", "[final]",
            "-map", "0:a?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-r", str(fps),
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            "-pix_fmt", "yuv420p",
            output_path
        ]
        
        # Try the advanced approach, fall back to simple if it fails
        result = self._run_ffmpeg(cmd, f"Rounded corners ({radius_style})")
        
        if not result:
            print("[Warning] Advanced filter failed, trying simpler approach...")
            return self._apply_rounded_corners_simple(input_path, output_path, radius, fps)
        
        return result
    
    def _apply_rounded_corners_simple(
        self,
        input_path: str,
        output_path: str,
        radius: int,
        fps: float
    ) -> bool:
        """Fallback simple rounded corners - copies with warning."""
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", input_path,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-r", str(fps),
            "-c:a", "copy",
            output_path
        ]
        print("[Warning] Skipping rounded corners (filter not supported), copying video")
        return self._run_ffmpeg(cmd, "Copy (corners skipped)")
    
    def apply_color_grade(
        self,
        input_path: str,
        output_path: str,
        lut_path: Optional[str] = None,
        brightness: float = 0.0,
        contrast: float = 1.0,
        saturation: float = 1.0,
        gamma: float = 1.0
    ) -> bool:
        """
        Apply color grading to video.
        
        Args:
            input_path: Input video path
            output_path: Output video path
            lut_path: Path to .cube LUT file (optional)
            brightness: Brightness adjustment (-1.0 to 1.0)
            contrast: Contrast multiplier (0.0 to 2.0)
            saturation: Saturation multiplier (0.0 to 2.0)
            gamma: Gamma adjustment (0.1 to 10.0)
            
        Returns:
            True if successful
            
        Example:
            >>> pp = PostProcessor()
            >>> pp.apply_color_grade("input.mp4", "output.mp4", lut_path="film.cube")
            >>> pp.apply_color_grade("input.mp4", "output.mp4", brightness=0.1, contrast=1.1)
        """
        info = self._get_video_info(input_path)
        fps = info["fps"]
        
        filters = []
        
        # Add LUT if provided
        if lut_path and os.path.exists(lut_path):
            lut_escaped = lut_path.replace("\\", "/").replace(":", "\\:")
            filters.append(f"lut3d=file='{lut_escaped}'")
        
        # Add eq filter for adjustments
        if brightness != 0.0 or contrast != 1.0 or saturation != 1.0 or gamma != 1.0:
            filters.append(
                f"eq=brightness={brightness}:contrast={contrast}:"
                f"saturation={saturation}:gamma={gamma}"
            )
        
        # Ensure yuv420p output
        filters.append("format=yuv420p")
        
        filter_str = ",".join(filters) if filters else "format=yuv420p"
        
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", input_path,
            "-vf", filter_str,
            "-c:v", "libx264", "-preset", "slow", "-crf", "18",
            "-r", str(fps),
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            output_path
        ]
        
        return self._run_ffmpeg(cmd, "Color grading")
    
    def stack_process(
        self,
        input_path: str,
        output_path: str,
        aspect_ratio: Optional[str] = None,
        rounded_corners: Optional[str] = None,
        lut_path: Optional[str] = None,
        brightness: float = 0.0,
        contrast: float = 1.0
    ) -> bool:
        """
        Process multiple post-processing steps in one go.
        
        Applies steps in optimal order:
        1. Aspect ratio conversion (if needed)
        2. Color grading (LUT + adjustments)
        3. Rounded corners (last, as it's a visual overlay)
        
        Args:
            input_path: Input video path
            output_path: Final output path
            aspect_ratio: Target aspect ratio (optional)
            rounded_corners: Corner style (optional)
            lut_path: LUT file path (optional)
            brightness: Brightness adjustment
            contrast: Contrast adjustment
            
        Returns:
            True if successful
            
        Example:
            >>> pp = PostProcessor()
            >>> pp.stack_process(
            ...     "input.mp4",
            ...     "output.mp4",
            ...     aspect_ratio="9:16",
            ...     rounded_corners="medium",
            ...     lut_path="film.cube"
            ... )
        """
        current_file = input_path
        temp_files = []
        
        try:
            # Step 1: Aspect ratio conversion
            if aspect_ratio:
                temp_output = output_path.replace(".mp4", f"_{aspect_ratio.replace(':', 'x')}_temp.mp4")
                if self.convert_aspect_ratio(current_file, temp_output, aspect_ratio):
                    if current_file != input_path:
                        os.remove(current_file)
                    current_file = temp_output
                    temp_files.append(temp_output)
                else:
                    print("[Warning] Aspect ratio conversion failed, continuing...")
            
            # Step 2: Color grading
            if lut_path or brightness != 0.0 or contrast != 1.0:
                temp_output = output_path.replace(".mp4", "_graded_temp.mp4")
                if self.apply_color_grade(
                    current_file, temp_output,
                    lut_path=lut_path,
                    brightness=brightness,
                    contrast=contrast
                ):
                    if current_file != input_path and current_file not in temp_files[:-1]:
                        os.remove(current_file)
                    current_file = temp_output
                    temp_files.append(temp_output)
                else:
                    print("[Warning] Color grading failed, continuing...")
            
            # Step 3: Rounded corners (always last)
            if rounded_corners and rounded_corners != "none":
                if self.apply_rounded_corners(current_file, output_path, rounded_corners):
                    if current_file != input_path:
                        os.remove(current_file)
                else:
                    print("[Warning] Rounded corners failed, copying without corners")
                    # Copy to final output
                    cmd = [
                        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                        "-i", current_file,
                        "-c", "copy",
                        output_path
                    ]
                    self._run_ffmpeg(cmd, "Copy to output")
            else:
                # No rounded corners, just move/rename
                if current_file != output_path:
                    if current_file == input_path:
                        # Copy original
                        cmd = [
                            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                            "-i", current_file,
                            "-c", "copy",
                            output_path
                        ]
                        self._run_ffmpeg(cmd, "Copy to output")
                    else:
                        os.rename(current_file, output_path)
            
            # Cleanup temp files
            for f in temp_files:
                if os.path.exists(f) and f != output_path:
                    os.remove(f)
            
            print(f"[Success] Output saved: {output_path}")
            return True
            
        except Exception as e:
            print(f"[Error] Stack processing failed: {e}")
            # Cleanup on error
            for f in temp_files:
                if os.path.exists(f):
                    os.remove(f)
            return False


# =============================================================================
# Standalone functions for simple usage
# =============================================================================

def convert_aspect_ratio(
    input_path: str,
    output_path: str,
    target_ratio: str
) -> bool:
    """Standalone function for aspect ratio conversion."""
    pp = PostProcessor()
    return pp.convert_aspect_ratio(input_path, output_path, target_ratio)


def apply_rounded_corners(
    input_path: str,
    output_path: str,
    radius_style: str = "medium"
) -> bool:
    """Standalone function for rounded corners."""
    pp = PostProcessor()
    return pp.apply_rounded_corners(input_path, output_path, radius_style)


def apply_color_grade(
    input_path: str,
    output_path: str,
    lut_path: Optional[str] = None,
    **kwargs
) -> bool:
    """Standalone function for color grading."""
    pp = PostProcessor()
    return pp.apply_color_grade(input_path, output_path, lut_path=lut_path, **kwargs)


def stack_process(
    input_path: str,
    output_path: str,
    **kwargs
) -> bool:
    """Standalone function for stacked processing."""
    pp = PostProcessor()
    return pp.stack_process(input_path, output_path, **kwargs)


# =============================================================================
# CLI Interface
# =============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Video Post-Processing Tools"
    )
    parser.add_argument("-i", "--input", required=True, help="Input video")
    parser.add_argument("-o", "--output", required=True, help="Output video")
    parser.add_argument(
        "--aspect-ratio",
        choices=list(ASPECT_RATIOS.keys()),
        help="Convert to aspect ratio"
    )
    parser.add_argument(
        "--rounded-corners",
        choices=["none", "subtle", "medium", "heavy"],
        help="Apply rounded corners"
    )
    parser.add_argument("--lut", help="Path to .cube LUT file")
    parser.add_argument("--brightness", type=float, default=0.0)
    parser.add_argument("--contrast", type=float, default=1.0)
    parser.add_argument("-v", "--verbose", action="store_true")
    
    args = parser.parse_args()
    
    pp = PostProcessor(verbose=args.verbose)
    pp.stack_process(
        args.input,
        args.output,
        aspect_ratio=args.aspect_ratio,
        rounded_corners=args.rounded_corners,
        lut_path=args.lut,
        brightness=args.brightness,
        contrast=args.contrast
    )
