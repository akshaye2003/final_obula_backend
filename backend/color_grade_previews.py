"""
Color Grade Preview Generator - Creates preview frames for each color grade.
"""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List
import requests

from observability import logger, metrics, Timer

# Available color grades with their LUT files
COLOR_GRADES = {
    "vintage": {
        "lut": "color_grading/02_Film LUTs_Vintage.cube",
        "display_name": "Vintage",
        "description": "Warm, nostalgic film look"
    },
    "cinematic": {
        "lut": "color_grading/07_Cinematic LUTs_Flavin.cube",
        "display_name": "Cinematic",
        "description": "Hollywood movie style"
    },
    "frosted": {
        "lut": "color_grading/04_Cinematic LUTs_Frosted.cube",
        "display_name": "Frosted",
        "description": "Cool, winter tones"
    },
    "foliage": {
        "lut": "color_grading/05_Film LUTs_Foliage.cube",
        "display_name": "Foliage",
        "description": "Enhanced greens for nature"
    },
    "cross_process": {
        "lut": "color_grading/02_Film Emulation LUTs_Cross Process.cube",
        "display_name": "Cross Process",
        "description": "Experimental film look"
    },
    "bw": {
        "lut": None,  # Special handling for B&W
        "display_name": "Black & White",
        "description": "Classic monochrome"
    }
}


def extract_frame(video_path: str, timestamp: float = 1.0, output_path: str = None) -> str:
    """
    Extract a single frame from video at specified timestamp.
    
    Args:
        video_path: Path to input video
        timestamp: Time in seconds (default: 1.0)
        output_path: Where to save frame (default: temp file)
    
    Returns:
        Path to extracted frame
    """
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".jpg")
    
    cmd = [
        "ffmpeg",
        "-y",  # Overwrite output
        "-ss", str(timestamp),  # Seek to timestamp
        "-i", video_path,
        "-vframes", "1",  # Extract 1 frame
        "-q:v", "2",  # High quality
        "-vf", "scale=640:-1",  # Scale width to 640px, keep aspect
        output_path
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            logger.error("ffmpeg_extract_frame_failed", 
                        error=result.stderr,
                        video_path=video_path)
            raise Exception(f"FFmpeg failed: {result.stderr}")
        
        if not os.path.exists(output_path):
            raise Exception("Frame extraction produced no output")
        
        return output_path
        
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg_extract_frame_timeout", video_path=video_path)
        raise


def apply_color_grade(input_frame: str, output_frame: str, grade: str) -> str:
    """
    Apply color grade to a frame using FFmpeg and LUT.
    
    Args:
        input_frame: Path to input frame
        output_frame: Path for output
        grade: Color grade name (vintage, cinematic, etc.)
    
    Returns:
        Path to graded frame
    """
    grade_info = COLOR_GRADES.get(grade)
    if not grade_info:
        raise ValueError(f"Unknown color grade: {grade}")
    
    lut_path = grade_info.get("lut")
    
    if grade == "bw":
        # Black & white - no LUT needed
        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_frame,
            "-vf", "format=gray",
            "-q:v", "2",
            output_frame
        ]
    elif lut_path and os.path.exists(lut_path):
        # Apply LUT
        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_frame,
            "-vf", f"lut3d='{lut_path}'",
            "-q:v", "2",
            output_frame
        ]
    else:
        # No LUT available, just copy
        logger.warning("lut_not_found", grade=grade, lut_path=lut_path)
        cmd = ["cp", input_frame, output_frame]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            logger.error("ffmpeg_color_grade_failed",
                        grade=grade,
                        error=result.stderr)
            raise Exception(f"Color grading failed: {result.stderr}")
        
        return output_frame
        
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg_color_grade_timeout", grade=grade)
        raise


async def generate_color_grade_previews(
    video_path: str,
    video_id: str,
    supabase_client
) -> Dict[str, str]:
    """
    Generate color grade preview frames for a video.
    
    Args:
        video_path: Local path to video file
        video_id: Video ID for naming
        supabase_client: Supabase client for storage
    
    Returns:
        Dict mapping grade name to preview URL
    """
    previews = {}
    
    with Timer("generate_color_grade_previews", video_id=video_id):
        # Extract base frame
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as base_frame:
            base_frame_path = base_frame.name
        
        try:
            extract_frame(video_path, timestamp=1.0, output_path=base_frame_path)
            
            # Generate preview for each grade
            for grade_name in COLOR_GRADES.keys():
                try:
                    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as output:
                        output_path = output.name
                    
                    # Apply color grade
                    apply_color_grade(base_frame_path, output_path, grade_name)
                    
                    # Upload to Supabase
                    storage_path = f"{video_id}/{grade_name}.jpg"
                    
                    with open(output_path, "rb") as f:
                        upload_result = supabase_client.storage \
                            .from_("previews") \
                            .upload(storage_path, f, {"content-type": "image/jpeg"})
                    
                    # Get public URL
                    preview_url = supabase_client.storage \
                        .from_("previews") \
                        .get_public_url(storage_path)
                    
                    previews[grade_name] = preview_url
                    
                    logger.info("color_grade_preview_generated",
                              video_id=video_id,
                              grade=grade_name,
                              url=preview_url)
                    
                    metrics.increment("color_grade_preview_generated", 
                                    labels={"grade": grade_name})
                    
                    # Cleanup temp file
                    os.unlink(output_path)
                    
                except Exception as e:
                    logger.error("color_grade_preview_failed",
                               video_id=video_id,
                               grade=grade_name,
                               error=str(e))
                    continue
            
        finally:
            # Cleanup base frame
            if os.path.exists(base_frame_path):
                os.unlink(base_frame_path)
    
    return previews


def get_available_color_grades() -> List[Dict]:
    """Get list of available color grades with metadata."""
    return [
        {
            "id": grade_id,
            "display_name": info["display_name"],
            "description": info["description"]
        }
        for grade_id, info in COLOR_GRADES.items()
    ]


# For testing
if __name__ == "__main__":
    import asyncio
    from supabase import create_client
    
    # Test with sample video
    test_video = "test_video.mp4"
    
    if os.path.exists(test_video):
        sb = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        )
        
        previews = asyncio.run(generate_color_grade_previews(
            test_video,
            "test-video-id",
            sb
        ))
        
        print("Generated previews:")
        for grade, url in previews.items():
            print(f"  {grade}: {url}")
    else:
        print(f"Test video not found: {test_video}")
