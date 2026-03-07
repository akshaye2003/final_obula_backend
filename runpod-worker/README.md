# RunPod Worker for Obula

GPU-accelerated video processing worker for RunPod serverless.

## Architecture

This worker runs on RunPod's GPU instances and handles:
- Video transcoding with FFmpeg (GPU-accelerated)
- Person segmentation with MediaPipe
- Caption rendering with PIL
- B-roll compositing
- Color grading with LUTs
- Upload to Supabase Storage

## Directory Structure

```
runpod-worker/
├── Dockerfile           # GPU-enabled container
├── handler.py          # Main RunPod handler
├── requirements.txt    # Python dependencies
├── build.sh           # Docker build script
├── README.md          # This file
├── scripts/           # Pipeline scripts (copied from backend)
├── presets/           # Caption presets
├── color_grading/     # LUT files
├── fonts/            # Font files
├── movie_clips/      # B-roll clips (landscape)
└── movie_clips_portrait/  # B-roll clips (portrait)
```

## Setup

### 1. Copy Backend Scripts

```bash
cd runpod-worker
./build.sh  # This will copy scripts and build
```

Or manually:
```bash
mkdir -p scripts presets color_grading fonts
cp ../backend/scripts/*.py scripts/
cp ../backend/presets/*.json presets/
cp ../backend/color_grading/*.cube color_grading/
cp -r ../backend/fonts/* fonts/
```

### 2. Build and Push Docker Image

```bash
# Build
docker build -t obula-runpod-worker:latest .

# Tag for Docker Hub
docker tag obula-runpod-worker:latest YOUR_USERNAME/obula-runpod-worker:latest

# Push
docker push YOUR_USERNAME/obula-runpod-worker:latest
```

### 3. Create RunPod Serverless Endpoint

1. Go to [RunPod Console](https://runpod.io/console)
2. Click "Serverless" → "New Endpoint"
3. Configure:
   - **Name**: `obula-video-processor`
   - **Template**: Select GPU template or custom
   - **Image**: `YOUR_USERNAME/obula-runpod-worker:latest`
   - **GPU**: RTX 3090 or A100 (for better performance)
   - **Max Workers**: 5 (adjust based on demand)
   - **Idle Timeout**: 30 seconds
   - **Execution Timeout**: 600 seconds (10 minutes)

4. Add Environment Variables (optional, can pass in request):
   ```
   OPENAI_API_KEY=sk-...
   SUPABASE_URL=https://...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

5. Save endpoint and copy the **Endpoint ID**

## API Input Format

```json
{
  "input": {
    "job_id": "uuid-from-api",
    "video_url": "https://api.obula.io/api/upload/video_id/video",
    "user_id": "user-uuid",
    
    "styled_words": [...],
    "timed_captions": [...],
    "transcript_text": "...",
    
    "preset": "dynamic_smart",
    "enable_broll": false,
    "noise_isolate": false,
    "aspect_ratio": "9:16",
    "rounded_corners": "medium",
    
    "caption_color": "#FFFFFF",
    "hook_color": "#FFC850",
    "emphasis_color": "#FFC850",
    "regular_color": "#C8DCF0",
    
    "enable_red_hook": true,
    "hook_size": 1,
    
    "watermark": {
      "enabled": true,
      "text": "@obula",
      "position": "bottom-right",
      "opacity": 0.6
    },
    
    "supabase_url": "https://...",
    "supabase_key": "...",
    "webhook_url": "https://api.obula.io/api/jobs/webhook"
  }
}
```

## API Output Format

```json
{
  "output": {
    "success": true,
    "job_id": "uuid-from-api",
    "video_id": "generated-video-id",
    "video_url": "https://....supabase.co/storage/v1/object/public/videos/...",
    "thumbnail_url": "https://....supabase.co/storage/v1/object/public/videos/...",
    "duration": 45.5,
    "output_size": 15728640,
    "processing_time": 127.3
  }
}
```

## Testing Locally

```bash
# Set environment variables
export OPENAI_API_KEY=sk-...
export SUPABASE_URL=https://...
export SUPABASE_SERVICE_ROLE_KEY=...

# Run handler directly
python handler.py

# Or with RunPod SDK
python -m runpod.serverless.start --handler handler.py
```

## Monitoring

In RunPod Console:
- View job logs
- Monitor GPU utilization
- Track cold start times
- Set up alerts for failures

## Troubleshooting

### Job Timeout
Increase "Execution Timeout" in endpoint settings (max 1 hour).

### Out of Memory
- Use A100 (80GB) instead of RTX 3090 (24GB)
- Reduce batch sizes in pipeline
- Process shorter video segments

### Slow Cold Start
- Reduce Docker image size (use smaller base image)
- Pre-install common models
- Set longer idle timeout

### FFmpeg Errors
Ensure FFmpeg is installed in Dockerfile with GPU codecs:
```dockerfile
RUN apt-get install -y ffmpeg libnvidia-encode-xxx
```

## Pricing

RunPod charges per second of GPU usage:
- RTX 3090: ~$0.44/hour = $0.0073/minute
- A100: ~$1.99/hour = $0.033/minute

Example: 2-minute video processing on RTX 3090 ≈ $0.015
