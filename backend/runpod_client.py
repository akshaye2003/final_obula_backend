"""
RunPod Client for Offloading Video Processing

This module handles communication with RunPod serverless endpoints
to offload GPU-intensive video processing tasks.
"""

import os
import json
import time
import requests
from typing import Dict, Any, Optional, Callable
from pathlib import Path


class RunPodClient:
    """Client for RunPod Serverless API."""
    
    def __init__(self, api_key: Optional[str] = None, endpoint_id: Optional[str] = None):
        self.api_key = api_key or os.environ.get("RUNPOD_API_KEY", "")
        self.endpoint_id = endpoint_id or os.environ.get("RUNPOD_ENDPOINT_ID", "")
        self.base_url = "https://api.runpod.io/v2"
        
    def is_configured(self) -> bool:
        """Check if RunPod is properly configured."""
        return bool(self.api_key and self.endpoint_id)
    
    def submit_job(
        self,
        job_id: str,
        video_url: str,
        user_id: str,
        styled_words: list,
        timed_captions: list,
        transcript_text: str,
        options: Dict[str, Any],
        webhook_url: str,
        supabase_url: str,
        supabase_key: str,
    ) -> Dict[str, Any]:
        """
        Submit a video processing job to RunPod.
        
        Returns:
            Dict with "success", "runpod_job_id", "error"
        """
        if not self.is_configured():
            return {
                "success": False,
                "error": "RunPod not configured. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID."
            }
        
        # Build input payload for RunPod worker
        input_payload = {
            "job_id": job_id,
            "video_url": video_url,
            "user_id": user_id,
            "styled_words": styled_words,
            "timed_captions": timed_captions,
            "transcript_text": transcript_text,
            
            # Processing options
            "preset": options.get("preset", "dynamic_smart"),
            "enable_broll": options.get("enable_broll", False),
            "noise_isolate": options.get("noise_isolate", False),
            "aspect_ratio": options.get("aspect_ratio"),
            "rounded_corners": options.get("rounded_corners", "medium"),
            "lut_name": options.get("lut"),
            
            # Colors
            "caption_color": options.get("caption_color"),
            "hook_color": options.get("hook_color"),
            "emphasis_color": options.get("emphasis_color"),
            "regular_color": options.get("regular_color"),
            
            # Hook settings
            "enable_red_hook": options.get("enable_red_hook", False),
            "hook_size": options.get("hook_size", 1),
            
            # Layout
            "font_size": options.get("font_size"),
            "position": options.get("position"),
            "y_position": options.get("y_position"),
            "words_per_line": options.get("words_per_line"),
            
            # Watermark
            "watermark": {
                "enabled": options.get("enable_watermark", False),
                "text": options.get("watermark_text"),
                "image": options.get("watermark_image"),
                "position": options.get("watermark_position", "bottom-right"),
                "opacity": options.get("watermark_opacity", 0.6),
            },
            
            # Supabase credentials for upload
            "supabase_url": supabase_url,
            "supabase_key": supabase_key,
            
            # Webhook for completion
            "webhook_url": webhook_url,
        }
        
        # Remove None values
        input_payload = {k: v for k, v in input_payload.items() if v is not None}
        
        try:
            url = f"{self.base_url}/{self.endpoint_id}/run"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            
            payload = {"input": input_payload}
            
            print(f"[RunPod] Submitting job {job_id} to endpoint {self.endpoint_id}")
            
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            runpod_job_id = data.get("id")
            
            print(f"[RunPod] Job submitted: {runpod_job_id}")
            
            return {
                "success": True,
                "runpod_job_id": runpod_job_id,
                "status": data.get("status", "QUEUED"),
            }
            
        except requests.exceptions.RequestException as e:
            print(f"[RunPod] Submit error: {e}")
            return {
                "success": False,
                "error": f"Failed to submit job: {str(e)}"
            }
    
    def get_job_status(self, runpod_job_id: str) -> Dict[str, Any]:
        """Get status of a RunPod job."""
        if not self.is_configured():
            return {"error": "RunPod not configured"}
        
        try:
            url = f"{self.base_url}/{self.endpoint_id}/status/{runpod_job_id}"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            
            return response.json()
            
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}
    
    def cancel_job(self, runpod_job_id: str) -> bool:
        """Cancel a running RunPod job."""
        if not self.is_configured():
            return False
        
        try:
            url = f"{self.base_url}/{self.endpoint_id}/cancel/{runpod_job_id}"
            headers = {"Authorization": f"Bearer {self.api_key}"}
            
            response = requests.post(url, headers=headers, timeout=10)
            return response.ok
            
        except requests.exceptions.RequestException:
            return False


class RunPodWebhookHandler:
    """Handle webhooks from RunPod workers."""
    
    def __init__(self, jobs_dict: dict, job_lock):
        """
        Args:
            jobs_dict: Shared dictionary of jobs (JOBS from api.py)
            job_lock: Lock for thread-safe access
        """
        self.jobs = jobs_dict
        self.lock = job_lock
    
    def handle_completion(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle job completion webhook from RunPod.
        
        Args:
            payload: Webhook payload from RunPod worker
                {
                    "event": "job.completed",
                    "job_id": "...",
                    "success": true,
                    "video_url": "...",
                    "thumbnail_url": "...",
                    ...
                }
        
        Returns:
            Dict with ok status
        """
        job_id = payload.get("job_id")
        success = payload.get("success", False)
        
        if not job_id:
            return {"ok": False, "error": "Missing job_id"}
        
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                print(f"[Webhook] Job {job_id} not found")
                return {"ok": False, "error": "Job not found"}
            
            if success:
                job.update({
                    "status": "completed",
                    "stage": "done",
                    "message": "Done!",
                    "progress": 100,
                    "output_video_url": payload.get("video_url"),
                    "thumbnail_url": payload.get("thumbnail_url"),
                    "runpod_metadata": {
                        "processing_time": payload.get("processing_time"),
                        "output_size": payload.get("output_size"),
                    }
                })
                print(f"[Webhook] Job {job_id} completed via RunPod")
            else:
                error = payload.get("error", "Processing failed")
                job.update({
                    "status": "failed",
                    "stage": "failed",
                    "message": error,
                    "progress": 0,
                })
                print(f"[Webhook] Job {job_id} failed: {error}")
        
        return {"ok": True}
    
    def handle_failure(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Handle job failure webhook from RunPod."""
        return self.handle_completion({**payload, "success": False})


# Singleton instance
_runpod_client: Optional[RunPodClient] = None

def get_runpod_client() -> RunPodClient:
    """Get or create RunPod client singleton."""
    global _runpod_client
    if _runpod_client is None:
        _runpod_client = RunPodClient()
    return _runpod_client


def should_use_runpod() -> bool:
    """Check if RunPod offloading should be used."""
    client = get_runpod_client()
    return client.is_configured() and os.environ.get("USE_RUNPOD", "true").lower() == "true"
