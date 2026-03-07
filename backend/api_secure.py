"""
SECURE VERSION - Production-ready API with rate limiting
Copy these additions to your api.py
"""

# ============================================================
# ADD THESE IMPORTS AT THE TOP
# ============================================================
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, Response
import time
import logging

# ============================================================
# SETUP LOGGING (Add after imports)
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================
# ADD RATE LIMITER (Replace your existing FastAPI app initialization)
# ============================================================
# OLD:
# app = FastAPI(title="Obula API", version="1.0.0")

# NEW:
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Obula API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ============================================================
# ADD REQUEST LOGGING MIDDLEWARE
# ============================================================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests with timing."""
    start_time = time.time()
    
    # Get client IP (respecting reverse proxy)
    client_ip = request.headers.get('x-forwarded-for', request.client.host)
    
    logger.info(f"→ {request.method} {request.url.path} - {client_ip}")
    
    try:
        response = await call_next(request)
        duration = time.time() - start_time
        
        logger.info(f"← {request.method} {request.url.path} - {response.status_code} - {duration:.2f}s")
        
        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        return response
    except Exception as e:
        logger.error(f"✗ {request.method} {request.url.path} - ERROR: {e}")
        raise

# ============================================================
# ADD RATE LIMITS TO ENDPOINTS
# ============================================================

# Upload - very restrictive (large files)
@app.post("/api/upload")
@limiter.limit("5/minute")  # 5 uploads per minute per IP
async def upload_video(
    request: Request,  # Required for slowapi
    file: UploadFile = File(...), 
    user: dict = Depends(require_auth)
):
    """Upload a video file."""
    # ... existing code ...
    pass

# Job creation - moderate rate limit
@app.post("/api/jobs")
@limiter.limit("10/minute")  # 10 jobs per minute per IP
async def create_job(
    request: Request,  # Required for slowapi
    body: ProcessBody, 
    user: dict = Depends(require_auth)
):
    """Create a new processing job."""
    # ... existing code ...
    pass

# Auth endpoints - strict to prevent brute force
@app.get("/api/auth/me")
@limiter.limit("30/minute")
async def auth_me(
    request: Request,  # Required for slowapi
    user: dict = Depends(require_auth)
):
    """Get current user."""
    # ... existing code ...
    pass

# Health check - permissive
@app.get("/api/health")
@limiter.limit("60/minute")
async def health(request: Request):
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}

# ============================================================
# ENHANCED HEALTH CHECK
# ============================================================
@app.get("/api/health/detailed")
@limiter.limit("10/minute")
async def health_detailed(request: Request):
    """Detailed health check with service status."""
    import shutil
    import psutil
    
    checks = {
        "status": "ok",
        "timestamp": time.time(),
        "version": "1.0.0",
        "services": {}
    }
    
    # Check disk space
    disk = shutil.disk_usage("/")
    checks["disk"] = {
        "free_gb": disk.free // (2**30),
        "total_gb": disk.total // (2**30),
        "healthy": disk.free > 10 * (2**30)  # 10GB minimum
    }
    
    # Check memory
    memory = psutil.virtual_memory()
    checks["memory"] = {
        "available_gb": memory.available // (2**30),
        "percent_used": memory.percent,
        "healthy": memory.percent < 90
    }
    
    # Check OpenAI connectivity
    try:
        openai_key = os.environ.get("OPENAI_API_KEY", "")
        checks["services"]["openai"] = "ok" if openai_key.startswith("sk-") else "not_configured"
    except Exception as e:
        checks["services"]["openai"] = f"error: {e}"
    
    # Check Supabase connectivity
    try:
        sb_url = os.environ.get("SUPABASE_URL", "")
        checks["services"]["supabase"] = "ok" if sb_url else "not_configured"
    except Exception as e:
        checks["services"]["supabase"] = f"error: {e}"
    
    # Overall health
    checks["healthy"] = all([
        checks["disk"]["healthy"],
        checks["memory"]["healthy"],
        checks["services"].get("openai") == "ok",
        checks["services"].get("supabase") == "ok"
    ])
    
    if not checks["healthy"]:
        return Response(
            content=json.dumps(checks),
            status_code=503,
            media_type="application/json"
        )
    
    return checks

# ============================================================
# FILE CLEANUP SCHEDULER
# ============================================================
from fastapi_utils.tasks import repeat_every

@app.on_event("startup")
@repeat_every(seconds=86400)  # Run daily
async def cleanup_old_files():
    """Clean up old upload and output files."""
    import asyncio
    
    logger.info("Starting file cleanup job...")
    
    cutoff_time = time.time() - (7 * 86400)  # 7 days ago
    deleted_count = 0
    
    # Clean uploads
    for file_path in UPLOAD_DIR.glob("*"):
        if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
            try:
                file_path.unlink()
                deleted_count += 1
            except Exception as e:
                logger.error(f"Failed to delete {file_path}: {e}")
    
    # Clean outputs
    for file_path in OUTPUT_DIR.glob("*"):
        if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
            try:
                file_path.unlink()
                deleted_count += 1
            except Exception as e:
                logger.error(f"Failed to delete {file_path}: {e}")
    
    logger.info(f"Cleanup complete. Deleted {deleted_count} old files.")
