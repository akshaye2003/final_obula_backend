"""
RunPod Serverless Handler for Obula Video Processing

This handler runs on GPU workers and handles:
- Video download from URL
- Full pipeline processing (captions, effects, B-roll)
- Upload to Supabase Storage
- Webhook notification to API server
"""

import os
import sys
import json
import time
import uuid
import tempfile
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
import requests

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parent))

# Import processing modules
try:
    from scripts.pipeline import Pipeline
    from scripts.video_utils import VideoUtils
except ImportError as e:
    print(f"[ERROR] Failed to import processing modules: {e}")
    # Will fail when handler is called

# RunPod handler import
try:
    import runpod
    RUNPOD_AVAILABLE = True
except ImportError:
    RUNPOD_AVAILABLE = False
    print("[WARN] RunPod SDK not available - running in test mode")

# Configuration
TEMP_DIR = Path("/tmp")
INPUTS_DIR = TEMP_DIR / "inputs"
OUTPUTS_DIR = TEMP_DIR / "outputs"
INPUTS_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)


def download_video(url: str, output_path: Path, timeout: int = 300) -> bool:
    """Download video from URL to local path."""
    try:
        print(f"[Download] Starting: {url[:80]}...")
        response = requests.get(url, stream=True, timeout=timeout)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and downloaded % (1024 * 1024) == 0:
                        pct = (downloaded / total_size) * 100
                        print(f"[Download] Progress: {pct:.1f}%")
        
        print(f"[Download] Complete: {output_path} ({downloaded / 1024 / 1024:.1f} MB)")
        return True
    except Exception as e:
        print(f"[Download] Error: {e}")
        return False


def upload_to_supabase(
    file_path: Path,
    storage_path: str,
    supabase_url: str,
    supabase_key: str
) -> Optional[str]:
    """Upload file to Supabase Storage and return public URL."""
    try:
        print(f"[Upload] Starting: {file_path} -> {storage_path}")
        
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
        }
        
        # Get file content
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        # Upload to storage
        upload_url = f"{supabase_url}/storage/v1/object/videos/{storage_path}"
        
        response = requests.post(
            upload_url,
            headers={**headers, "Content-Type": "video/mp4", "x-upsert": "true"},
            data=file_data,
            timeout=300
        )
        
        if not response.ok:
            print(f"[Upload] Failed: {response.status_code} {response.text[:200]}")
            return None
        
        # Get public URL
        public_url = f"{supabase_url}/storage/v1/object/public/videos/{storage_path}"
        print(f"[Upload] Complete: {public_url[:80]}...")
        return public_url
        
    except Exception as e:
        print(f"[Upload] Error: {e}")
        return None


def generate_thumbnail(video_path: Path, output_path: Path, time_sec: float = 1.0) -> bool:
    """Generate thumbnail from video."""
    try:
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", str(time_sec),
            "-i", str(video_path),
            "-vframes", "1",
            "-vf", "scale=480:-2",
            "-q:v", "2",
            str(output_path)
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=30)
        return output_path.exists()
    except Exception as e:
        print(f"[Thumbnail] Error: {e}")
        return False


def call_webhook(webhook_url: str, payload: Dict[str, Any]) -> bool:
    """Call API server webhook with job result."""
    try:
        print(f"[Webhook] Calling: {webhook_url}")
        response = requests.post(
            webhook_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        if response.ok:
            print("[Webhook] Success")
            return True
        else:
            print(f"[Webhook] Failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"[Webhook] Error: {e}")
        return False


def process_video(job_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main processing function.
    
    Args:
        job_input: Dict containing:
            - job_id: Unique job ID
            - video_url: URL to download video from
            - styled_words: List of word objects with style
            - timed_captions: List of caption segments
            - preset: Caption preset name
            - enable_broll: Enable B-roll
            - noise_isolate: Enable noise isolation
            - lut_name: Color grade LUT filename
            - watermark: Watermark options
            - supabase_url: Supabase project URL
            - supabase_key: Supabase service role key
            - webhook_url: API webhook URL for completion
    
    Returns:
        Dict with success status and output URLs
    """
    start_time = time.time()
    job_id = job_input.get("job_id", str(uuid.uuid4()))
    
    print(f"\n{'='*60}")
    print(f"[Job {job_id}] Starting processing")
    print(f"{'='*60}\n")
    
    try:
        # Extract parameters
        video_url = job_input.get("video_url")
        if not video_url:
            return {"success": False, "error": "No video_url provided"}
        
        # Captions come nested in prep_data (from API) or flat (legacy)
        prep_data = job_input.get("prep_data", {})
        styled_words = prep_data.get("styled_words") or job_input.get("styled_words", [])
        timed_captions = prep_data.get("timed_captions") or job_input.get("timed_captions", [])
        transcript_text = prep_data.get("transcript_text") or job_input.get("transcript_text", "")
        preset = job_input.get("preset", "dynamic_smart")
        enable_broll = job_input.get("enable_broll", False)
        noise_isolate = job_input.get("noise_isolate", False)
        lut_name = job_input.get("lut_name")
        aspect_ratio = job_input.get("aspect_ratio")
        rounded_corners = job_input.get("rounded_corners", "medium")
        
        # Watermark options
        watermark = job_input.get("watermark", {})
        watermark_text = watermark.get("text") if watermark.get("enabled") else None
        watermark_image = watermark.get("image") if watermark.get("enabled") else None
        watermark_position = watermark.get("position", "bottom-right")
        watermark_opacity = watermark.get("opacity", 0.6)
        
        # Supabase config
        supabase_url = job_input.get("supabase_url", os.environ.get("SUPABASE_URL", ""))
        supabase_key = job_input.get("supabase_key", os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
        webhook_url = job_input.get("webhook_url")
        user_id = job_input.get("user_id", "unknown")
        
        # Generate unique filename
        video_id = uuid.uuid4().hex[:12]
        input_path = INPUTS_DIR / f"{video_id}_input.mp4"
        output_path = OUTPUTS_DIR / f"{video_id}_output.mp4"
        thumbnail_path = OUTPUTS_DIR / f"{video_id}_thumb.jpg"
        
        # Step 1: Download video
        print("[Step 1/5] Downloading video...")
        if not download_video(video_url, input_path):
            return {"success": False, "error": "Failed to download video"}
        
        # Get video info
        try:
            duration = VideoUtils.get_duration(str(input_path))
            width, height = VideoUtils.get_dimensions(str(input_path))
            print(f"[Video] {width}x{height}, {duration:.1f}s")
        except Exception as e:
            print(f"[Video] Could not get info: {e}")
            duration, width, height = 0, 1920, 1080
        
        # Step 2: Load preset config
        print(f"[Step 2/5] Loading preset: {preset}")
        preset_path = Path(__file__).parent / "presets" / f"{preset}.json"
        config = {}
        if preset_path.exists():
            with open(preset_path) as f:
                config = json.load(f)
        
        # Apply user color overrides
        if job_input.get("caption_color"):
            config["color"] = _hex_to_rgb(job_input["caption_color"])
        if job_input.get("hook_color"):
            config["highlight_color"] = _hex_to_rgb(job_input["hook_color"])
            config["hook_color"] = _hex_to_rgb(job_input["hook_color"])
        if job_input.get("emphasis_color"):
            config["emphasis_color"] = _hex_to_rgb(job_input["emphasis_color"])
        if job_input.get("regular_color"):
            config["regular_color"] = _hex_to_rgb(job_input["regular_color"])
        
        # Apply layout overrides
        if job_input.get("font_size"):
            config["font_size"] = int(job_input["font_size"])
        if job_input.get("position"):
            config["position"] = job_input["position"]
        if job_input.get("y_position"):
            config["y_position"] = float(job_input["y_position"])
        if job_input.get("words_per_line"):
            config["words_per_line"] = int(job_input["words_per_line"])
        
        # Red hook settings
        if job_input.get("enable_red_hook"):
            hook_size = job_input.get("hook_size", 1)
            config["max_hook_words"] = max(1, int(hook_size))
            config["exclusive_hooks"] = True
        
        # Step 3: Process video
        print("[Step 3/5] Running pipeline...")
        
        openai_key = job_input.get("openai_api_key", os.environ.get("OPENAI_API_KEY", ""))
        pipeline = Pipeline(api_key=openai_key, config=config)
        
        # Build LUT path if specified
        lut_path = None
        if lut_name:
            lut_full_path = Path(__file__).parent / "color_grading" / lut_name
            if lut_full_path.exists():
                lut_path = str(lut_full_path)
        
        success = pipeline.process(
            input_video=str(input_path),
            output_video=str(output_path),
            transcript=transcript_text,
            use_whisper=False,  # We already have styled_words/timed_captions
            enable_broll=enable_broll,
            noise_isolate=noise_isolate,
            add_intro=False,  # Can be added if needed
            instagram_export=True,
            lut_path=lut_path,
            rounded_corners=rounded_corners,
            aspect_ratio=aspect_ratio,
            watermark_text=watermark_text,
            watermark_image=watermark_image,
            watermark_position=watermark_position,
            watermark_opacity=watermark_opacity,
            styled_words=styled_words,
            timed_captions=timed_captions,
        )
        
        if not success:
            return {"success": False, "error": "Pipeline processing failed"}
        
        if not output_path.exists():
            return {"success": False, "error": "Output file not created"}
        
        # Step 4: Generate thumbnail
        print("[Step 4/5] Generating thumbnail...")
        generate_thumbnail(output_path, thumbnail_path)
        
        # Step 5: Upload to Supabase
        print("[Step 5/5] Uploading results...")
        
        output_size = output_path.stat().st_size
        print(f"[Output] Size: {output_size / 1024 / 1024:.1f} MB")
        
        # Upload video
        storage_path = f"{user_id}/{video_id}_output.mp4"
        video_public_url = upload_to_supabase(
            output_path, storage_path, supabase_url, supabase_key
        )
        
        # Upload thumbnail
        thumbnail_url = None
        if thumbnail_path.exists():
            thumb_storage_path = f"{user_id}/{video_id}_thumb.jpg"
            thumbnail_url = upload_to_supabase(
                thumbnail_path, thumb_storage_path, supabase_url, supabase_key
            )
        
        # Calculate processing time
        elapsed = time.time() - start_time
        print(f"\n{'='*60}")
        print(f"[Job {job_id}] Complete in {elapsed:.1f}s")
        print(f"{'='*60}\n")
        
        result = {
            "success": True,
            "job_id": job_id,
            "video_id": video_id,
            "video_url": video_public_url,
            "thumbnail_url": thumbnail_url,
            "duration": duration,
            "output_size": output_size,
            "processing_time": elapsed,
        }
        
        # Call webhook if provided
        if webhook_url:
            webhook_payload = {
                "event": "job.completed",
                "job_id": job_id,
                **result
            }
            call_webhook(webhook_url, webhook_payload)
        
        return result
        
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"[Job {job_id}] ERROR: {error_msg}")
        print(error_trace)
        
        # Call webhook with error
        if job_input.get("webhook_url"):
            call_webhook(job_input["webhook_url"], {
                "event": "job.failed",
                "job_id": job_id,
                "success": False,
                "error": error_msg,
            })
        
        return {
            "success": False,
            "job_id": job_id,
            "error": error_msg,
            "traceback": error_trace,
        }
    
    finally:
        # Cleanup temp files
        try:
            if input_path.exists():
                input_path.unlink()
            if output_path.exists():
                output_path.unlink()
            if thumbnail_path.exists():
                thumbnail_path.unlink()
        except Exception as e:
            print(f"[Cleanup] Error: {e}")


def _hex_to_rgb(hex_str: str) -> Optional[list]:
    """Convert hex color to RGB list."""
    if not hex_str or not isinstance(hex_str, str):
        return None
    hex_str = hex_str.strip().lstrip("#")
    if len(hex_str) == 6:
        try:
            return [int(hex_str[i:i+2], 16) for i in (0, 2, 4)]
        except ValueError:
            pass
    return None


# RunPod handler entry point
def handler(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    RunPod serverless handler.
    
    Args:
        event: Dict with "input" key containing job parameters
    
    Returns:
        Dict with job result
    """
    job_input = event.get("input", {})
    return process_video(job_input)


# Local testing
if __name__ == "__main__" and not RUNPOD_AVAILABLE:
    # Test mode - run without RunPod SDK
    print("=" * 60)
    print("RunPod Worker - Local Test Mode")
    print("=" * 60)
    
    test_input = {
        "job_id": "test-123",
        "video_url": "https://example.com/test.mp4",  # Replace with real URL
        "preset": "dynamic_smart",
        "supabase_url": os.environ.get("SUPABASE_URL", ""),
        "supabase_key": os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        "openai_api_key": os.environ.get("OPENAI_API_KEY", ""),
    }
    
    result = process_video(test_input)
    print("\nResult:")
    print(json.dumps(result, indent=2))


# Register with RunPod
if RUNPOD_AVAILABLE:
    runpod.serverless.start({"handler": handler})
