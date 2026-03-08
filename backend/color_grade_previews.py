"""
Color Grade Preview Generator - Creates preview frames for each color grade.

This module extracts frames from videos, applies color grading LUTs,
and uploads the results to Supabase Storage for caching.
"""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional
import requests
import asyncio

# Available color grades with their LUT files
COLOR_GRADES = {
    "original": {
        "lut": None,
        "display_name": "Original",
        "description": "No color grading applied"
    },
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
            print(f"[Color Preview] FFmpeg error: {result.stderr}")
            raise Exception(f"FFmpeg failed: {result.stderr}")
        
        if not os.path.exists(output_path):
            raise Exception("Frame extraction produced no output")
        
        return output_path
        
    except subprocess.TimeoutExpired:
        print("[Color Preview] FFmpeg timeout")
        raise


def apply_color_grade(input_frame: str, output_frame: str, grade: str) -> bool:
    """
    Apply a color grade LUT to a frame.
    
    Args:
        input_frame: Path to input image
        output_frame: Path to save graded image
        grade: Color grade key (vintage, cinematic, etc.)
        
    Returns:
        True if successful
    """
    if grade == "original":
        # Just copy the file
        import shutil
        shutil.copy(input_frame, output_frame)
        return True
    
    grade_info = COLOR_GRADES.get(grade)
    if not grade_info:
        print(f"[Color Preview] Unknown grade: {grade}")
        return False
    
    # Handle black & white specially
    if grade == "bw":
        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_frame,
            "-vf", "format=gray",
            "-q:v", "2",
            output_frame
        ]
    else:
        # Apply LUT
        lut_path = grade_info["lut"]
        if not lut_path or not Path(lut_path).exists():
            print(f"[Color Preview] LUT not found: {lut_path}")
            return False
        
        # Escape path for FFmpeg
        lut_escaped = str(lut_path).replace("\\", "/").replace(":", "\\:")
        
        cmd = [
            "ffmpeg",
            "-y",
            "-i", input_frame,
            "-vf", f"lut3d=file='{lut_escaped}'",
            "-q:v", "2",
            output_frame
        ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            print(f"[Color Preview] Failed to apply {grade}: {result.stderr}")
            return False
        
        return os.path.exists(output_frame)
        
    except subprocess.TimeoutExpired:
        print(f"[Color Preview] Timeout applying {grade}")
        return False


def upload_to_supabase(
    file_path: str,
    storage_path: str,
    sb_url: str,
    sb_key: str
) -> Optional[str]:
    """
    Upload a file to Supabase Storage.
    
    Args:
        file_path: Local file path
        storage_path: Destination path in Supabase (e.g., "previews/video123/vintage.jpg")
        sb_url: Supabase project URL
        sb_key: Supabase service role key
        
    Returns:
        Public URL of uploaded file, or None if failed
    """
    try:
        with open(file_path, "rb") as f:
            upload_resp = requests.post(
                f"{sb_url}/storage/v1/object/previews/{storage_path}",
                headers={
                    "apikey": sb_key,
                    "Authorization": f"Bearer {sb_key}",
                    "Content-Type": "image/jpeg",
                    "x-upsert": "true"
                },
                data=f,
                timeout=30
            )
        
        if not upload_resp.ok:
            print(f"[Color Preview] Upload failed: {upload_resp.status_code}")
            print(f"[Color Preview] Response: {upload_resp.text[:200]}")
            return None
        
        # Get public URL
        public_url = f"{sb_url}/storage/v1/object/public/previews/{storage_path}"
        return public_url
        
    except Exception as e:
        print(f"[Color Preview] Upload error: {e}")
        return None


async def generate_color_grade_previews(
    video_path: str,
    video_id: str,
    sb_url: str,
    sb_key: str
) -> Dict[str, str]:
    """
    Generate color grade previews for a video and upload to Supabase.
    
    Args:
        video_path: Path to local video file
        video_id: Video ID (for storage path)
        sb_url: Supabase project URL
        sb_key: Supabase service role key
        
    Returns:
        Dict mapping grade name to public URL
        
    Example:
        {
            "original": "https://.../previews/video123/original.jpg",
            "vintage": "https://.../previews/video123/vintage.jpg",
            ...
        }
    """
    print(f"[Color Preview] Generating for video: {video_id}")
    
    if not os.path.exists(video_path):
        print(f"[Color Preview] Video not found: {video_path}")
        return {}
    
    # Create temp directory for processing
    with tempfile.TemporaryDirectory() as tmpdir:
        # Step 1: Extract frame
        print("[Color Preview] Extracting frame...")
        frame_path = os.path.join(tmpdir, "frame.jpg")
        
        try:
            extract_frame(video_path, timestamp=1.0, output_path=frame_path)
        except Exception as e:
            print(f"[Color Preview] Frame extraction failed: {e}")
            return {}
        
        # Step 2: Generate each color grade
        previews = {}
        
        for grade_key, grade_info in COLOR_GRADES.items():
            print(f"[Color Preview] Processing {grade_key}...")
            
            # Apply color grade
            output_path = os.path.join(tmpdir, f"{grade_key}.jpg")
            
            if not apply_color_grade(frame_path, output_path, grade_key):
                print(f"[Color Preview] Failed to apply {grade_key}")
                continue
            
            # Upload to Supabase
            storage_path = f"{video_id}/{grade_key}.jpg"
            public_url = upload_to_supabase(output_path, storage_path, sb_url, sb_key)
            
            if public_url:
                previews[grade_key] = public_url
                print(f"[Color Preview] Uploaded {grade_key}: {public_url[:60]}...")
            else:
                print(f"[Color Preview] Failed to upload {grade_key}")
            
            # Small delay between uploads
            await asyncio.sleep(0.1)
        
        print(f"[Color Preview] Generated {len(previews)} previews")
        return previews


async def save_previews_to_database(
    video_id: str,
    previews: Dict[str, str],
    sb_url: str,
    sb_key: str
) -> bool:
    """
    Save preview URLs to database.
    
    Args:
        video_id: Video ID
        previews: Dict of grade -> URL
        sb_url: Supabase project URL
        sb_key: Supabase service role key
        
    Returns:
        True if successful
    """
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json"
    }
    
    try:
        for grade, url in previews.items():
            data = {
                "video_id": video_id,
                "color_grade": grade,
                "storage_path": f"{video_id}/{grade}.jpg",
                "public_url": url
            }
            
            resp = requests.post(
                f"{sb_url}/rest/v1/color_grade_previews",
                headers=headers,
                json=data,
                timeout=5
            )
            
            if not resp.ok:
                print(f"[Color Preview] DB insert failed for {grade}: {resp.text}")
        
        return True
        
    except Exception as e:
        print(f"[Color Preview] DB error: {e}")
        return False


# Backwards compatibility
def generate_color_grade_previews_sync(*args, **kwargs):
    """Synchronous wrapper for backwards compatibility."""
    return asyncio.run(generate_color_grade_previews(*args, **kwargs))
