# Obula — AI Video Processing Platform

Transform raw videos into viral-ready clips with AI-generated captions, B-roll insertion, color grading, and depth effects.

---

## System Architecture

### Services Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│    Frontend     │    │   Railway API    │    │  RunPod Worker  │
│   (Vercel)      │◄──►│   (FastAPI)      │◄──►│  (GPU Docker)   │
│   React/Vite    │    │   api.py         │    │  handler.py     │
└─────────────────┘    └────────┬─────────┘    └────────┬────────┘
                                 │                        │
                        ┌────────▼────────────────────────▼────────┐
                        │                Supabase                   │
                        │   Auth │ PostgreSQL DB │ S3 Storage       │
                        └───────────────────────────────────────────┘
```

---

## End-to-End Pipeline

### Phase 1 — Upload
```
User picks video
→ POST /api/credits/lock       (reserve 100 credits)
→ POST /api/upload             (validate + store to /backend/uploads/)
← Returns: video_id, lock_id
```

### Phase 2 — Prep (Transcription)
```
POST /api/prep/background
→ FFmpeg extracts compressed audio (mono MP3, 16kHz/32kbps)
→ OpenAI Whisper API → words with timestamps
→ Formats into:
   styled_words:    [{word, start, end, style, color}...]
   timed_captions:  [[start, end, ["text"]]...]
→ Saved to /backend/data/prep/{prep_id}.json
← Client polls /api/prep/{id}/status until complete
```

### Phase 3 — EditClip
```
User edits in browser tabs:
├─ Transcript  → word styles (hook/emphasis/regular/emotional)
├─ Captions    → preset, font size, colors, position
├─ B-Roll      → AI clip suggestions (Pexels/Pixabay)
├─ Effects     → Color grade LUT, noise isolation
└─ Export      → final review

Each change → PATCH /api/prep/{id} → saved to disk
```

### Phase 4 — Job Submission
```
POST /api/jobs
→ Railway uploads video to Supabase Storage
→ Loads prep_data (styled_words + timed_captions)
→ POST RunPod API → submits job with full payload:
   {video_url, prep_data, settings, webhook_url, supabase_url/key}
← Returns job_id immediately
← Client polls GET /api/jobs/{id} every 2s
```

### Phase 5 — RunPod GPU Processing
```
handler.py receives job:

[orientation]  Detect & fix video rotation
[masks]        MediaPipe → subject masks (for text-behind effect)
[captions]     Frame-by-frame OpenCV rendering:
               ├─ Read frame
               ├─ Find active words at this timestamp
               ├─ Render styled text with mask compositing
               └─ Write frame
[broll]        Insert B-roll clips at timestamps
[color grade]  Apply LUT file (vintage/cinematic/frosted/etc)
[watermark]    Overlay text/image
[export]       Final FFmpeg pass

→ Upload output.mp4 + thumbnail to Supabase Storage
→ POST /api/webhooks/runpod with result URLs
```

### Phase 6 — Completion
```
Webhook updates job:
   status           = "completed"
   output_video_url = "https://supabase.co/.../output.mp4"

Frontend detects → shows video preview (direct Supabase URL)
User clicks Download
→ POST /api/jobs/{id}/confirm-download
→ Supabase RPC deducts 100 credits from account
```

---

## Key Files

| Layer | File | What it does |
|---|---|---|
| Frontend | `pages/EditClip.jsx` | Full editing UI, tabs, real-time updates |
| Frontend | `pages/Processing.jsx` | Job progress polling + video preview |
| Frontend | `api/upload.js` | All API calls |
| Railway | `backend/api.py` | Every endpoint — auth, jobs, prep, webhooks |
| Railway | `backend/observability.py` | Logging, metrics, health checks |
| RunPod | `runpod-worker/handler.py` | Entry point: download → process → upload |
| RunPod | `runpod-worker/scripts/pipeline.py` | Full video processing orchestration |
| RunPod | `runpod-worker/scripts/caption_renderer.py` | Frame-by-frame text rendering |
| RunPod | `runpod-worker/scripts/mask_utils.py` | MediaPipe subject detection |
| Supabase | `supabase/06_credit_locks_table.sql` | Credit lock/deduct RPC functions |

---

## Data Storage Layout

```
Railway disk:
├─ /backend/uploads/{video_id}.mp4        ← uploaded raw videos
├─ /backend/data/prep/{prep_id}.json      ← transcription + captions
└─ /backend/data/jobs.json                ← all job states (persisted)

Supabase Storage (/videos bucket):
├─ jobs/{job_id}/input.mp4               ← input sent to RunPod
├─ {user_id}/{video_id}_output.mp4       ← final processed video
└─ {user_id}/{video_id}_thumb.jpg        ← thumbnail

RunPod (ephemeral, cleaned after job):
├─ /tmp/inputs/{video_id}_input.mp4
├─ /tmp/outputs/{video_id}_output.mp4
└─ /app/masks_generated/video_masks_{hash}/*.npy
```

---

## Database Schema (Supabase PostgreSQL)

```sql
profiles          -- Users: credits, locked_credits, is_admin
videos            -- Uploaded videos: metadata, storage_path, status
prep_data         -- Transcription: styled_words JSONB, timed_captions JSONB
jobs              -- Processing jobs: status, runpod_job_id, output_video_url
credit_locks      -- Active credit reservations: locked_amount, expires_at
credit_transactions -- Full credit history: type, amount, description
broll_clips       -- Cached B-roll clip results
feedbacks         -- User feedback submissions
```

---

## Credit System

```
User buys credits (Razorpay) → profiles.credits += N

Upload:   POST /api/credits/lock           → locked_credits += 100, available -= 100
Process:  (free retries up to 5x with same lock)
Download: POST /api/jobs/{id}/confirm-download → credits -= 100
Expire:   after 1 hour                    → lock expires, credits auto-restored
```

### Credit Operations

| Operation | Effect | Endpoint |
|---|---|---|
| Lock | Reserves 100 credits | `POST /api/credits/lock` |
| Release | Unlocks reserved credits | `POST /api/credits/lock/{id}/release` |
| Deduct | Actually charges credits | `POST /api/jobs/{id}/confirm-download` |
| Retry | Increments retry counter (max 5) | `POST /api/credits/lock/{id}/retry` |

---

## Processing Pipeline Stages (RunPod)

| Stage | What happens |
|---|---|
| `queued` | Job waiting to start |
| `orientation` | Detect & fix video rotation |
| `masks` | MediaPipe subject detection for depth effect |
| `captions` | Frame-by-frame caption rendering with mask compositing |
| `broll` | B-roll clip insertion at specified timestamps |
| `color_grade` | Apply LUT (vintage/cinematic/frosted/foliage/bw) |
| `watermark` | Overlay text or image watermark |
| `exporting` | Final FFmpeg encode pass |
| `done` | Upload to Supabase, webhook fired |

---

## Caption Presets

Stored in `runpod-worker/presets/` and `backend/presets/`:

| Preset | Description |
|---|---|
| `dynamic_smart` | Auto-positions captions away from subject |
| `viral` | Large bold text, high contrast |
| `cinematic` | Centered, elegant styling |
| `split` | Two-line split caption layout |
| `minimal` | Clean, small text |
| `marquee` | Scrolling ticker style |

---

## Color Grades

LUT files in `runpod-worker/color_grading/` and `backend/color_grading/`:

| Grade | Look |
|---|---|
| `vintage` | Warm, nostalgic film |
| `cinematic` | Hollywood style |
| `frosted` | Cool, winter tones |
| `foliage` | Enhanced greens |
| `cross_process` | Experimental film |
| `bw` | Black & white |

---

## Environment Variables

| Variable | Used By | Purpose |
|---|---|---|
| `SUPABASE_URL` | Railway + RunPod | Database + storage endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Railway + RunPod | Admin DB access |
| `SUPABASE_JWT_SECRET` | Railway | Verify user JWT tokens |
| `OPENAI_API_KEY` | Railway | Whisper transcription |
| `RUNPOD_API_KEY` | Railway | Submit GPU jobs |
| `RUNPOD_ENDPOINT_ID` | Railway | Target RunPod endpoint |
| `RAZORPAY_KEY_ID` | Railway | Payment processing |
| `RAZORPAY_KEY_SECRET` | Railway | Payment verification |
| `RAILWAY_PUBLIC_DOMAIN` | Railway | Webhook URL construction |
| `ENV` | Railway | `production` or `development` |
| `MAX_UPLOAD_MB` | Railway | Max upload size (default: 500) |

---

## API Endpoints

### Auth
All protected endpoints require: `Authorization: Bearer <jwt_token>`

### Core
```
POST   /api/upload                          Upload video file
POST   /api/prep/background                 Start transcription (async)
GET    /api/prep/{id}/status                Poll transcription progress
GET    /api/prep/{id}                       Get full prep data
PATCH  /api/prep/{id}                       Update captions/words
POST   /api/jobs                            Submit processing job
GET    /api/jobs/{id}                       Poll job status
POST   /api/jobs/{id}/confirm-download      Deduct credits & confirm
POST   /api/webhooks/runpod                 RunPod completion callback
```

### Credits
```
GET    /api/credits/status                  Get credit balance
POST   /api/credits/lock                    Lock 100 credits
POST   /api/credits/lock/{id}/release       Release locked credits
GET    /api/credits/lock/{id}               Get lock status
```

### Payments
```
POST   /api/payments/create-order           Create Razorpay order
POST   /api/payments/verify                 Verify payment & add credits
```

### Health & Monitoring
```
GET    /api/health                          Service health check
GET    /api/metrics                         Prometheus metrics
```

---

## Deployment

### Railway (API Server)
Push to `main` branch — Railway auto-deploys.

### RunPod Worker (GPU Docker)
```bash
cd runpod-worker
DOCKER_USERNAME=obulaxzypit bash build.sh
docker push obulaxzypit/obula-runpod-worker:latest
```
Then in RunPod dashboard → Serverless endpoint → Edit → Save to pull new image.

### Frontend (Vercel)
Push to `main` branch — Vercel auto-deploys.

---

## Health & Monitoring

```
GET /api/health    → Service health (Supabase, OpenAI, RunPod, disk)
GET /api/metrics   → Prometheus metrics (requests, jobs, uploads)
```

Structured JSON logs with request ID tracing on every request.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Framer Motion |
| API Server | FastAPI (Python 3.11) + uvicorn |
| GPU Worker | Python + OpenCV + MediaPipe + FFmpeg |
| Database | Supabase (PostgreSQL + RLS) |
| File Storage | Supabase S3 Storage |
| Auth | Supabase Auth (JWT) |
| Payments | Razorpay |
| Transcription | OpenAI Whisper API |
| Deployment | Railway (API) + RunPod Serverless (GPU) + Vercel (Frontend) |

---

## License

Private — All rights reserved.
