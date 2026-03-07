# Obula Deployment Architecture

## Overview

**Domain:** www.obula.io

**Architecture:** Distributed system with separate services for:
1. **Frontend** (Vercel) - React app serving users
2. **API Server** (Railway) - Handles auth, uploads, metadata, job queue
3. **GPU Worker** (RunPod) - Heavy video processing (captions, effects, rendering)
4. **Database/Auth** (Supabase) - PostgreSQL + Auth + Storage

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   www.obula.io  │────▶│  Vercel (Edge)  │────▶│  React Frontend │
│   (Cloudflare)  │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌──────────────────────────┘
                              ▼
                    ┌─────────────────┐
                    │   api.obula.io  │◀── Railway API Server
                    │   (Railway)     │    - Auth, uploads, jobs
                    └────────┬────────┘    - Webhooks from RunPod
                              │
                              │  HTTP/WebSocket
                              ▼
                    ┌─────────────────┐
                    │   RunPod GPU    │◀── Worker pods (auto-scale)
                    │   Serverless    │    - Video processing
                    │                 │    - Caption rendering
                    └────────┬────────┘    - Effects, encoding
                              │
                              │  Storage
                              ▼
                    ┌─────────────────┐
                    │    Supabase     │◀── PostgreSQL + Auth
                    │                 │    - User data, credits
                    │   Storage       │    - Video storage
                    └─────────────────┘
```

---

## 1. Supabase (Database & Auth)

**Already configured** ✅

**Tables needed:**
- `users` - Managed by Supabase Auth
- `videos` - Video metadata, storage paths
- `credits` - User credit balance
- `credit_locks` - Upload locks (new credit system)
- `jobs` - Processing job status

**Storage buckets:**
- `videos` - Processed video outputs
- `uploads` - Raw user uploads (optional, can use S3)

**Environment variables for backend:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

---

## 2. RunPod (GPU Video Processing)

**Why RunPod?**
- Serverless GPU workers (pay per second)
- Automatic scaling (0 to many GPUs)
- CUDA support for ML models (Whisper, segmentation)
- FFmpeg with GPU encoding support

**Worker Responsibilities:**
- Transcription (OpenAI Whisper)
- Person segmentation (MediaPipe/Background removal)
- Caption rendering (PIL/Cairo)
- B-roll compositing
- Color grading (LUTs)
- Final video encoding (x264/x265)

### RunPod Worker Setup

**Option A: Serverless Endpoint (Recommended)**
```
1. Create Serverless Endpoint in RunPod dashboard
2. Deploy worker as Docker image
3. Configure auto-scaling (min: 0, max: 10 workers)
4. Set max runtime per job (e.g., 10 minutes)
```

**Option B: Secure Cloud (Persistent GPU)**
```
For testing/debugging - not for production
```

### RunPod Worker Code

See `runpod-worker/` directory for implementation:
- `handler.py` - Main entry point
- `Dockerfile` - GPU-enabled container
- `requirements.txt` - Python dependencies

**Input payload:**
```json
{
  "input": {
    "job_id": "uuid",
    "video_url": "https://...",
    "styled_words": [...],
    "timed_captions": [...],
    "preset": "dynamic_smart",
    "enable_broll": true,
    "noise_isolate": false,
    "lut_path": "...",
    "watermark": {...},
    "webhook_url": "https://api.obula.io/api/jobs/webhook"
  }
}
```

**Output:**
```json
{
  "output": {
    "success": true,
    "video_url": "https://...",
    "thumbnail_url": "https://...",
    "duration": 45.5
  }
}
```

---

## 3. Railway (API Server)

**Why Railway?**
- Easy deployment from GitHub
- Auto-deploy on push
- Built-in environment variables
- Persistent volumes for uploads
- Good for Python/FastAPI

**API Responsibilities:**
- User authentication (Supabase JWT)
- Credit management
- Video upload handling
- Job queue management
- Webhook handling from RunPod
- Serving processed videos

### Railway Setup Steps

```bash
# 1. Connect GitHub repo to Railway
# 2. Set root directory to /backend
# 3. Configure environment variables
# 4. Add persistent volume for uploads/outputs
```

**Required environment variables:**
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# OpenAI
OPENAI_API_KEY=sk-...

# RunPod
RUNPOD_API_KEY=your-runpod-api-key
RUNPOD_ENDPOINT_ID=your-endpoint-id

# Razorpay (optional)
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...

# Config
ENV=production
DEBUG=false
MAX_UPLOAD_MB=500
CORS_ORIGINS=https://www.obula.io
```

---

## 4. Vercel (Frontend)

**Why Vercel?**
- Edge deployment (fast globally)
- React/Node optimized
- Auto-deploy on push
- Built-in CDN

**Frontend Responsibilities:**
- User interface
- Video upload
- EditClip (transcript editing)
- Job progress polling
- Video playback

### Vercel Setup

```bash
# 1. Connect GitHub repo to Vercel
# 2. Set root directory to /frontend
# 3. Configure build settings (npm run build)
# 4. Set environment variables
```

**Required environment variables:**
```env
VITE_API_URL=https://api.obula.io
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## 5. Domain Configuration (www.obula.io)

### DNS Records (Cloudflare recommended)

```
Type    Name              Value                           TTL
─────────────────────────────────────────────────────────────
A       @                 Vercel IPs (or CNAME)           Auto
CNAME   www               cname.vercel-dns.com            Auto
CNAME   api               railway-app-name.up.railway.app Auto
```

### Vercel Domain Setup
1. Add custom domain in Vercel dashboard
2. Verify domain ownership
3. Configure www.obula.io as primary

### Railway Domain Setup
1. Add custom domain in Railway dashboard
2. Set domain: api.obula.io
3. Add CNAME record pointing to Railway

---

## Deployment Flow

```
Developer pushes code
        │
        ▼
┌─────────────────┐
│  GitHub Actions │──▶ Run tests
│   (optional)    │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│Railway │ │Vercel  │
│(API)   │ │(Frontend)
└────┬───┘ └───┬────┘
     │         │
     ▼         ▼
┌─────────────────┐
│  Auto-deployed  │
│   to production │
└─────────────────┘
```

---

## Video Processing Flow

```
User uploads video
        │
        ▼
┌─────────────────┐
│  Frontend       │──▶ Uploads to API (Railway)
│  (Vercel)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Server     │──▶ Saves to volume
│  (Railway)      │──▶ Creates job in DB
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API calls      │──▶ Submits job to RunPod
│  RunPod         │    (async, via webhook)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  RunPod Worker  │──▶ Downloads video
│  (GPU Serverless)│   Processes with GPU
│                 │──▶ Uploads result to Supabase Storage
└────────┬────────┘
         │
         │ Webhook
         ▼
┌─────────────────┐
│  API Server     │──▶ Updates job status
│  (Railway)      │──▶ Notifies user (WebSocket/polling)
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Frontend       │──▶ Shows completed video
│  (Vercel)       │    User can download
└─────────────────┘
```

---

## Cost Estimation (Monthly)

| Service | Usage | Est. Cost |
|---------|-------|-----------|
| **Vercel** | Frontend (Pro plan) | $20 |
| **Railway** | API server (2GB RAM) | $10-20 |
| **Supabase** | DB + Auth + Storage (500MB) | $25 (free tier initially) |
| **RunPod** | 100 videos @ 2 min each | $20-40 |
| **Cloudflare** | DNS + CDN | Free |
| **Total** | | **$75-105/month** |

RunPod costs depend on video volume:
- GPU: RTX 3090 @ $0.44/hour
- 2 min video = ~$0.015
- 1000 videos = ~$15

---

## Monitoring & Alerts

**RunPod:**
- Job failure rates
- Worker cold start times
- Average job duration

**Railway:**
- API response times
- Error rates
- Disk usage (uploads)

**Supabase:**
- Database connections
- Storage usage
- Auth events

**Vercel:**
- Web Vitals
- Build times
- Traffic analytics

---

## Next Steps

1. ✅ **Supabase** - Already configured
2. 🔄 **RunPod Worker** - Create serverless endpoint + deploy worker
3. 🔄 **Railway** - Connect repo, configure env vars, add volume
4. 🔄 **Vercel** - Connect repo, configure env vars, add domain
5. 🔄 **DNS** - Configure Cloudflare for www.obula.io
