# RunPod Worker for Obula

GPU-accelerated video processing worker for RunPod serverless endpoints.

## Overview

This worker handles the heavy video processing tasks:
- Video transcoding with FFmpeg
- AI-powered caption generation with Whisper
- Person segmentation with MediaPipe
- B-roll insertion
- Color grading with LUTs
- Watermarking

## File Structure

```
runpod-worker/
├── handler.py              # Main RunPod handler entry point
├── requirements.txt        # Python dependencies
├── Dockerfile             # Docker image definition
├── build.sh               # Build script
├── setup.sh               # Setup script (copies files from backend/)
├── scripts/               # Python processing modules (COPIED from backend/scripts/)
│   ├── __init__.py
│   ├── pipeline.py        # Main processing pipeline
│   ├── video_utils.py     # Video utilities
│   ├── caption_renderer.py
│   ├── mask_utils.py
│   ├── font_manager.py
│   ├── broll_engine.py
│   ├── watermark.py
│   └── ... (other modules)
├── presets/               # Caption style presets (COPIED from backend/presets/)
│   ├── viral.json
│   ├── cinematic.json
│   ├── dynamic_smart.json
│   └── ... (other presets)
├── color_grading/         # LUT files (COPIED from backend/color_grading/)
│   ├── 02_Film_LUTs_Vintage.cube
│   └── ... (other LUTs)
└── fonts/                 # Font files (COPIED from backend/fonts/)
    ├── Coolvetica Rg.otf
    └── Runethia.otf
```

## Setup Instructions

### 1. Copy Required Files from Backend

Run the setup script to copy all necessary files:

```bash
cd runpod-worker
bash setup.sh
```

Or manually copy:
```bash
# Copy Python scripts
mkdir -p scripts
cp ../backend/scripts/*.py scripts/

# Copy presets
mkdir -p presets
cp ../backend/presets/*.json presets/

# Copy LUTs
mkdir -p color_grading
cp ../backend/color_grading/*.cube color_grading/

# Copy fonts
mkdir -p fonts
cp ../backend/fonts/* fonts/
```

### 2. Build Docker Image

```bash
bash build.sh
```

Or manually:
```bash
docker build -t obula-runpod-worker:latest .
```

### 3. Push to Docker Hub

```bash
docker tag obula-runpod-worker:latest yourusername/obula-runpod-worker:latest
docker push yourusername/obula-runpod-worker:latest
```

### 4. Create RunPod Endpoint

1. Go to https://www.runpod.io/console/serverless
2. Click "New Endpoint"
3. Select your Docker image
4. Configure GPU (e.g., RTX 3090)
5. Set environment variables:
   - `OPENAI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Deploy

## Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key for Whisper transcription
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

Optional:
- `RUNPOD_API_KEY` - RunPod API key (for testing)

## Testing Locally

```bash
docker run --gpus all \
  -e OPENAI_API_KEY=sk-xxx \
  -e SUPABASE_URL=https://xxx.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=xxx \
  -it --rm \
  obula-runpod-worker:latest
```

## Input Format

The handler expects this input format:

```json
{
  "input": {
    "job_id": "uuid-string",
    "video_url": "https://...",
    "user_id": "user-uuid",
    "styled_words": [...],
    "timed_captions": [...],
    "transcript_text": "...",
    "preset": "dynamic_smart",
    "enable_broll": false,
    "noise_isolate": false,
    "lut_name": "02_Film_LUTs_Vintage.cube",
    "aspect_ratio": null,
    "rounded_corners": "medium",
    "webhook_url": "https://...",
    "supabase_url": "https://...",
    "supabase_key": "...",
    "caption_color": "#FFFFFF",
    "hook_color": "#FF0000"
  }
}
```

## Output Format

```json
{
  "success": true,
  "job_id": "uuid-string",
  "video_id": "short-id",
  "video_url": "https://supabase...",
  "thumbnail_url": "https://supabase...",
  "duration": 28.5,
  "output_size": 15234567,
  "processing_time": 45.2
}
```

## Troubleshooting

### Import Errors
If you see "No module named 'scripts'", ensure:
1. All .py files are copied to scripts/
2. scripts/__init__.py exists
3. PYTHONPATH is set correctly in Dockerfile

### Missing Assets
If LUTs or fonts are missing:
1. Check color_grading/ and fonts/ directories exist
2. Verify files are copied in Dockerfile

### GPU Not Available
Ensure you're using a GPU-enabled RunPod template and the base image includes CUDA.

## Files Sync

When updating backend/scripts/, remember to:
1. Re-run `setup.sh` to copy new files
2. Rebuild Docker image
3. Push to Docker Hub
4. Update RunPod endpoint
