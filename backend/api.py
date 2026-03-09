"""
Obula API Server — connects Frontend to the video processing pipeline.
Run with: uvicorn api:app --reload --port 8000
"""

import os
import sys
import uuid
import threading
import json
import time
import shutil
import base64
import hmac
import hashlib
from pathlib import Path
from typing import Optional, List, Any, Dict

import requests
import jwt

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

# Observability (structured logging, metrics, tracing)
from observability import (
    logger, metrics, health_checker, alert_manager,
    set_request_id, get_request_id, set_user_id, get_user_id,
    Timer, timed, create_span, capture_exception, send_alert,
    init_observability, clear_context
)
init_observability()

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Environment configuration
ENV = os.getenv("ENV", "development")

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

try:
    import razorpay as _razorpay
except ImportError:
    _razorpay = None

# Add scripts to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Dirs
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
DATA_DIR   = BASE_DIR / "data"
for d in [UPLOAD_DIR, OUTPUT_DIR, DATA_DIR]:
    d.mkdir(exist_ok=True)

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "500"))

app = FastAPI(title="Obula API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Request ID middleware - sets up tracing context for each request
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    # Extract or generate request ID
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    set_request_id(request_id)
    
    # Start timing
    start_time = time.time()
    
    # Log request start
    logger.info(
        "request_started",
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    # Process request
    try:
        response = await call_next(request)
        
        # Add request ID to response
        response.headers["X-Request-ID"] = request_id
        
        # Log completion
        duration_ms = (time.time() - start_time) * 1000
        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms
        )
        
        # Record metrics
        metrics.increment("http_requests_total", labels={
            "method": request.method,
            "path": request.url.path,
            "status": str(response.status_code)
        })
        metrics.timing("http_request_duration_ms", duration_ms, labels={
            "method": request.method,
            "path": request.url.path
        })
        
        return response
        
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        logger.error(
            "request_failed",
            method=request.method,
            path=request.url.path,
            error_type=type(e).__name__,
            error=str(e),
            duration_ms=duration_ms
        )
        capture_exception(e, extra={"path": request.url.path, "method": request.method})
        raise
        
    finally:
        clear_context()

# CORS configuration based on environment
if ENV == "production":
    allow_origins = [
        "https://obula.io",
        "https://www.obula.io",
        "https://obula-backend-vwk3.vercel.app",
    ]
else:
    # Development: allow Vite dev server + localhost + local network (for mobile testing)
    allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# SUPABASE HELPERS
# =============================================================================

def _sb_headers() -> dict:
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

def _sb_rpc(func: str, params: dict):
    url = os.environ.get("SUPABASE_URL", "").strip()
    if not url:
        return None
    try:
        r = requests.post(f"{url}/rest/v1/rpc/{func}", headers=_sb_headers(), json=params, timeout=5)
        return r
    except Exception:
        return None

def _decrement_credits(user_id: str) -> bool:
    # Bypass when Supabase not configured (dev/testing)
    if not os.environ.get("SUPABASE_URL", "").strip():
        return True
    r = _sb_rpc("decrement_credits", {"user_uuid": user_id})
    return r is not None and r.status_code == 200

def _refund_credit(user_id: str) -> None:
    _sb_rpc("refund_credit", {"user_uuid": user_id})

def _add_credits(user_id: str, amount: int) -> None:
    _sb_rpc("add_credits", {"user_uuid": user_id, "credit_count": amount})

def _save_video_to_supabase(user_id: str, output_path: Path, filename: str) -> None:
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    if not sb_url or not output_path.exists():
        return
    storage_path = f"{user_id}/{filename}"
    try:
        file_size = output_path.stat().st_size
        with open(output_path, "rb") as fh:
            r = requests.post(
                f"{sb_url}/storage/v1/object/videos/{storage_path}",
                headers={**_sb_headers(), "Content-Type": "video/mp4", "x-upsert": "true"},
                data=fh,
                timeout=300,
            )
        if not r.ok:
            print(f"[Supabase] Storage upload failed: {r.status_code} {r.text[:200]}")
            return
        requests.post(
            f"{sb_url}/rest/v1/videos",
            headers=_sb_headers(),
            json={
                "user_id": user_id,
                "title": f"Clip {filename[:8]}",
                "storage_path": storage_path,
                "file_size": file_size,
            },
            timeout=5,
        )
        print(f"[Supabase] Video saved: {storage_path}")
    except Exception as e:
        print(f"[Supabase] Save error: {e}")

# =============================================================================
# AUTH
# =============================================================================

# Cache verified tokens for 5 minutes to avoid calling Supabase on every poll
_TOKEN_CACHE: dict[str, tuple[dict, float]] = {}
_TOKEN_CACHE_TTL = 300  # seconds

def _verify_supabase_jwt(token: str) -> Optional[dict]:
    """Verify JWT token locally using SUPABASE_JWT_SECRET."""
    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "").strip()
    if not jwt_secret or jwt_secret == "your-supabase-jwt-secret":
        # Fallback to API verification if JWT secret not configured
        return _verify_supabase_jwt_api(token)
    try:
        # Try base64 decoded secret first (Supabase format)
        import base64
        try:
            secret_bytes = base64.b64decode(jwt_secret)
            payload = jwt.decode(token, secret_bytes, algorithms=["HS256"])
        except:
            # Fall back to raw secret
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
        print(f"[Auth] Verified user via JWT: {payload.get('email')}")
        return {
            "id": payload.get("sub", ""),
            "email": payload.get("email", ""),
            "name": (payload.get("user_metadata") or {}).get("full_name") or payload.get("email", "").split("@")[0],
        }
    except jwt.ExpiredSignatureError:
        print("[Auth] JWT token expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"[Auth] Invalid JWT token: {e}, falling back to API")
        # Fallback to API verification on JWT error
        return _verify_supabase_jwt_api(token)
    except Exception as e:
        print(f"[Auth] Exception verifying JWT: {e}, falling back to API")
        return _verify_supabase_jwt_api(token)

def _verify_supabase_jwt_api(token: str) -> Optional[dict]:
    """Fallback: Verify token by calling Supabase /auth/v1/user."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    sb_service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not sb_url or not sb_service_key:
        return None
    try:
        # Try with service role key in Authorization header (admin get user)
        resp = requests.get(
            f"{sb_url}/auth/v1/admin/users/{_get_user_id_from_jwt(token)}",
            headers={
                "apikey": sb_service_key,
                "Authorization": f"Bearer {sb_service_key}",
            },
            timeout=5,
        )
        if resp.ok:
            data = resp.json()
            user = data.get("user", data)
            print(f"[Auth] Verified user via Admin API: {user.get('email')}")
            return {
                "id": user.get("id", ""),
                "email": user.get("email", ""),
                "name": (user.get("user_metadata") or {}).get("full_name") or user.get("email", "").split("@")[0],
            }
        # Fallback: try /user endpoint with the user's token
        resp2 = requests.get(
            f"{sb_url}/auth/v1/user",
            headers={
                "apikey": sb_service_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=5,
        )
        if resp2.ok:
            data = resp2.json()
            print(f"[Auth] Verified user via /user API: {data.get('email')}")
            return {
                "id": data.get("id", ""),
                "email": data.get("email", ""),
                "name": (data.get("user_metadata") or {}).get("full_name") or data.get("email", "").split("@")[0],
            }
        print(f"[Auth] Supabase API verify failed: {resp.status_code}, {resp2.status_code}")
        return None
    except Exception as e:
        print(f"[Auth] Exception: {e}")
        return None

def _get_user_id_from_jwt(token: str) -> str:
    """Extract user ID (sub) from JWT without verification."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return ""
        payload = parts[1]
        # Add padding if needed
        payload += "=" * (4 - len(payload) % 4)
        decoded = base64.b64decode(payload)
        data = json.loads(decoded)
        return data.get("sub", "")
    except Exception as e:
        print(f"[Auth] Could not extract user ID from JWT: {e}")
        return ""

def _accept_dev_token(request: Optional["Request"] = None) -> bool:
    """Accept dev-token only when ENV=development."""
    if ENV == "development":
        return True
    return False

def get_current_user(authorization: Optional[str] = Header(None), request: Request = None) -> Optional[dict]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "").strip()
    # Dev bypass — when ENV=development or request from localhost
    if token.startswith("dev-token-"):
        if _accept_dev_token(request):
            return {"id": "dev", "email": "dev@obula.local", "name": "Developer"}
        return None
    # Check cache first
    cached = _TOKEN_CACHE.get(token)
    if cached:
        user, expires_at = cached
        if time.time() < expires_at:
            return user
        else:
            del _TOKEN_CACHE[token]
    user = _verify_supabase_jwt(token)
    if user:
        _TOKEN_CACHE[token] = (user, time.time() + _TOKEN_CACHE_TTL)
    return user

def require_auth(user: Optional[dict] = Depends(get_current_user)) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

def get_current_user_from_query(token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Get user from either query param (for video elements) or header (for API calls)."""
    if token:
        return _get_user_from_token(token)
    if authorization and authorization.startswith("Bearer "):
        return _get_user_from_token(authorization.replace("Bearer ", "").strip())
    return None

def _get_user_from_token(token: str) -> Optional[dict]:
    """Verify token and return user."""
    if token.startswith("dev-token-"):
        if ENV == "development":
            return {"id": "dev", "email": "dev@obula.local", "name": "Developer"}
        return None
    cached = _TOKEN_CACHE.get(token)
    if cached:
        user, expires_at = cached
        if time.time() < expires_at:
            return user
        else:
            del _TOKEN_CACHE[token]
    user = _verify_supabase_jwt(token)
    if user:
        _TOKEN_CACHE[token] = (user, time.time() + _TOKEN_CACHE_TTL)
    return user

def require_auth_with_query(token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)) -> dict:
    """Require auth from header or query param (for video playback)."""
    user = get_current_user_from_query(token, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(require_auth)):
    return user

@app.post("/api/auth/logout")
async def auth_logout():
    return {}

# =============================================================================
# HEALTH CHECK (for Railway)
# =============================================================================

@app.get("/api/health")
async def health_check():
    """Comprehensive health check with all dependencies."""
    checks = await health_checker.check_all()
    
    # Also include basic app info
    checks["info"] = {
        "version": "1.0.0",
        "environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "development"),
        "deployment_id": os.getenv("RAILWAY_DEPLOYMENT_ID", "unknown"),
    }
    
    # Include recent metrics
    checks["metrics"] = metrics.get_stats()
    
    status_code = 200 if checks["status"] == "healthy" else 503
    return checks


@app.get("/api/metrics")
async def metrics_endpoint():
    """Prometheus-compatible metrics endpoint."""
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        content=metrics.render_prometheus(),
        media_type="text/plain"
    )


# Register health checks for dependencies
async def check_supabase():
    """Check Supabase connectivity."""
    try:
        sb_url = os.getenv("SUPABASE_URL", "").strip()
        sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        
        if not sb_url or not sb_key:
            return False, {"error": "Missing env vars"}
        
        r = requests.get(
            f"{sb_url}/rest/v1/",
            headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
            timeout=5
        )
        return r.status_code == 200, {"status_code": r.status_code}
    except Exception as e:
        return False, {"error": str(e)}


async def check_openai():
    """Check OpenAI API connectivity."""
    try:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            return False, {"error": "Missing OPENAI_API_KEY"}
        
        # Just check if we can make a simple request (list models)
        r = requests.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5
        )
        return r.status_code == 200, {"status_code": r.status_code}
    except Exception as e:
        return False, {"error": str(e)}


async def check_runpod():
    """Check RunPod connectivity."""
    try:
        api_key = os.getenv("RUNPOD_API_KEY", "").strip()
        endpoint_id = os.getenv("RUNPOD_ENDPOINT_ID", "").strip()
        
        if not api_key:
            return False, {"error": "Missing RUNPOD_API_KEY", "configured": False}
        if not endpoint_id:
            return False, {"error": "Missing RUNPOD_ENDPOINT_ID", "configured": False}
        
        # Check if endpoint exists
        r = requests.get(
            f"https://api.runpod.ai/v2/{endpoint_id}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10
        )
        return r.status_code == 200, {
            "status_code": r.status_code,
            "configured": True,
            "endpoint_id": endpoint_id
        }
    except Exception as e:
        return False, {"error": str(e), "configured": bool(api_key and endpoint_id)}


async def check_disk_space():
    """Check available disk space."""
    try:
        import shutil
        stat = shutil.disk_usage(".")
        free_gb = stat.free / (1024**3)
        total_gb = stat.total / (1024**3)
        used_pct = (stat.used / stat.total) * 100
        
        healthy = free_gb > 1.0  # At least 1GB free
        
        return healthy, {
            "free_gb": round(free_gb, 2),
            "total_gb": round(total_gb, 2),
            "used_percent": round(used_pct, 1)
        }
    except Exception as e:
        return False, {"error": str(e)}


# Register all health checks
health_checker.register("supabase", check_supabase)
health_checker.register("openai", check_openai)
health_checker.register("runpod", check_runpod)
health_checker.register("disk_space", check_disk_space)

# =============================================================================
# STARTUP EVENT (for Railway)
# =============================================================================

@app.on_event("startup")
async def startup_event():
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("outputs", exist_ok=True)
    os.makedirs("data/prep", exist_ok=True)

# =============================================================================
# CONFIG
# =============================================================================

MAX_INPUT_RESOLUTION = 1920  # 1080p — max(width, height)

@app.get("/api/config")
async def get_config():
    return {
        "max_upload_mb": MAX_UPLOAD_MB,
        "max_resolution": "1080p",
        "max_resolution_px": MAX_INPUT_RESOLUTION,
        "presets": ["dynamic_smart", "viral", "split", "cinematic", "minimal", "marquee"],
        "luts": [
            "02_Film LUTs_Vintage.cube",
            "02_Film Emulation LUTs_Cross Process.cube",
            "04_Cinematic LUTs_Frosted.cube",
            "05_Film LUTs_Foliage.cube",
            "07_Cinematic LUTs_Flavin.cube",
            "08_Film Emulation LUTs_B&W.cube",
        ],
    }

# =============================================================================
# UPLOAD SECURITY - Magic bytes validation
# =============================================================================

VIDEO_MAGIC_BYTES = {
    # MP4: ftyp marker at offset 4
    b'\x66\x74\x79\x70': 'mp4',  # ftyp
    # MOV: same as MP4 (QuickTime container)
    b'\x66\x74\x79\x70': 'mov',  # ftyp (alias)
    # WEBM: EBML header starts with 0x1A 0x45 0xDF 0xA3
    b'\x1a\x45\xdf\xa3': 'webm',
    # AVI: RIFF....AVI
    b'\x52\x49\x46\x46': 'avi',  # RIFF (need to check further for AVI)
    # MKV: EBML header (same as WEBM)
    b'\x1a\x45\xdf\xa3': 'mkv',
}

ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}

def _validate_video_file(file_path: Path, declared_ext: str) -> bool:
    """Validate video file using magic bytes."""
    try:
        with open(file_path, 'rb') as f:
            header = f.read(12)
        
        # Check for MP4/MOV (ftyp at offset 4)
        if len(header) >= 8 and header[4:8] == b'ftyp':
            return declared_ext in ('.mp4', '.mov')
        
        # Check for WEBM/MKV (EBML header)
        if header[:4] == b'\x1a\x45\xdf\xa3':
            return declared_ext in ('.webm', '.mkv')
        
        # Check for AVI (RIFF....AVI)
        if header[:4] == b'RIFF' and len(header) >= 12 and header[8:12] == b'AVI ':
            return declared_ext == '.avi'
        
        return False
    except Exception:
        return False

# =============================================================================
# UPLOAD
# =============================================================================

@app.post("/api/upload")
@limiter.limit("10/minute")
async def upload_video(request: Request, file: UploadFile = File(...), user: dict = Depends(require_auth)):
    set_user_id(user.get("id", "unknown"))
    
    logger.info("upload_started", filename=file.filename, user_id=user.get("id"))
    metrics.increment("uploads_started")
    
    if not file.filename:
        logger.warning("upload_no_file")
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Validate extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        logger.warning("upload_invalid_extension", extension=ext)
        metrics.increment("uploads_failed", labels={"reason": "invalid_extension"})
        raise HTTPException(status_code=400, detail="Invalid video format")

    # Generate UUID filename (never use original filename)
    vid = uuid.uuid4().hex[:12]
    path = UPLOAD_DIR / f"{vid}{ext}"
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    total = 0
    first_chunk = True
    start_time = time.time()

    try:
        with open(path, "wb") as f:
            while True:
                chunk = await file.read(8 * 1024 * 1024)
                if not chunk:
                    break
                
                # Validate magic bytes on first chunk
                if first_chunk:
                    first_chunk = False
                    if len(chunk) < 12:
                        path.unlink(missing_ok=True)
                        logger.warning("upload_too_small")
                        raise HTTPException(status_code=400, detail="File too small or corrupted")
                    
                    # Quick magic bytes check
                    is_valid = False
                    # MP4/MOV check
                    if len(chunk) >= 8 and chunk[4:8] == b'ftyp':
                        is_valid = ext in ('.mp4', '.mov')
                    # WEBM/MKV check
                    elif chunk[:4] == b'\x1a\x45\xdf\xa3':
                        is_valid = ext in ('.webm', '.mkv')
                    # AVI check
                    elif chunk[:4] == b'RIFF' and len(chunk) >= 12 and chunk[8:12] == b'AVI ':
                        is_valid = ext == '.avi'
                    
                    if not is_valid:
                        path.unlink(missing_ok=True)
                        logger.warning("upload_invalid_magic_bytes", extension=ext)
                        metrics.increment("uploads_failed", labels={"reason": "invalid_magic_bytes"})
                        raise HTTPException(status_code=400, detail="Invalid video file content")
                
                total += len(chunk)
                if total > max_bytes:
                    path.unlink(missing_ok=True)
                    logger.warning("upload_too_large", size_mb=total/(1024*1024))
                    metrics.increment("uploads_failed", labels={"reason": "too_large"})
                    raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_UPLOAD_MB}MB")
                f.write(chunk)
        
        # Final validation
        if not _validate_video_file(path, ext):
            path.unlink(missing_ok=True)
            logger.warning("upload_validation_failed")
            metrics.increment("uploads_failed", labels={"reason": "validation_failed"})
            raise HTTPException(status_code=400, detail="File content does not match declared format")
        
        upload_duration_ms = (time.time() - start_time) * 1000
        logger.info("upload_completed", 
                   video_id=vid, 
                   size_mb=round(total/(1024*1024), 2),
                   duration_ms=upload_duration_ms)
        metrics.increment("uploads_completed")
        metrics.timing("upload_duration_ms", upload_duration_ms)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("upload_exception", error=str(e), error_type=type(e).__name__)
        capture_exception(e, extra={"video_id": vid})
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Upload failed")

    # Enforce max 1080p resolution using ffprobe (no cv2)
    try:
        import subprocess
        import json
        cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height", "-of", "json", str(path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        data = json.loads(result.stdout)
        if data.get("streams"):
            w = data["streams"][0].get("width", 0)
            h = data["streams"][0].get("height", 0)
            max_dim = max(w, h)
            if max_dim > 1920:
                path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=400,
                    detail=f"Video resolution too high ({w}×{h}). Max input is 1080p (1920×1920). Please downscale your video first."
                )
    except HTTPException:
        raise
    except Exception as e:
        # If we can't read dimensions, allow the upload
        print(f"[Upload] Could not verify resolution: {e}")

    return {"video_id": vid, "filename": file.filename, "size_mb": round(total / 1024 / 1024, 2)}

@app.get("/api/upload/{video_id}/video")
async def get_uploaded_video(video_id: str, user: dict = Depends(require_auth_with_query)):
    for ext in (".mp4", ".mov", ".webm", ".avi", ".mkv"):
        p = UPLOAD_DIR / f"{video_id}{ext}"
        if p.exists():
            # Determine correct media type based on extension
            media_types = {
                ".mp4": "video/mp4",
                ".mov": "video/quicktime",
                ".webm": "video/webm",
                ".avi": "video/x-msvideo",
                ".mkv": "video/x-matroska",
            }
            media_type = media_types.get(ext, "video/mp4")
            print(f"[Video] Serving: {p} ({media_type})")
            return FileResponse(p, media_type=media_type, filename=p.name)
    print(f"[Video] Not found: {video_id}")
    raise HTTPException(status_code=404, detail="Video not found")

def _find_upload(video_id: str) -> Path:
    for ext in (".mp4", ".mov", ".webm", ".avi", ".mkv"):
        p = UPLOAD_DIR / f"{video_id}{ext}"
        if p.exists():
            return p
    raise HTTPException(status_code=404, detail="Uploaded video not found")

# =============================================================================
# PREP (EditClip)
# =============================================================================

PREP_DIR = DATA_DIR / "prep"
PREP_DIR.mkdir(exist_ok=True)

class CreatePrepBody(BaseModel):
    video_id: str

# Default colors by style for prep data (EditClip uses these)
_PREP_STYLE_COLORS = {"hook": [255, 200, 80], "emphasis": [255, 200, 80], "regular": [200, 220, 240], "emotional": [245, 158, 11]}

# In-memory status tracker for background prep jobs
_prep_jobs: dict[str, dict] = {}
_prep_jobs_lock = threading.Lock()

@app.post("/api/prep/background")
async def create_prep_background(body: CreatePrepBody, user: dict = Depends(require_auth)):
    """Start prep in background - returns immediately with prep_id. Runs transcription + masks + B-roll planning."""
    set_user_id(user["id"])
    input_path = _find_upload(body.video_id)
    prep_id = str(uuid.uuid4())
    prep_path = PREP_DIR / f"{prep_id}.json"
    
    logger.info("prep_background_started", prep_id=prep_id, video_id=body.video_id)
    metrics.increment("prep_started")
    
    # Initialize status
    with _prep_jobs_lock:
        _prep_jobs[prep_id] = {
            "status": "starting",
            "progress": 0,
            "video_id": body.video_id,
            "user_id": user["id"],
        }
    with open(prep_path, "w", encoding="utf-8") as f:
        json.dump({
            "input_video": str(input_path),
            "video_id": body.video_id,
            "status": "processing",
            "transcript_text": "",
            "styled_words": [],
            "timed_captions": [],
            "broll_placements": [],
        }, f, indent=2)
    
    def run_background_prep():
        """Prep with transcription via OpenAI API (cloud-based, no local ML)."""
        import openai
        
        transcript_text = ""
        styled_words = []
        timed_captions = []
        
        try:
            with _prep_jobs_lock:
                _prep_jobs[prep_id]["status"] = "transcribing"
                _prep_jobs[prep_id]["progress"] = 10
            
            # Step 1: Transcribe using OpenAI Whisper API (cloud, not local)
            try:
                client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

                # Extract compressed audio to stay under OpenAI's 25MB limit
                import subprocess, tempfile
                audio_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
                audio_tmp.close()
                subprocess.run([
                    "ffmpeg", "-y", "-i", str(input_path),
                    "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k",
                    audio_tmp.name
                ], capture_output=True, timeout=120)
                transcribe_path = audio_tmp.name

                with open(transcribe_path, "rb") as audio_file:
                    transcript = client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        response_format="verbose_json",
                        timestamp_granularities=["word"]
                    )
                os.unlink(transcribe_path)
                
                # Extract transcript text
                transcript_text = transcript.text or ""
                
                # Convert words to styled_words format
                if hasattr(transcript, 'words') and transcript.words:
                    for word_info in transcript.words:
                        styled_words.append({
                            "word": word_info.word,
                            "start": word_info.start,
                            "end": word_info.end,
                            "style": "regular",
                            "color": [200, 220, 240]
                        })
                
                # Build timed_captions: groups of 4 words using actual Whisper word timings
                if styled_words:
                    chunk_size = 4
                    for i in range(0, len(styled_words), chunk_size):
                        chunk = styled_words[i:i + chunk_size]
                        start = chunk[0]["start"]
                        end = chunk[-1]["end"]
                        text = " ".join(w["word"] for w in chunk)
                        timed_captions.append([start, end, [text]])
                
                print(f"[Prep BG] Transcribed {len(styled_words)} words")

                # Step 1b: GPT hook/emphasis styling
                if styled_words and transcript_text:
                    try:
                        with _prep_jobs_lock:
                            _prep_jobs[prep_id]["progress"] = 60
                            _prep_jobs[prep_id]["message"] = "Analyzing speech for emphasis..."

                        words_list = [w["word"] for w in styled_words]
                        words_joined = " ".join(words_list)

                        gpt_client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
                        gpt_resp = gpt_client.chat.completions.create(
                            model="gpt-4o-mini",
                            messages=[
                                {
                                    "role": "system",
                                    "content": (
                                        "You are a video caption editor. Given a list of words from a speech, "
                                        "identify which words should be styled as:\n"
                                        "- 'hook': the very first strong/attention-grabbing word or phrase (max 3 words at start)\n"
                                        "- 'emphasis': key words that deserve extra visual emphasis\n"
                                        "- 'regular': all other words\n\n"
                                        "Return ONLY a JSON array of style strings, one per word, in the same order. "
                                        "Example: [\"hook\", \"regular\", \"emphasis\", \"regular\", ...]"
                                    ),
                                },
                                {
                                    "role": "user",
                                    "content": f"Words: {words_joined}\n\nReturn JSON array of styles:",
                                },
                            ],
                            temperature=0.3,
                            max_tokens=min(4000, len(words_list) * 12),
                        )

                        import re as _re
                        raw = gpt_resp.choices[0].message.content.strip()
                        # Extract JSON array from response
                        match = _re.search(r'\[.*\]', raw, _re.DOTALL)
                        if match:
                            styles = json.loads(match.group())
                            if len(styles) == len(styled_words):
                                color_map = {
                                    "hook": [255, 60, 60],
                                    "emphasis": [255, 220, 50],
                                    "regular": [200, 220, 240],
                                }
                                for i, w in enumerate(styled_words):
                                    s = styles[i] if styles[i] in color_map else "regular"
                                    w["style"] = s
                                    w["color"] = color_map[s]
                                hook_count = sum(1 for s in styles if s == "hook")
                                emphasis_count = sum(1 for s in styles if s == "emphasis")
                                print(f"[Prep BG] GPT styled: {hook_count} hook, {emphasis_count} emphasis words")
                            else:
                                print(f"[Prep BG] GPT style count mismatch ({len(styles)} vs {len(styled_words)}), using regular")
                        else:
                            print(f"[Prep BG] GPT style parse failed, using regular")

                    except Exception as e:
                        print(f"[Prep BG] GPT styling error (non-fatal): {e}")

            except Exception as e:
                print(f"[Prep BG] Transcription error: {e}")
                transcript_text = ""
                styled_words = []
                timed_captions = []
            
            with _prep_jobs_lock:
                _prep_jobs[prep_id]["status"] = "saving"
                _prep_jobs[prep_id]["progress"] = 90
            
            # Step 2: Save prep data
            with open(prep_path, "w", encoding="utf-8") as f:
                json.dump({
                    "input_video": str(input_path),
                    "video_id": body.video_id,
                    "user_id": user["id"],
                    "status": "completed",
                    "transcript_text": transcript_text,
                    "styled_words": styled_words,
                    "timed_captions": timed_captions,
                    "broll_placements": [],
                }, f, indent=2)
            
            with _prep_jobs_lock:
                _prep_jobs[prep_id]["status"] = "completed"
                _prep_jobs[prep_id]["progress"] = 100
            
            prep_duration_ms = (time.time() - prep_start_time) * 1000
            logger.info("prep_background_completed", 
                       prep_id=prep_id,
                       word_count=len(styled_words),
                       caption_count=len(timed_captions),
                       transcript_length=len(transcript_text),
                       duration_ms=prep_duration_ms)
            metrics.increment("prep_completed")
            metrics.timing("prep_duration_ms", prep_duration_ms)
            
        except Exception as e:
            import traceback
            logger.error("prep_background_failed", 
                        prep_id=prep_id,
                        error=str(e),
                        error_type=type(e).__name__,
                        traceback=traceback.format_exc())
            capture_exception(e, extra={"prep_id": prep_id, "video_id": body.video_id})
            with _prep_jobs_lock:
                _prep_jobs[prep_id]["status"] = "failed"
                _prep_jobs[prep_id]["error"] = str(e)
            metrics.increment("prep_failed", labels={"error_type": type(e).__name__})
    
    prep_start_time = time.time()
    # Start in background thread
    threading.Thread(target=run_background_prep, daemon=True).start()
    
    return {"prep_id": prep_id, "video_id": body.video_id, "status": "started"}


@app.get("/api/prep/{prep_id}/status")
async def get_prep_status(prep_id: str, user: dict = Depends(require_auth)):
    """Get status of background prep job."""
    _validate_prep_id(prep_id)
    with _prep_jobs_lock:
        job = _prep_jobs.get(prep_id)
    
    if not job:
        # Check if prep file exists (might be old sync prep)
        prep_path = PREP_DIR / f"{prep_id}.json"
        if prep_path.exists():
            with open(prep_path, encoding="utf-8") as f:
                data = json.load(f)
            _check_prep_ownership(data, user)
            return {
                "prep_id": prep_id,
                "status": data.get("status", "completed"),
                "progress": 100 if data.get("status") == "completed" else 0,
                "video_id": data.get("video_id"),
            }
        raise HTTPException(status_code=404, detail="Prep job not found")
    
    return {
        "prep_id": prep_id,
        "status": job["status"],
        "progress": job["progress"],
        "video_id": job.get("video_id"),
        "error": job.get("error"),
    }


@app.post("/api/prep")
async def create_prep(body: CreatePrepBody, user: dict = Depends(require_auth)):
    """Create a prep session with transcription via OpenAI API."""
    import openai
    
    input_path = _find_upload(body.video_id)
    prep_id = str(uuid.uuid4())
    prep_path = PREP_DIR / f"{prep_id}.json"
    
    transcript_text = ""
    styled_words = []
    timed_captions = []
    
    # Transcribe using OpenAI Whisper API
    try:
        client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

        # Extract compressed audio to stay under OpenAI's 25MB limit
        import subprocess, tempfile
        audio_tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        audio_tmp.close()
        subprocess.run([
            "ffmpeg", "-y", "-i", str(input_path),
            "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k",
            audio_tmp.name
        ], capture_output=True, timeout=120)
        input_path = audio_tmp.name

        with open(input_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["word"]
            )
        os.unlink(audio_tmp.name)

        transcript_text = transcript.text or ""

        # Convert words to styled_words
        if hasattr(transcript, 'words') and transcript.words:
            for word_info in transcript.words:
                styled_words.append({
                    "word": word_info.word,
                    "start": word_info.start,
                    "end": word_info.end,
                    "style": "regular",
                    "color": [200, 220, 240]
                })
        
        # Build timed_captions: groups of 4 words using actual Whisper word timings
        if styled_words:
            chunk_size = 4
            for i in range(0, len(styled_words), chunk_size):
                chunk = styled_words[i:i + chunk_size]
                start = chunk[0]["start"]
                end = chunk[-1]["end"]
                text = " ".join(w["word"] for w in chunk)
                timed_captions.append([start, end, [text]])
        
        print(f"[Prep] Transcribed {len(styled_words)} words for {prep_id}")
        
    except Exception as e:
        print(f"[Prep] Transcription error: {e}")
    
    # Save prep data
    with open(prep_path, "w", encoding="utf-8") as f:
        json.dump({
            "input_video": str(input_path),
            "video_id": body.video_id,
            "user_id": user["id"],
            "transcript_text": transcript_text,
            "styled_words": styled_words,
            "timed_captions": timed_captions,
            "broll_placements": [],
        }, f, indent=2)
    
    return {"prep_id": prep_id, "video_id": body.video_id}

def _extract_video_id_from_path(input_path: str) -> str:
    """Extract video_id (e.g. 12c1f5c70174) from input_video path."""
    if not input_path:
        return ""
    name = Path(input_path).stem
    return name

def _validate_prep_id(prep_id: str) -> None:
    """Validate prep_id to prevent path traversal."""
    if not prep_id or len(prep_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid prep ID")
    if ".." in prep_id or "/" in prep_id or "\\" in prep_id:
        raise HTTPException(status_code=400, detail="Invalid prep ID")
    if not all(c.isalnum() or c in "-_" for c in prep_id):
        raise HTTPException(status_code=400, detail="Invalid prep ID")

def _validate_clip_id(clip_id: str) -> str:
    """Validate and sanitize clip_id for path safety."""
    if not clip_id or len(clip_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid clip ID")
    safe = "".join(c for c in clip_id if c.isalnum() or c == "_")
    if not safe:
        raise HTTPException(status_code=400, detail="Invalid clip ID")
    return safe

def _check_prep_ownership(data: dict, user: dict) -> None:
    """Raise 403 if prep has user_id and it doesn't match."""
    prep_user = data.get("user_id")
    if prep_user and prep_user != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")

@app.get("/api/prep/{prep_id}")
async def get_prep(prep_id: str, user: dict = Depends(require_auth)):
    """Get prep data for EditClip. Adds video_id from input_video path if missing."""
    _validate_prep_id(prep_id)
    path = PREP_DIR / f"{prep_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prep session not found")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _check_prep_ownership(data, user)
    if not data.get("video_id") and data.get("input_video"):
        data["video_id"] = _extract_video_id_from_path(data["input_video"])
    
    # Debug logging for transcript data
    print(f"[DEBUG get_prep] prep_id={prep_id}")
    print(f"[DEBUG get_prep] transcript_text length={len(data.get('transcript_text', ''))}")
    print(f"[DEBUG get_prep] styled_words count={len(data.get('styled_words', []))}")
    print(f"[DEBUG get_prep] timed_captions count={len(data.get('timed_captions', []))}")
    
    return data

@app.get("/api/prep/{prep_id}/debug")
async def debug_prep(prep_id: str, user: dict = Depends(require_auth)):
    """Debug endpoint to check prep data health."""
    _validate_prep_id(prep_id)
    path = PREP_DIR / f"{prep_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prep session not found")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _check_prep_ownership(data, user)
    
    # Analyze styled_words field names
    styled_words = data.get("styled_words", [])
    sample_word = styled_words[0] if styled_words else None
    
    return {
        "prep_id": prep_id,
        "status": data.get("status", "unknown"),
        "transcript_stats": {
            "transcript_text_length": len(data.get("transcript_text", "")),
            "transcript_text_preview": data.get("transcript_text", "")[:100] + "..." if len(data.get("transcript_text", "")) > 100 else data.get("transcript_text", ""),
        },
        "styled_words_stats": {
            "count": len(styled_words),
            "sample_fields": list(sample_word.keys()) if sample_word else [],
            "has_word_field": sample_word.get("word") is not None if sample_word else False,
            "has_text_field": sample_word.get("text") is not None if sample_word else False,
            "first_3_words": [w.get("word") or w.get("text") for w in styled_words[:3]] if styled_words else [],
        },
        "timed_captions_stats": {
            "count": len(data.get("timed_captions", [])),
            "first_caption": data.get("timed_captions", [])[0] if data.get("timed_captions") else None,
        },
        "broll_placements_count": len(data.get("broll_placements", [])),
    }

class PrepUpdateBody(BaseModel):
    styled_words: Optional[List[Any]] = None
    timed_captions: Optional[List[Any]] = None
    transcript_text: Optional[str] = None
    broll_placements: Optional[List[Any]] = None

@app.patch("/api/prep/{prep_id}")
async def update_prep(prep_id: str, body: PrepUpdateBody, user: dict = Depends(require_auth)):
    """Update prep data (transcript, captions, broll)."""
    _validate_prep_id(prep_id)
    path = PREP_DIR / f"{prep_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prep session not found")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _check_prep_ownership(data, user)
    if body.styled_words is not None:
        data["styled_words"] = body.styled_words
    if body.timed_captions is not None:
        data["timed_captions"] = body.timed_captions
    if body.transcript_text is not None:
        data["transcript_text"] = body.transcript_text
    if body.broll_placements is not None:
        data["broll_placements"] = body.broll_placements
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    return {"ok": True}

def _get_clip_options_for_placement(broll_engine, placement: dict, num_options: int = 4) -> List[Dict]:
    """Helper to get clip options with thumbnails for a placement."""
    scene_request = {
        "theme": placement.get("theme", ""),
        "emotion": placement.get("emotion", ""),
        "energy": placement.get("energy", "medium"),
    }
    
    clip_options = broll_engine.get_clip_options(scene_request, num_options=num_options)
    
    # Generate/serve thumbnails
    THUMB_DIR = DATA_DIR / "broll_thumbnails"
    THUMB_DIR.mkdir(exist_ok=True)
    
    for option in clip_options:
        clip_id = option["clip_id"]
        thumb_path = THUMB_DIR / f"{clip_id}.jpg"
        
        # Generate thumbnail if doesn't exist
        if not thumb_path.exists():
            broll_engine.generate_thumbnail(option["path"], str(thumb_path))
        
        # Add thumbnail URL
        if thumb_path.exists():
            option["thumbnail_url"] = f"/api/broll-thumbnail/{clip_id}"
        else:
            option["thumbnail_url"] = None
        
        # Remove full path for security
        del option["path"]
    
    return clip_options


@app.post("/api/prep/{prep_id}/broll-suggestions")
async def generate_broll_suggestions(prep_id: str, user: dict = Depends(require_auth)):
    """Generate B-roll suggestions - simplified, full processing on RunPod."""
    _validate_prep_id(prep_id)
    path = PREP_DIR / f"{prep_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prep session not found")
    
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _check_prep_ownership(data, user)
    
    # Return existing placements or empty list - B-roll planning happens on RunPod
    return {"broll_placements": data.get("broll_placements", [])}

@app.post("/api/prep/{prep_id}/regenerate-placement/{placement_index:int}")
async def regenerate_placement(prep_id: str, placement_index: int, user: dict = Depends(require_auth)):
    """Regenerate a single B-roll placement - simplified, full processing on RunPod."""
    _validate_prep_id(prep_id)
    path = PREP_DIR / f"{prep_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prep session not found")
    
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _check_prep_ownership(data, user)
    
    placements = data.get("broll_placements", [])
    # Return existing placements - full B-roll processing happens on RunPod
    return {"broll_placements": placements}

@app.get("/api/prep/{prep_id}/broll-clips/{placement_index:int}")
async def get_broll_clips(prep_id: str, placement_index: int, user: dict = Depends(require_auth)):
    """Get available clip options for a B-roll placement - simplified, processing on RunPod."""
    _validate_prep_id(prep_id)
    path = PREP_DIR / f"{prep_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prep session not found")
    
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _check_prep_ownership(data, user)
    
    placements = data.get("broll_placements", [])
    if not (0 <= placement_index < len(placements)):
        raise HTTPException(status_code=400, detail="Invalid placement index")
    
    # Return placement's existing clip options or empty list
    placement = placements[placement_index]
    return {
        "placement_index": placement_index,
        "clip_options": placement.get("clip_options", [])
    }

@app.get("/api/broll-thumbnail/{clip_id}")
async def get_broll_thumbnail(clip_id: str):
    """Serve a B-roll clip thumbnail image. Extracts frame from video using ffmpeg."""
    import subprocess
    
    # Note: No auth required - movie clips are public assets
    
    THUMB_DIR = DATA_DIR / "broll_thumbnails"
    THUMB_DIR.mkdir(exist_ok=True)
    
    # Clean clip_id
    safe_id = _validate_clip_id(clip_id)
    thumb_path = THUMB_DIR / f"{safe_id}.jpg"
    
    # Return cached thumbnail if exists
    if thumb_path.exists():
        print(f"[Thumbnail] Serving cached: {thumb_path}")
        return FileResponse(thumb_path, media_type="image/jpeg")
    
    # Build video path directly - clip_id is like "movie_clips_1"
    video_path = BASE_DIR / "movie_clips" / f"{safe_id}.mp4"
    
    # Try portrait folder if not found
    if not video_path.exists():
        video_path = BASE_DIR / "movie_clips_portrait" / f"{safe_id}.mp4"
    
    if not video_path.exists():
        print(f"[Thumbnail] Video not found: {safe_id}")
        raise HTTPException(status_code=404, detail="Video not found")
    
    print(f"[Thumbnail] Generating from: {video_path}")
    
    # Extract frame using ffmpeg (no cv2 needed)
    try:
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", "0.5", "-i", str(video_path),
            "-vframes", "1",
            "-vf", "scale=320:-2",
            str(thumb_path)
        ]
        subprocess.run(cmd, capture_output=True, timeout=10, check=True)
        
        if thumb_path.exists():
            print(f"[Thumbnail] Saved and serving: {thumb_path}")
            return FileResponse(thumb_path, media_type="image/jpeg")
        else:
            raise HTTPException(status_code=500, detail="Thumbnail generation failed")
        
    except Exception as e:
        print(f"[Thumbnail] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Thumbnail generation failed")

def _generate_color_grade_previews(input_video: str) -> dict:
    """Extract a frame from the user's video, apply each LUT, return base64 data URLs."""
    import subprocess
    import tempfile

    if not input_video or not Path(input_video).exists():
        return {}

    preview_width = 320  # Keep small for fast generation and small base64
    result = {}

    try:
        # Get video duration using ffprobe (no cv2)
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", input_video
        ]
        result_cmd = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        duration = float(result_cmd.stdout.strip())
        # Pick frame at 2 seconds or 10% into video, whichever is earlier
        seek_time = min(2.0, duration * 0.1) if duration > 0 else 1.0
    except Exception:
        seek_time = 2.0

    with tempfile.TemporaryDirectory(prefix="color_preview_") as tmpdir:
        tmp = Path(tmpdir)

        # 1. Extract "before" frame (original, no LUT - ensure accurate colors)
        before_path = tmp / "before.jpg"
        cmd_before = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", str(seek_time), "-i", input_video,
            "-vframes", "1",
            # Use format filter to ensure proper color space, then scale
            "-vf", f"format=pix_fmts=yuv420p,scale={preview_width}:-2:flags=lanczos",
            "-q:v", "2",  # High quality JPEG
            "-f", "image2", str(before_path),
        ]
        subprocess.run(cmd_before, capture_output=True, timeout=10)
        if before_path.exists():
            with open(before_path, "rb") as f:
                result["before"] = f"data:image/jpeg;base64,{base64.b64encode(f.read()).decode()}"

        # 2. For each LUT, extract frame with LUT applied
        color_grading_dir = BASE_DIR / "color_grading"
        for grade_key, lut_filename in COLOR_GRADE_TO_LUT.items():
            lut_path = color_grading_dir / lut_filename
            if not lut_path.exists():
                continue
            lut_str = str(lut_path).replace("\\", "/").replace(":", "\\:")
            after_path = tmp / f"{grade_key}.jpg"
            cmd_after = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-ss", str(seek_time), "-i", input_video,
                "-vframes", "1",
                "-vf", f"lut3d=file='{lut_str}',scale={preview_width}:-2",
                "-f", "image2", str(after_path),
            ]
            subprocess.run(cmd_after, capture_output=True, timeout=10)
            if after_path.exists():
                with open(after_path, "rb") as f:
                    result[grade_key] = f"data:image/jpeg;base64,{base64.b64encode(f.read()).decode()}"

    return result


@app.get("/api/prep/{prep_id}/color-grade-previews")
async def get_color_grade_previews(prep_id: str, user: dict = Depends(require_auth)):
    """Generate color grade previews from a frame of the user's video."""
    _validate_prep_id(prep_id)
    path = PREP_DIR / f"{prep_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Prep session not found")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    _check_prep_ownership(data, user)
    input_video = data.get("input_video", "")
    if not input_video or not Path(input_video).exists():
        return {}
    try:
        return _generate_color_grade_previews(input_video)
    except Exception as e:
        import traceback
        print(f"[Color Grade Previews] Error: {e}")
        traceback.print_exc()
        return {}

# =============================================================================
# PIPELINE INTEGRATION
# =============================================================================


def _hex_to_rgb(hex_str: str) -> Optional[List[int]]:
    """Convert hex color (e.g. '#FFFFFF') to [R, G, B] list. Returns None if invalid."""
    if not hex_str or not isinstance(hex_str, str):
        return None
    hex_str = hex_str.strip().lstrip("#")
    if len(hex_str) == 6:
        try:
            return [int(hex_str[i : i + 2], 16) for i in (0, 2, 4)]
        except ValueError:
            pass
    return None


def _load_prep_data(prep_id: str) -> tuple:
    """Load styled_words and timed_captions from prep file. Returns (styled_words, timed_captions, transcript) or (None, None, None) if invalid."""
    if not prep_id or len(prep_id) > 64 or ".." in prep_id or "/" in prep_id or "\\" in prep_id:
        return (None, None, None)
    if not all(c.isalnum() or c in "-_" for c in prep_id):
        return (None, None, None)
    prep_path = PREP_DIR / f"{prep_id}.json"
    if not prep_path.exists():
        return (None, None, None)
    try:
        with open(prep_path, encoding="utf-8") as f:
            data = json.load(f)
        sw = data.get("styled_words") or []
        tc = data.get("timed_captions") or []
        tx = data.get("transcript_text") or ""
        if sw:
            if tc:
                print(f"[Prep] Loaded from {prep_id}: {len(sw)} words, {len(tc)} caption groups")
                return (sw, tc, tx)
            # styled_words present but timed_captions empty — return sw so pipeline can build tc from it
            print(f"[Prep] Loaded from {prep_id}: {len(sw)} words, 0 caption groups (will build from styled_words)")
            return (sw, [], tx)
    except Exception as e:
        print(f"[Prep] Failed to load {prep_id}: {e}")
    return (None, None, None)


# =============================================================================
# RUNPOD INTEGRATION
# =============================================================================
# RUNPOD CONFIG
# =============================================================================

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID")

# =============================================================================
# JOBS
# =============================================================================

JOBS: dict[str, dict] = {}
JOB_LOCK = threading.Lock()
JOBS_FILE = DATA_DIR / "jobs.json"

def _load_jobs():
    """Load jobs from disk on startup."""
    global JOBS
    if JOBS_FILE.exists():
        try:
            with open(JOBS_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                # Only load jobs that aren't too old (24 hours)
                cutoff = time.time() - (24 * 3600)
                JOBS = {k: v for k, v in loaded.items() if v.get("created_at", 0) > cutoff}
                print(f"[Jobs] Loaded {len(JOBS)} jobs from disk")
        except Exception as e:
            print(f"[Jobs] Failed to load jobs: {e}")
            JOBS = {}

def _save_jobs():
    """Save jobs to disk."""
    try:
        with open(JOBS_FILE, "w", encoding="utf-8") as f:
            json.dump(JOBS, f, indent=2)
    except Exception as e:
        print(f"[Jobs] Failed to save jobs: {e}")

# Load jobs on module initialization
_load_jobs()

# Frontend sends these keys; backend also accepts legacy names for compatibility
COLOR_GRADE_TO_LUT = {
    "vintage": "02_Film LUTs_Vintage.cube",
    "cinematic": "07_Cinematic LUTs_Flavin.cube",
    "frosted": "04_Cinematic LUTs_Frosted.cube",
    "foliage": "05_Film LUTs_Foliage.cube",
    "cross_process": "02_Film Emulation LUTs_Cross Process.cube",
    "bw": "08_Film Emulation LUTs_B&W.cube",
}

class ProcessBody(BaseModel):
    video_id: str
    lock_id: Optional[str] = None  # Credit lock ID from upload
    # Legacy / backend names
    preset: Optional[str] = "dynamic_smart"
    whisper: Optional[bool] = True
    broll: Optional[bool] = False
    noise_isolate: Optional[bool] = False
    intro: Optional[bool] = True
    instagram: Optional[bool] = True
    rounded_corners: Optional[str] = "medium"
    lut: Optional[str] = None
    transcript: Optional[str] = None
    caption_style: Optional[dict] = None
    # User's edited transcript data from frontend
    styled_words: Optional[List[Any]] = None
    timed_captions: Optional[List[Any]] = None
    transcript_text: Optional[str] = None
    # Frontend payload names (so UI options actually take effect)
    user_prompt: Optional[str] = None
    enable_broll: Optional[bool] = None
    enable_noise_isolation: Optional[bool] = None
    export_instagram: Optional[bool] = None
    color_grade_lut: Optional[str] = None
    aspect_ratio: Optional[str] = None
    caption_position: Optional[str] = None
    behind_person: Optional[bool] = None
    duration_seconds: Optional[float] = None
    model: Optional[str] = None
    style: Optional[str] = None
    enable_red_hook: Optional[bool] = None
    # Watermark options
    enable_watermark: Optional[bool] = False
    watermark_text: Optional[str] = None
    watermark_image: Optional[str] = None
    watermark_position: Optional[str] = "bottom-right"
    watermark_opacity: Optional[float] = 0.6
    # Layout options from EditClip (merged into preset config so preview matches output)
    font_size: Optional[int] = None
    position: Optional[str] = None
    y_position: Optional[float] = None
    caption_color: Optional[str] = None
    hook_color: Optional[str] = None
    hook_y_position: Optional[float] = None
    hook_position: Optional[str] = None
    hook_mask_quality: Optional[str] = None
    hook_size: Optional[float] = None
    emphasis_color: Optional[str] = None
    regular_color: Optional[str] = None
    use_emphasis_font: Optional[bool] = None
    words_per_line: Optional[int] = None
    scroll_speed: Optional[float] = None
    from_prep_id: Optional[str] = None
    # User's edited transcript data from frontend
    styled_words: Optional[List[Dict]] = None
    timed_captions: Optional[List[Any]] = None
    transcript_text: Optional[str] = None

@app.post("/api/jobs")
@limiter.limit("5/minute")
async def create_job(request: Request, body: ProcessBody, user: dict = Depends(require_auth)):
    set_user_id(user["id"])
    job_start_time = time.time()
    
    logger.info("job_creation_started", 
               user_id=user["id"],
               video_id=body.video_id,
               lock_id=body.lock_id,
               from_prep_id=body.from_prep_id)
    metrics.increment("jobs_started")
    
    # NEW CREDIT SYSTEM: Verify lock exists instead of deducting credits
    # Credits are locked during upload and only deducted on download confirmation
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    if not body.lock_id:
        logger.warning("job_no_lock_id")
        metrics.increment("jobs_failed", labels={"reason": "no_lock_id"})
        raise HTTPException(status_code=400, detail="Credit lock required. Please start from upload.")
    
    # Verify the lock exists and is valid
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/credit_locks?id=eq.{body.lock_id}&user_id=eq.{user['id']}&status=eq.active",
            headers=_sb_headers(),
            timeout=5,
        )
        
        if not r.ok or not r.json():
            raise HTTPException(status_code=402, detail="Credit lock expired or invalid. Please upload again.")
        
        lock_data = r.json()[0]
        
        # Check if lock has expired
        from datetime import datetime
        expires_at = datetime.fromisoformat(lock_data["expires_at"].replace('Z', '+00:00'))
        if datetime.now(expires_at.tzinfo) > expires_at:
            raise HTTPException(status_code=402, detail="Credit lock expired. Please upload again.")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Create Job] Lock verification error: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify credit lock")

    job_id = str(uuid.uuid4())
    # Store all settings for "Edit Again" feature
    settings = body.model_dump(exclude_unset=True)
    with JOB_LOCK:
        JOBS[job_id] = {
            "status": "queued",
            "stage": "queued",
            "message": "Job queued...",
            "progress": 0,
            "cancel_requested": False,
            "user_id": user["id"],
            "video_id": body.video_id,
            "from_prep_id": body.from_prep_id,
            "lock_id": body.lock_id,  # Store lock_id for download confirmation
            "settings": settings,  # Store all user settings for restoration
            "created_at": time.time(),
        }
        _save_jobs()

    def run():
        """Submit job to RunPod GPU worker - Railway NEVER processes videos locally."""
        import asyncio
        
        # Verify RunPod is configured
        if not RUNPOD_API_KEY or not RUNPOD_ENDPOINT_ID:
            print(f"[Job {job_id}] ERROR: RunPod not configured")
            with JOB_LOCK:
                JOBS[job_id].update(
                    status="failed",
                    stage="failed",
                    message="Video processing service not configured. Please contact support.",
                    progress=0,
                )
            return
        
        try:
            with JOB_LOCK:
                JOBS[job_id].update(status="processing", stage="starting", progress=5, message="Preparing job...")
            
            # Get the uploaded video and upload to Supabase storage for RunPod access
            input_path = _find_upload(body.video_id)
            
            with JOB_LOCK:
                JOBS[job_id].update(progress=10, message="Uploading to cloud storage...")
            
            # Upload video to Supabase storage so RunPod can access it
            sb_url = os.environ.get("SUPABASE_URL", "").strip()
            sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            
            storage_path = f"jobs/{job_id}/input.mp4"
            video_url = None

            try:
                import tempfile, subprocess as _sp

                # Compress video if over 40MB to stay under Supabase's 50MB storage limit
                upload_path = input_path
                file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
                compressed_tmp = None

                if file_size_mb > 40:
                    print(f"[Job {job_id}] File is {file_size_mb:.1f}MB, compressing before upload...")
                    compressed_tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
                    compressed_tmp.close()
                    try:
                        _sp.run([
                            "ffmpeg", "-y", "-i", str(input_path),
                            "-vf", "scale='min(1280,iw)':-2",
                            "-c:v", "libx264", "-crf", "28", "-preset", "fast",
                            "-c:a", "aac", "-b:a", "128k",
                            "-movflags", "+faststart",
                            compressed_tmp.name
                        ], capture_output=True, timeout=300, check=True)
                        compressed_size_mb = os.path.getsize(compressed_tmp.name) / (1024 * 1024)
                        print(f"[Job {job_id}] Compressed to {compressed_size_mb:.1f}MB")
                        upload_path = compressed_tmp.name
                    except Exception as compress_err:
                        print(f"[Job {job_id}] Compression failed, uploading original: {compress_err}")
                        upload_path = input_path

                with open(upload_path, "rb") as f:
                    upload_resp = requests.post(
                        f"{sb_url}/storage/v1/object/videos/{storage_path}",
                        headers={
                            "apikey": sb_key,
                            "Authorization": f"Bearer {sb_key}",
                            "Content-Type": "video/mp4",
                            "x-upsert": "true",
                        },
                        data=f,
                        timeout=300,
                    )

                # Clean up compressed temp file
                if compressed_tmp:
                    try:
                        os.unlink(compressed_tmp.name)
                    except Exception:
                        pass

                if upload_resp.ok:
                    video_url = f"{sb_url}/storage/v1/object/public/videos/{storage_path}"
                    print(f"[Job {job_id}] Uploaded to Supabase: {video_url}")
                else:
                    error_body = upload_resp.text[:500]
                    raise Exception(f"Upload failed: {upload_resp.status_code} - {error_body}")

            except Exception as e:
                print(f"[Job {job_id}] Supabase upload error: {e}")
                video_url = None

            # Fail early if we couldn't get a video URL — no point sending to RunPod
            if not video_url:
                with JOB_LOCK:
                    JOBS[job_id].update(
                        status="failed",
                        stage="failed",
                        message="Failed to upload video to cloud storage. Please try again.",
                        progress=0,
                    )
                print(f"[Job {job_id}] Aborting: no video_url after Supabase upload attempt")
                return
            
            with JOB_LOCK:
                JOBS[job_id].update(progress=15, message="Sending to GPU worker...")
            
            # Get prep data (styled words, captions, transcript)
            prep_data = {}
            if body.from_prep_id:
                loaded_sw, loaded_tc, loaded_tx = _load_prep_data(body.from_prep_id)
                if loaded_sw:
                    prep_data = {
                        "styled_words": loaded_sw,
                        "timed_captions": loaded_tc,
                        "transcript_text": loaded_tx,
                    }
            
            # Build webhook URL for RunPod callback
            railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
            webhook_url = f"https://{railway_domain}/api/webhooks/runpod" if railway_domain else ""
            
            # Build job payload for RunPod
            # Spread all user settings at top level so handler.py can read them directly
            user_settings = body.model_dump(exclude_none=True)
            print(f"[Job {job_id}] enable_red_hook={user_settings.get('enable_red_hook')} hook_size={user_settings.get('hook_size')} hook_color={user_settings.get('hook_color')}")
            job_payload = {
                "input": {
                    "job_id": job_id,
                    "video_id": body.video_id,
                    "user_id": user["id"],
                    "video_url": video_url,
                    "storage_path": storage_path if video_url else None,
                    "supabase_url": sb_url,
                    "supabase_key": sb_key,
                    "webhook_url": webhook_url,
                    "prep_data": prep_data,
                    # Spread user settings flat so handler.py can read preset, enable_red_hook, etc.
                    **user_settings,
                }
            }
            
            # Submit job to RunPod
            runpod_resp = requests.post(
                f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run",
                headers={
                    "Authorization": f"Bearer {RUNPOD_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=job_payload,
                timeout=30,
            )
            
            if runpod_resp.status_code != 200:
                raise Exception(f"RunPod submission failed: {runpod_resp.text}")
            
            runpod_job_id = runpod_resp.json()["id"]
            
            with JOB_LOCK:
                JOBS[job_id]["runpod_job_id"] = runpod_job_id
                JOBS[job_id].update(progress=20, message="Processing on GPU...")
            
            print(f"[Job {job_id}] Submitted to RunPod: {runpod_job_id}")
            
            # Poll for completion (RunPod will also call webhook)
            poll_count = 0
            while True:
                time.sleep(10)  # Poll every 10 seconds
                poll_count += 1
                
                with JOB_LOCK:
                    if JOBS.get(job_id, {}).get("cancel_requested"):
                        # Cancel RunPod job
                        try:
                            requests.post(
                                f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/cancel/{runpod_job_id}",
                                headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
                                timeout=10,
                            )
                        except:
                            pass
                        JOBS[job_id].update(status="cancelled", stage="cancelled", message="Cancelled")
                        return
                
                # Check status
                status_resp = requests.get(
                    f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status/{runpod_job_id}",
                    headers={"Authorization": f"Bearer {RUNPOD_API_KEY}"},
                    timeout=10,
                )
                
                if status_resp.status_code != 200:
                    continue
                
                status_data = status_resp.json()
                runpod_status = status_data.get("status")
                
                # Update progress based on status
                progress = min(95, 20 + poll_count * 2)
                
                with JOB_LOCK:
                    if runpod_status == "IN_QUEUE":
                        JOBS[job_id].update(progress=progress, message="Waiting in GPU queue...")
                    elif runpod_status == "IN_PROGRESS":
                        JOBS[job_id].update(progress=progress, message="Processing on GPU...")
                    elif runpod_status == "COMPLETED":
                        output = status_data.get("output", {})
                        JOBS[job_id].update(
                            status="completed",
                            stage="done",
                            message="Done!",
                            progress=100,
                            output_video_url=output.get("video_url"),
                            thumbnail_url=output.get("thumbnail_url"),
                            completed_at=time.time(),
                        )
                        _save_jobs()
                        job_duration = (time.time() - job_start_time) * 1000
                        logger.info("job_completed", 
                                   job_id=job_id,
                                   runpod_job_id=runpod_job_id,
                                   duration_ms=job_duration,
                                   has_output=bool(output.get("video_url")))
                        metrics.increment("jobs_completed")
                        metrics.timing("job_duration_ms", job_duration)
                        return
                    elif runpod_status in ["FAILED", "CANCELLED", "TIMED_OUT"]:
                        error_msg = status_data.get("error", "GPU processing failed")
                        raise Exception(error_msg)
                        
        except Exception as e:
            error_msg = str(e)
            job_duration = (time.time() - job_start_time) * 1000
            logger.error("job_failed", 
                        job_id=job_id,
                        error=error_msg,
                        error_type=type(e).__name__,
                        duration_ms=job_duration)
            capture_exception(e, extra={"job_id": job_id, "video_id": body.video_id})
            metrics.increment("jobs_failed", labels={"error_type": type(e).__name__})
            
            with JOB_LOCK:
                JOBS[job_id].update(
                    status="failed",
                    stage="failed",
                    message=error_msg,
                    progress=0,
                    failed_at=time.time(),
                )
                _save_jobs()
            
            # Release credits on failure
            if body.lock_id:
                try:
                    requests.post(
                        f"{sb_url}/rest/v1/rpc/release_credit_locks",
                        headers=_sb_headers(),
                        json={"lock_id": body.lock_id},
                        timeout=5,
                    )
                except:
                    pass

    threading.Thread(target=run, daemon=True).start()
    return {"job_id": job_id}

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str, user: dict = Depends(require_auth)):
    j = JOBS.get(job_id)
    if not j:
        raise HTTPException(status_code=404, detail="Job not found")
    if j.get("user_id") and j["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    return {k: v for k, v in j.items() if not k.startswith("_") and k != "cancel_requested"}

@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, user: dict = Depends(require_auth)):
    with JOB_LOCK:
        j = JOBS.get(job_id)
        if not j:
            raise HTTPException(status_code=404, detail="Job not found")
        if j.get("user_id") and j["user_id"] != user["id"]:
            raise HTTPException(status_code=404, detail="Job not found")
        if j.get("status") not in ("queued", "processing"):
            return {"ok": True, "message": "Job already finished"}
        j["cancel_requested"] = True
    return {"ok": True, "message": "Cancellation requested"}

# =============================================================================
# DOWNLOAD CONFIRMATION (Credit Deduction)
# =============================================================================

class DownloadConfirmBody(BaseModel):
    job_id: str
    lock_id: str

@app.post("/api/jobs/{job_id}/confirm-download")
async def confirm_download(job_id: str, body: DownloadConfirmBody, user: dict = Depends(require_auth)):
    """
    Confirm download and deduct credits.
    This is called when user clicks Download and confirms the warning.
    """
    # Verify job belongs to user
    job = JOBS.get(job_id)
    if not job or job.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Video not ready")
    
    # Verify lock matches
    if job.get("lock_id") != body.lock_id:
        raise HTTPException(status_code=400, detail="Credit lock mismatch")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    try:
        # Deduct the locked credits
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/deduct_credit_locks",
            headers=_sb_headers(),
            json={"lock_id": body.lock_id},
            timeout=5,
        )
        
        if not r.ok or not r.json():
            raise HTTPException(status_code=402, detail="Failed to process credits")
        
        # Mark job as downloaded
        with JOB_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["downloaded"] = True
                JOBS[job_id]["downloaded_at"] = time.time()
        
        return {
            "ok": True,
            "message": "100 credits used. You can now download.",
            "download_url": job.get("output_video_url"),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Confirm Download] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process download")


# =============================================================================
# RUNPOD WEBHOOK
# =============================================================================

class RunPodWebhookBody(BaseModel):
    event: str
    job_id: str
    success: bool
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error: Optional[str] = None
    processing_time: Optional[float] = None

@app.post("/api/webhooks/runpod")
async def runpod_webhook(body: RunPodWebhookBody):
    """Handle completion webhook from RunPod GPU workers."""
    job_id = body.job_id
    
    with JOB_LOCK:
        job = JOBS.get(job_id)
        if not job:
            print(f"[RunPod Webhook] Job {job_id} not found")
            return {"ok": False, "error": "Job not found"}
        
        if body.success:
            job.update(
                status="completed",
                stage="done",
                message="Done!",
                progress=100,
                output_video_url=body.video_url,
                thumbnail_url=body.thumbnail_url,
                runpod_metadata={
                    "processing_time": body.processing_time,
                }
            )
            _save_jobs()
            print(f"[RunPod Webhook] Job {job_id} completed")
        else:
            job.update(
                status="failed",
                stage="failed",
                message=body.error or "Processing failed on GPU worker",
                progress=0,
            )
            print(f"[RunPod Webhook] Job {job_id} failed: {body.error}")
    
    return {"ok": True}


# =============================================================================
# OUTPUT FILES
# =============================================================================

@app.get("/api/output/{filename}")
async def get_output(filename: str, user: dict = Depends(require_auth_with_query)):
    # Sanitize filename
    filename = Path(filename).name
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="video/mp4", filename=filename)

@app.get("/api/output/{filename}.jpg")
async def get_output_thumbnail(filename: str, user: dict = Depends(require_auth_with_query)):
    """Serve thumbnail for output video."""
    # Sanitize filename
    filename = Path(filename).name
    path = OUTPUT_DIR / f"{filename}.jpg"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path, media_type="image/jpeg")

# =============================================================================
# MY VIDEOS
# =============================================================================

@app.get("/api/videos")
async def get_my_videos(user: dict = Depends(require_auth)):
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    if not sb_url:
        return {"videos": []}
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/videos?user_id=eq.{user['id']}&order=created_at.desc",
            headers=_sb_headers(),
            timeout=5,
        )
        videos = r.json() if r.ok else []
        # Add signed URLs
        for v in videos:
            if v.get("storage_path"):
                sr = requests.post(
                    f"{sb_url}/storage/v1/object/sign/videos/{v['storage_path']}",
                    headers=_sb_headers(),
                    json={"expiresIn": 3600},
                    timeout=5,
                )
                if sr.ok:
                    v["signed_url"] = sr.json().get("signedURL", "")
        return {"videos": videos}
    except Exception as e:
        return {"videos": [], "error": str(e)}

# =============================================================================
# PAYMENTS (Razorpay)
# =============================================================================

PLANS = {
    1: {"credits": 100,  "amount_paise": 9900,  "description": "100 Credits (1 Clip)"},
    3: {"credits": 300,  "amount_paise": 19900, "description": "300 Credits (3 Clips)"},
    10: {"credits": 1000, "amount_paise": 49900, "description": "1000 Credits (10 Clips)"},
}

class CreateOrderBody(BaseModel):
    plan: int

class VerifyPaymentBody(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

@app.post("/api/payments/create-order")
@limiter.limit("10/minute")
async def create_payment_order(request: Request, body: CreateOrderBody, user: dict = Depends(require_auth)):
    plan = PLANS.get(body.plan)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if not os.environ.get("RAZORPAY_KEY_ID"):
        raise HTTPException(status_code=503, detail="Payments not configured")
    if _razorpay is None:
        raise HTTPException(status_code=503, detail="Razorpay package not installed")
    try:
        rzp = _razorpay.Client(auth=(
            os.environ.get("RAZORPAY_KEY_ID", ""),
            os.environ.get("RAZORPAY_KEY_SECRET", ""),
        ))
        order = rzp.order.create({
            "amount": plan["amount_paise"],
            "currency": "INR",
            "receipt": f"obula_{uuid.uuid4().hex[:12]}",
            "notes": {"user_id": user["id"], "plan": str(body.plan)},
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail="Could not create order")
    return {
        "order_id": order["id"],
        "amount": plan["amount_paise"],
        "currency": "INR",
        "key_id": os.environ.get("RAZORPAY_KEY_ID"),
        "description": plan["description"],
    }

@app.post("/api/payments/verify")
async def verify_payment(body: VerifyPaymentBody, user: dict = Depends(require_auth)):
    secret = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Payments not configured")
    if _razorpay is None:
        raise HTTPException(status_code=503, detail="Razorpay package not installed")
    msg = f"{body.razorpay_order_id}|{body.razorpay_payment_id}"
    expected = hmac.new(secret.encode(), msg.encode(), hashlib.sha256).hexdigest()
    if expected != body.razorpay_signature:
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    try:
        rzp = _razorpay.Client(auth=(os.environ.get("RAZORPAY_KEY_ID", ""), secret))
        rzp_order = rzp.order.fetch(body.razorpay_order_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Payment verification failed")
    plan_num = int(rzp_order.get("notes", {}).get("plan", 1))
    credits  = PLANS.get(plan_num, PLANS[1])["credits"]
    _add_credits(user["id"], credits)
    return {"ok": True, "credits_added": credits}


# =============================================================================
# CREDIT LOCKS SYSTEM
# =============================================================================

class LockCreditsBody(BaseModel):
    upload_id: str
    amount: Optional[int] = 100

class LockCreditsResponse(BaseModel):
    lock_id: str
    expires_at: str
    message: str

@app.post("/api/credits/lock")
async def lock_credits_api(body: LockCreditsBody, user: dict = Depends(require_auth)):
    """Lock credits when user starts upload. Returns lock_id."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/lock_credits",
            headers=_sb_headers(),
            json={
                "user_uuid": user["id"],
                "vid_id": body.upload_id,
                "upload_vid_id": body.upload_id,
                "amount": body.amount
            },
            timeout=10,
        )
        
        if not r.ok:
            error_text = r.text[:200]
            if "Insufficient credits" in error_text:
                raise HTTPException(status_code=402, detail="Insufficient credits. Please purchase more.")
            raise HTTPException(status_code=500, detail=f"Failed to lock credits: {error_text}")
        
        lock_id = r.json()
        
        # Get expiry time
        r2 = requests.get(
            f"{sb_url}/rest/v1/credit_locks?id=eq.{lock_id}&select=expires_at",
            headers=_sb_headers(),
            timeout=5,
        )
        expires_at = r2.json()[0]["expires_at"] if r2.ok and r2.json() else None
        
        return {
            "lock_id": lock_id,
            "expires_at": expires_at,
            "message": f"{body.amount} credits locked. Unlocks in 1 hour if abandoned."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Lock Credits] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to lock credits")


@app.post("/api/credits/lock/{lock_id}/release")
async def release_credits_api(lock_id: str, user: dict = Depends(require_auth)):
    """Release locked credits (when user abandons video)."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/release_credit_locks",
            headers=_sb_headers(),
            json={"lock_id": lock_id},
            timeout=5,
        )
        
        return {"ok": True, "released": r.json() if r.ok else False}
        
    except Exception as e:
        print(f"[Release Credits] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to release credits")


@app.post("/api/credits/lock/{lock_id}/deduct")
async def deduct_credits_api(lock_id: str, user: dict = Depends(require_auth)):
    """Deduct locked credits when user confirms download."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/deduct_credit_locks",
            headers=_sb_headers(),
            json={"lock_id": lock_id},
            timeout=5,
        )
        
        if r.ok and r.json():
            return {"ok": True, "deducted": True, "message": "100 credits used"}
        else:
            raise HTTPException(status_code=400, detail="Failed to deduct credits")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Deduct Credits] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to deduct credits")


@app.post("/api/credits/lock/{lock_id}/retry")
async def increment_retry_api(lock_id: str, user: dict = Depends(require_auth)):
    """Increment retry count when user clicks Edit Again. Returns remaining retries."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    try:
        # First, get current retry count
        r1 = requests.get(
            f"{sb_url}/rest/v1/credit_locks?id=eq.{lock_id}&user_id=eq.{user['id']}&status=eq.active&select=retry_count,max_retries",
            headers=_sb_headers(),
            timeout=5,
        )
        
        if not r1.ok or not r1.json():
            raise HTTPException(status_code=404, detail="Lock not found or already used")
        
        lock_data = r1.json()[0]
        current_retry = lock_data.get("retry_count", 0)
        max_retries = lock_data.get("max_retries", 5)
        
        if current_retry >= max_retries:
            raise HTTPException(status_code=403, detail="Maximum retries exceeded. Please download the video.")
        
        # Increment retry count directly
        new_retry = current_retry + 1
        r2 = requests.patch(
            f"{sb_url}/rest/v1/credit_locks?id=eq.{lock_id}&user_id=eq.{user['id']}",
            headers=_sb_headers(),
            json={"retry_count": new_retry, "updated_at": "now()"},
            timeout=5,
        )
        
        if not r2.ok:
            raise HTTPException(status_code=500, detail="Failed to update retry count")
        
        remaining = max_retries - new_retry
        
        return {
            "ok": True,
            "retry_count": new_retry,
            "remaining_retries": remaining,
            "message": f"{remaining} retries remaining"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Increment Retry] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to track retry")


@app.get("/api/credits/lock/{lock_id}")
async def get_lock_status(lock_id: str, user: dict = Depends(require_auth)):
    """Get lock status including remaining retries and expiry."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/credit_locks?id=eq.{lock_id}&user_id=eq.{user['id']}&select=*",
            headers=_sb_headers(),
            timeout=5,
        )
        
        if not r.ok or not r.json():
            raise HTTPException(status_code=404, detail="Lock not found")
        
        lock = r.json()[0]
        remaining = lock.get("max_retries", 5) - lock.get("retry_count", 0)
        
        return {
            "lock_id": lock["id"],
            "status": lock["status"],
            "locked_amount": lock["locked_amount"],
            "locked_at": lock["locked_at"],
            "expires_at": lock["expires_at"],
            "retry_count": lock["retry_count"],
            "max_retries": lock["max_retries"],
            "remaining_retries": max(remaining, 0),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Get Lock Status] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get lock status")


@app.get("/api/credits/status")
async def get_credits_status(user: dict = Depends(require_auth)):
    """Get user's credit status: total, locked, available."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    try:
        # Get total credits from profile
        r1 = requests.get(
            f"{sb_url}/rest/v1/profiles?id=eq.{user['id']}&select=credits,locked_credits",
            headers=_sb_headers(),
            timeout=5,
        )
        
        profile = r1.json()[0] if r1.ok and r1.json() else {"credits": 0, "locked_credits": 0}
        total = profile.get("credits", 0)
        locked = profile.get("locked_credits", 0)
        
        # Get active locks
        r2 = requests.get(
            f"{sb_url}/rest/v1/credit_locks?user_id=eq.{user['id']}&status=eq.active&select=*",
            headers=_sb_headers(),
            timeout=5,
        )
        
        active_locks = r2.json() if r2.ok else []
        
        return {
            "total_credits": total,
            "locked_credits": locked,
            "available_credits": max(total - locked, 0),
            "active_locks": len(active_locks),
            "locks": [
                {
                    "lock_id": lock["id"],
                    "video_id": lock["video_id"],
                    "amount": lock["locked_amount"],
                    "expires_at": lock["expires_at"],
                    "remaining_retries": lock["max_retries"] - lock["retry_count"]
                }
                for lock in active_locks
            ]
        }
        
    except Exception as e:
        print(f"[Get Credits Status] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get credits status")


# =============================================================================
# CONTACT / FEEDBACK
# =============================================================================

class ContactBody(BaseModel):
    name: str
    message: str

@app.post("/api/contact")
@limiter.limit("3/minute")
async def submit_feedback(request: Request, body: ContactBody, user: dict = Depends(require_auth)):
    """Submit feedback - stores in database. Requires authentication."""
    name = (body.name or "").strip()
    message = (body.message or "").strip()
    
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    if len(message) > 5000:
        raise HTTPException(status_code=400, detail="Message too long (max 5000 chars)")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    
    # Get user's email from Supabase
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/profiles?id=eq.{user['id']}&select=email",
            headers=_sb_headers(),
            timeout=5,
        )
        rows = r.json() if r.ok else []
        user_email = rows[0].get("email") if rows else user.get("email", "")
    except Exception:
        user_email = user.get("email", "")
    
    # Store in database
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/feedbacks",
            headers=_sb_headers(),
            json={
                "user_id": user["id"],
                "name": name,
                "email": user_email,
                "message": message,
                "status": "unread"
            },
            timeout=5,
        )
        if not r.ok:
            print(f"[Feedback] Insert failed: {r.status_code} {r.text[:200]}")
            raise HTTPException(status_code=500, detail="Could not save feedback")
    except Exception as e:
        print(f"[Feedback] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save feedback")
    
    return {"ok": True, "message": "Feedback submitted successfully"}


# =============================================================================
# ADMIN ENDPOINTS
# =============================================================================

def _verify_admin(user: dict) -> bool:
    """Verify if user is admin via Supabase."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    if not sb_url:
        return False
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/profiles?id=eq.{user['id']}&select=role",
            headers=_sb_headers(),
            timeout=5,
        )
        rows = r.json() if r.ok else []
        return rows and rows[0].get("role") == "admin"
    except Exception as e:
        print(f"[Admin] Verification error: {e}")
        return False


@app.get("/api/admin/users")
async def get_admin_users(user: dict = Depends(require_auth)):
    """Admin-only: Get all users with their credits."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/profiles?select=*",
            headers=_sb_headers(),
            timeout=5,
        )
        if not r.ok:
            raise HTTPException(status_code=500, detail="Could not fetch users")
        return r.json()
    except Exception as e:
        print(f"[Admin] Fetch users error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


class GrantCreditsBody(BaseModel):
    user_id: str
    credits: int

@app.post("/api/admin/grant-credits")
async def admin_grant_credits(body: GrantCreditsBody, user: dict = Depends(require_auth)):
    """Admin-only: Grant credits to a user."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    _add_credits(body.user_id, body.credits)
    return {"ok": True, "credits_added": body.credits}


@app.get("/api/admin/feedbacks")
async def get_feedbacks(
    status: Optional[str] = None,
    user: dict = Depends(require_auth)
):
    """Admin-only: Get all feedbacks with optional status filter."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    url = f"{sb_url}/rest/v1/feedbacks?select=*&order=created_at.desc"
    if status:
        url += f"&status=eq.{status}"
    
    try:
        r = requests.get(url, headers=_sb_headers(), timeout=5)
        if not r.ok:
            raise HTTPException(status_code=500, detail="Could not fetch feedbacks")
        return r.json()
    except Exception as e:
        print(f"[Feedback] Fetch error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch feedbacks")


@app.patch("/api/admin/feedbacks/{feedback_id}")
async def update_feedback_status(
    feedback_id: str,
    status: str,
    user: dict = Depends(require_auth)
):
    """Admin-only: Update feedback status (unread/read/replied)."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if status not in ("unread", "read", "replied"):
        raise HTTPException(status_code=400, detail="Invalid status")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.patch(
            f"{sb_url}/rest/v1/feedbacks?id=eq.{feedback_id}",
            headers=_sb_headers(),
            json={"status": status},
            timeout=5,
        )
        if not r.ok:
            raise HTTPException(status_code=500, detail="Could not update feedback")
        return {"ok": True}
    except Exception as e:
        print(f"[Feedback] Update error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update feedback")


# =============================================================================
# ADMIN ANALYTICS ENDPOINTS
# =============================================================================

@app.get("/api/admin/analytics/revenue")
async def get_revenue_analytics(user: dict = Depends(require_auth)):
    """Admin-only: Get revenue statistics."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_revenue_stats",
            headers=_sb_headers(),
            timeout=5,
        )
        stats = r.json()[0] if r.ok and r.json() else {}
        
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_revenue_by_plan",
            headers=_sb_headers(),
            timeout=5,
        )
        by_plan = r.json() if r.ok else []
        
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_daily_revenue",
            headers=_sb_headers(),
            json={"days_count": 30},
            timeout=5,
        )
        daily = r.json() if r.ok else []
        
        return {"stats": stats, "by_plan": by_plan, "daily": daily}
    except Exception as e:
        print(f"[Analytics] Revenue error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch revenue analytics")


@app.get("/api/admin/analytics/payments")
async def get_payment_details(user: dict = Depends(require_auth)):
    """Admin-only: Get detailed payment history with user info."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_payment_details",
            headers=_sb_headers(),
            timeout=5,
        )
        payments = r.json() if r.ok else []
        return {"payments": payments}
    except Exception as e:
        print(f"[Analytics] Payments error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch payment details")


@app.get("/api/admin/analytics/top-buyers")
async def get_top_credit_buyers(
    period: str = 'all',
    user: dict = Depends(require_auth)
):
    """Admin-only: Get top credit buyers with time period filter."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if period not in ('all', 'today', 'week', 'month'):
        raise HTTPException(status_code=400, detail="Invalid period. Use: all, today, week, month")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_top_credit_buyers",
            headers=_sb_headers(),
            json={"period_filter": period, "limit_count": 50},
            timeout=5,
        )
        buyers = r.json() if r.ok else []
        return {"buyers": buyers, "period": period}
    except Exception as e:
        print(f"[Analytics] Top buyers error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch top buyers")


@app.get("/api/admin/analytics/user-purchases/{user_id}")
async def get_user_purchase_history(user_id: str, user: dict = Depends(require_auth)):
    """Admin-only: Get purchase history for a specific user."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_user_purchase_history",
            headers=_sb_headers(),
            json={"target_user_id": user_id},
            timeout=5,
        )
        purchases = r.json() if r.ok else []
        return {"purchases": purchases}
    except Exception as e:
        print(f"[Analytics] User purchases error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user purchase history")


@app.get("/api/admin/analytics/users")
async def get_user_analytics(user: dict = Depends(require_auth)):
    """Admin-only: Get user engagement statistics."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_user_growth_stats",
            headers=_sb_headers(),
            timeout=5,
        )
        stats = r.json()[0] if r.ok and r.json() else {}
        
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_daily_signups",
            headers=_sb_headers(),
            json={"days_count": 30},
            timeout=5,
        )
        daily = r.json() if r.ok else []
        
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_top_users_by_videos",
            headers=_sb_headers(),
            json={"limit_count": 10},
            timeout=5,
        )
        top_users = r.json() if r.ok else []
        
        return {"stats": stats, "daily": daily, "top_users": top_users}
    except Exception as e:
        print(f"[Analytics] Users error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch user analytics")


@app.get("/api/admin/analytics/videos")
async def get_video_analytics(user: dict = Depends(require_auth)):
    """Admin-only: Get video processing statistics."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_video_stats",
            headers=_sb_headers(),
            timeout=5,
        )
        stats = r.json()[0] if r.ok and r.json() else {}
        
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_daily_videos",
            headers=_sb_headers(),
            json={"days_count": 30},
            timeout=5,
        )
        daily = r.json() if r.ok else []
        
        return {"stats": stats, "daily": daily}
    except Exception as e:
        print(f"[Analytics] Videos error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch video analytics")


@app.get("/api/admin/analytics/credits")
async def get_credit_analytics(user: dict = Depends(require_auth)):
    """Admin-only: Get credit economy statistics."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_credit_stats",
            headers=_sb_headers(),
            timeout=5,
        )
        stats = r.json()[0] if r.ok and r.json() else {}
        
        r = requests.get(
            f"{sb_url}/rest/v1/profiles?credits=eq.0&select=id,email,full_name,created_at",
            headers=_sb_headers(),
            timeout=5,
        )
        zero_credit_users = r.json() if r.ok else []
        
        return {"stats": stats, "zero_credit_users": zero_credit_users}
    except Exception as e:
        print(f"[Analytics] Credits error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch credit analytics")


@app.get("/api/admin/analytics/activity")
async def get_activity_feed(user: dict = Depends(require_auth)):
    """Admin-only: Get recent activity feed."""
    if not _verify_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    try:
        r = requests.post(
            f"{sb_url}/rest/v1/rpc/get_recent_activity",
            headers=_sb_headers(),
            json={"limit_count": 20},
            timeout=5,
        )
        activities = r.json() if r.ok else []
        return {"activities": activities}
    except Exception as e:
        print(f"[Analytics] Activity error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch activity feed")


# =============================================================================
# FRONTEND OBSERVABILITY
# =============================================================================

class FrontendLogEntry(BaseModel):
    timestamp: str
    level: str
    message: str
    request_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    url: Optional[str] = None
    user_agent: Optional[str] = None

class FrontendLogsBody(BaseModel):
    logs: List[FrontendLogEntry]

class FrontendErrorReport(BaseModel):
    type: str
    message: Optional[str] = None
    source: Optional[str] = None
    lineno: Optional[int] = None
    colno: Optional[int] = None
    stack: Optional[str] = None
    reason: Optional[str] = None
    componentStack: Optional[str] = None
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    url: Optional[str] = None
    timestamp: Optional[str] = None

@app.post("/api/logs")
async def receive_frontend_logs(body: FrontendLogsBody):
    """Receive batched logs from frontend."""
    for entry in body.logs:
        # Forward to structured logger
        log_func = getattr(logger, entry.level.lower(), logger.info)
        log_func(
            f"[FRONTEND] {entry.message}",
            source="frontend",
            frontend_request_id=entry.request_id,
            session_id=entry.session_id,
            user_id=entry.user_id,
            url=entry.url,
            user_agent=entry.user_agent,
        )
    return {"ok": True, "received": len(body.logs)}

@app.post("/api/errors/report")
async def report_frontend_error(body: FrontendErrorReport):
    """Receive error reports from frontend."""
    logger.error(
        f"[FRONTEND_ERROR] {body.type}: {body.message or body.reason}",
        source="frontend",
        error_type=body.type,
        message=body.message,
        source_file=body.source,
        line=body.lineno,
        column=body.colno,
        stack=body.stack,
        component_stack=body.componentStack,
        frontend_request_id=body.request_id,
        user_id=body.user_id,
        url=body.url,
    )
    
    # Send to Sentry if configured
    try:
        if body.stack:
            capture_exception(
                Exception(f"{body.type}: {body.message}"),
                extra={
                    "source": "frontend",
                    "stack": body.stack,
                    "component_stack": body.componentStack,
                    "url": body.url,
                }
            )
    except:
        pass
    
    return {"ok": True}


# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
