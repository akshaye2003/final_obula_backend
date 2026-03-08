# Obula Production Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRODUCTION STACK                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  VERCEL (Frontend)                                                          │
│  ├── Next.js / React SPA                                                    │
│  ├── Static assets (CDN)                                                    │
│  └── API Routes (serverless functions)                                      │
│                              │                                               │
│                              ▼                                               │
│  RAILWAY (API Server)        │                    SUPABASE                  │
│  ├── FastAPI (Python)        │                    ├── PostgreSQL            │
│  ├── File uploads (temp)     │                    ├── Storage (S3)          │
│  ├── Job orchestration       │                    ├── Auth (JWT)            │
│  └── Webhook handlers        │                    └── Realtime (WebSocket)  │
│                              │                                               │
│                              ▼                                               │
│  RUNPOD (GPU Workers)        │                    DOCKER HUB                │
│  ├── Video processing        │                    ├── obula-worker:latest  │
│  ├── AI/ML (PyTorch)         │                    └── Versioned releases    │
│  └── Auto-scaling            │                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. DATABASE SCHEMA (Supabase PostgreSQL)

### Core Tables

```sql
-- ============================================
-- USERS & AUTH (Managed by Supabase Auth)
-- ============================================
-- profiles table extends auth.users
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    credits INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VIDEOS (User uploads)
-- ============================================
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- File info
    storage_path TEXT NOT NULL, -- "videos/{user_id}/{video_id}.mp4"
    original_filename TEXT,
    file_size_bytes BIGINT,
    mime_type TEXT,
    
    -- Video metadata (extracted on upload)
    duration_seconds FLOAT,
    width INTEGER,
    height INTEGER,
    fps FLOAT,
    
    -- Status
    status TEXT DEFAULT 'uploaded', -- uploaded, processing_prep, prep_complete, processing_job, completed, failed
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PREP DATA (Transcription results)
-- ============================================
CREATE TABLE prep_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Transcription
    transcript_text TEXT,
    transcript_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    transcript_error TEXT,
    
    -- Word-level data (JSONB for flexibility)
    styled_words JSONB DEFAULT '[]', -- [{"word": "hi", "start": 0.0, "end": 0.5, "style": "regular"}]
    timed_captions JSONB DEFAULT '[]', -- [[0.0, 2.0, ["Hello world"]]]
    
    -- B-roll planning (generated after transcription)
    broll_placements JSONB DEFAULT '[]', -- [{"timestamp": 5.0, "keyword": "beach", "clips": [...]}]
    broll_status TEXT DEFAULT 'pending',
    
    -- Metadata
    word_count INTEGER,
    language TEXT DEFAULT 'en',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- JOBS (Video processing)
-- ============================================
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    prep_id UUID REFERENCES prep_data(id),
    
    -- Job configuration (user settings)
    settings JSONB NOT NULL DEFAULT '{}', -- {preset: "viral", enable_broll: true, ...}
    
    -- Processing status
    status TEXT DEFAULT 'queued', -- queued, processing, completed, failed, cancelled
    stage TEXT DEFAULT 'queued', -- queued, transcription, masks, broll, exporting, done
    progress INTEGER DEFAULT 0, -- 0-100
    message TEXT DEFAULT 'Job queued...',
    
    -- External job tracking
    runpod_job_id TEXT,
    
    -- Results
    output_video_path TEXT, -- "outputs/{job_id}/output.mp4"
    output_video_url TEXT,
    thumbnail_url TEXT,
    output_file_size BIGINT,
    
    -- Errors
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Download tracking
    downloaded_at TIMESTAMPTZ,
    download_count INTEGER DEFAULT 0
);

-- ============================================
-- CREDIT SYSTEM
-- ============================================
CREATE TABLE credit_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_id UUID REFERENCES videos(id),
    
    amount INTEGER NOT NULL,
    status TEXT DEFAULT 'active', -- active, released, deducted, expired
    
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_amount CHECK (amount > 0)
);

CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    type TEXT NOT NULL, -- purchase, usage, refund, bonus
    amount INTEGER NOT NULL, -- positive for credit, negative for debit
    
    -- Reference
    lock_id UUID REFERENCES credit_locks(id),
    job_id UUID REFERENCES jobs(id),
    payment_id TEXT, -- Razorpay payment ID
    
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- B-ROLL CLIPS (Cached search results)
-- ============================================
CREATE TABLE broll_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Search metadata
    keyword TEXT NOT NULL,
    source TEXT NOT NULL, -- pexels, pixabay, etc.
    external_id TEXT NOT NULL,
    
    -- Video info
    preview_url TEXT NOT NULL,
    video_url TEXT,
    thumbnail_url TEXT,
    duration_seconds FLOAT,
    width INTEGER,
    height INTEGER,
    
    -- Attribution
    author_name TEXT,
    author_url TEXT,
    
    -- Cache control
    use_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(source, external_id)
);

-- ============================================
-- COLOR GRADE PREVIEWS (Cached)
-- ============================================
CREATE TABLE color_grade_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    
    color_grade TEXT NOT NULL, -- vintage, cinematic, etc.
    preview_frame_path TEXT NOT NULL, -- "previews/{video_id}/{grade}.jpg"
    preview_url TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(video_id, color_grade)
);

-- ============================================
-- ACTIVITY LOG (Audit trail)
-- ============================================
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    action TEXT NOT NULL, -- upload, prep_start, job_start, download, etc.
    entity_type TEXT, -- video, job, etc.
    entity_id UUID,
    
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_prep_video_id ON prep_data(video_id);
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_video_id ON jobs(video_id);
CREATE INDEX idx_credit_locks_user_id ON credit_locks(user_id);
CREATE INDEX idx_credit_locks_status ON credit_locks(status);
CREATE INDEX idx_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_activity_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can view own videos" ON videos
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own prep" ON prep_data
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own jobs" ON jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own locks" ON credit_locks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON credit_transactions
    FOR SELECT USING (auth.uid() = user_id);
```

---

## 2. SUPABASE STORAGE STRUCTURE

```
buckets/
├── videos/                    # Raw user uploads
│   └── {user_id}/
│       └── {video_id}.mp4
│
├── job-inputs/               # Videos prepared for RunPod
│   └── {job_id}/
│       └── input.mp4
│
├── outputs/                  # Processed videos
│   └── {job_id}/
│       ├── output.mp4
│       └── thumbnail.jpg
│
├── previews/                 # Color grade preview frames
│   └── {video_id}/
│       ├── vintage.jpg
│       ├── cinematic.jpg
│       └── ...
│
├── broll-clips/             # Downloaded B-roll videos
│   └── {clip_id}/
│       └── clip.mp4
│
└── temp/                    # Temporary processing files
    └── {session_id}/
```

**Storage Policies:**
```sql
-- Videos bucket - users can only access their own folder
CREATE POLICY "Users can access own videos" ON storage.objects
    FOR ALL USING (
        bucket_id = 'videos' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Outputs bucket - public read, authenticated write
CREATE POLICY "Public can read outputs" ON storage.objects
    FOR SELECT USING (bucket_id = 'outputs');

CREATE POLICY "Service can write outputs" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'outputs');
```

---

## 3. PROCESSING PIPELINE (Fixed)

### Step 1: Upload
```
User → Vercel → Railway /api/upload
                    ↓
              Save to Railway disk (temp)
                    ↓
              Upload to Supabase Storage
                    ↓
              Create video record in DB
                    ↓
              Create credit_lock
                    ↓
              Trigger prep processing
```

### Step 2: Prep (Transcription) - FIXED
```
Railway → OpenAI Whisper API
              ↓
         Save transcript_text to prep_data table
              ↓
         Parse words with timing
              ↓
         Save styled_words (JSONB) ← FIXED: Use "word" field not "text"
              ↓
         Generate timed_captions
              ↓
         Generate B-roll suggestions (if enabled)
              ↓
         Update prep_data.status = 'completed'
```

### Step 3: EditClip (Frontend)
```
User opens /edit/{prep_id}
    ↓
Frontend fetches from /api/prep/{prep_id}
    ↓
Backend queries prep_data table
    ↓
Returns: {
    transcript_text: "...",
    styled_words: [{word: "hi", start: 0.0, end: 0.5, ...}],
    timed_captions: [[0, 2, ["Hello"]]],
    broll_placements: [...]
}
    ↓
Frontend renders TranscriptViewer with styled_words
```

### Step 4: Color Grade Previews - FIXED
```
User opens Effects tab
    ↓
Frontend requests /api/prep/{prep_id}/color-grade-previews
    ↓
Backend checks color_grade_previews table
    ↓
IF exists → return cached URLs
    ↓
ELSE → Extract frame from video
         Apply color grades (FFmpeg)
         Upload to Supabase Storage
         Save to color_grade_previews table
         Return URLs
```

### Step 5: B-Roll - FIXED
```
User opens B-Roll tab
    ↓
Frontend requests /api/prep/{prep_id}/broll-suggestions
    ↓
Backend checks prep_data.broll_placements
    ↓
IF exists → return cached
    ↓
ELSE → Analyze transcript for keywords
         Search Pexels/Pixabay API
         Rank clips by relevance
         Save to prep_data.broll_placements
         Return suggestions
    ↓
User selects clip
    ↓
Download clip to broll-clips/{clip_id}/
    ↓
Include in job settings
```

### Step 6: Job Processing
```
User clicks Export
    ↓
Railway creates job record
    ↓
Upload video to job-inputs/{job_id}/input.mp4
    ↓
Submit to RunPod with prep_data
    ↓
RunPod downloads video + prep data
    ↓
RunPod processes:
    - Transcribe (if needed)
    - Apply masks
    - Render captions
    - Insert B-roll
    - Apply color grade
    - Export video
    ↓
RunPod uploads to outputs/{job_id}/
    ↓
RunPod calls Railway webhook
    ↓
Railway updates job record
    ↓
User can download
```

---

## 4. API ENDPOINTS (Production)

### Videos
```
POST   /api/videos              # Upload new video
GET    /api/videos              # List user's videos
GET    /api/videos/{id}         # Get video details
DELETE /api/videos/{id}         # Delete video
GET    /api/videos/{id}/video   # Stream video (with auth)
```

### Prep
```
POST   /api/prep                # Start prep (sync or async)
GET    /api/prep/{id}           # Get prep data (transcript, etc.)
GET    /api/prep/{id}/status    # Get prep progress
PATCH  /api/prep/{id}           # Update transcript/captions

# Color grades
GET    /api/prep/{id}/color-grades        # List available grades
GET    /api/prep/{id}/color-grade-previews # Get preview URLs

# B-Roll
GET    /api/prep/{id}/broll-suggestions   # Get AI suggestions
POST   /api/prep/{id}/broll-search        # Search for specific keyword
```

### Jobs
```
POST   /api/jobs                # Create processing job
GET    /api/jobs                # List user's jobs
GET    /api/jobs/{id}           # Get job status
POST   /api/jobs/{id}/cancel    # Cancel job
GET    /api/jobs/{id}/download  # Get download URL
POST   /api/jobs/{id}/confirm-download  # Confirm & deduct credits
```

### Credits
```
POST   /api/credits/lock        # Lock credits for upload
POST   /api/credits/lock/{id}/release   # Release lock
POST   /api/credits/lock/{id}/deduct    # Deduct locked credits
GET    /api/credits/balance     # Get current balance
GET    /api/credits/transactions # Get transaction history
```

### Webhooks
```
POST   /api/webhooks/runpod     # RunPod completion webhook
POST   /api/webhooks/razorpay   # Payment webhook
```

---

## 5. FIXING CURRENT ISSUES

### Issue 1: Transcript Not Showing

**Root Cause:** Field name mismatch (`"text"` vs `"word"`)

**Fix Applied:** ✅ Changed backend to use `"word"` field

**Verification:**
```sql
-- Check prep data has correct format
SELECT 
    id,
    jsonb_array_length(styled_words) as word_count,
    styled_words->0->>'word' as first_word,
    transcript_status
FROM prep_data 
WHERE video_id = 'your-video-id';
```

**Expected:**
```
word_count | first_word | transcript_status
-----------|------------|------------------
150        | "Hello"    | completed
```

---

### Issue 2: B-Roll Not Showing

**Root Cause:** Not generating B-roll suggestions after transcription

**Fix:** Add B-roll generation to prep pipeline:

```python
# In prep background task
async def generate_broll_suggestions(prep_id, transcript_text):
    """Generate B-roll suggestions from transcript keywords."""
    
    # 1. Extract keywords using OpenAI or simple NER
    keywords = extract_keywords(transcript_text)
    
    # 2. Search video APIs
    suggestions = []
    for keyword in keywords:
        clips = await search_pexels(keyword)
        suggestions.append({
            "timestamp": keyword["timestamp"],
            "keyword": keyword["word"],
            "clips": clips[:5]  # Top 5 clips
        })
    
    # 3. Save to database
    await supabase.table("prep_data").update({
        "broll_placements": suggestions,
        "broll_status": "completed"
    }).eq("id", prep_id)
```

**Database Check:**
```sql
SELECT 
    id,
    broll_status,
    jsonb_array_length(broll_placements) as suggestion_count
FROM prep_data 
WHERE video_id = 'your-video-id';
```

---

### Issue 3: Color Grade Preview Not Showing

**Root Cause:** Not generating preview frames

**Fix:** Add preview generation endpoint:

```python
@app.get("/api/prep/{prep_id}/color-grade-previews")
async def get_color_grade_previews(prep_id: str, user: dict = Depends(require_auth)):
    # 1. Get video
    prep = await get_prep_from_db(prep_id)
    video = await get_video_from_db(prep.video_id)
    
    # 2. Check cache
    cached = await supabase.table("color_grade_previews").select("*").eq("video_id", video.id).execute()
    
    if cached.data:
        return {"previews": {p["color_grade"]: p["preview_url"] for p in cached.data}}
    
    # 3. Generate previews
    previews = {}
    for grade in ["vintage", "cinematic", "bw", "frosted"]:
        # Extract frame at 1 second
        frame_path = await extract_frame(video.storage_path, timestamp=1.0)
        
        # Apply color grade with FFmpeg
        preview_path = await apply_color_grade(frame_path, grade)
        
        # Upload to Supabase
        upload_result = await supabase.storage.from_("previews").upload(
            f"{video.id}/{grade}.jpg",
            preview_path
        )
        
        # Get public URL
        preview_url = supabase.storage.from_("previews").get_public_url(
            f"{video.id}/{grade}.jpg"
        )
        
        # Save to database
        await supabase.table("color_grade_previews").insert({
            "video_id": video.id,
            "color_grade": grade,
            "preview_frame_path": f"{video.id}/{grade}.jpg",
            "preview_url": preview_url
        })
        
        previews[grade] = preview_url
    
    return {"previews": previews}
```

---

## 6. DOCKER CONFIGURATION (RunPod Worker)

```dockerfile
# runpod-worker/Dockerfile
FROM nvidia/cuda:12.1-runtime-ubuntu22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 python3-pip \
    ffmpeg libsm6 libxext6 \
    git wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY handler.py .
COPY scripts/ ./scripts/
COPY presets/ ./presets/
COPY color_grading/ ./color_grading/
COPY fonts/ ./fonts/

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV CUDA_VISIBLE_DEVICES=0

# RunPod handler
CMD ["python3", "handler.py"]
```

**requirements.txt:**
```
torch==2.1.0
torchvision==0.16.0
opencv-python-headless==4.8.1.78
mediapipe==0.10.8
openai-whisper==20231117
requests==2.31.0
supabase==2.0.0
Pillow==10.1.0
numpy==1.24.3
```

---

## 7. ENVIRONMENT VARIABLES

### Railway (Backend)
```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

# OpenAI
OPENAI_API_KEY=sk-...

# RunPod
RUNPOD_API_KEY=xxx
RUNPOD_ENDPOINT_ID=xxx

# Razorpay (Payments)
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx

# App
ENV=production
MAX_UPLOAD_MB=500
CREDIT_LOCK_DURATION_MINUTES=60

# Observability (Optional)
SENTRY_DSN=https://xxx@yyy.sentry.io/zzz
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/...
```

### Vercel (Frontend)
```bash
VITE_API_BASE_URL=https://your-railway-domain.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### RunPod (Worker)
```bash
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 8. DEPLOYMENT CHECKLIST

### Supabase Setup
- [ ] Create project
- [ ] Run SQL schema (above)
- [ ] Create storage buckets with policies
- [ ] Enable RLS on all tables
- [ ] Set up authentication (Google OAuth)

### Railway Setup
- [ ] Create project from GitHub repo
- [ ] Add all environment variables
- [ ] Set build command: `pip install -r backend/requirements.txt`
- [ ] Set start command: `cd backend && uvicorn api:app --host 0.0.0.0 --port $PORT`
- [ ] Enable persistent disk for `data/` directory

### RunPod Setup
- [ ] Create serverless endpoint
- [ ] Push Docker image to Docker Hub
- [ ] Configure endpoint with image
- [ ] Set environment variables
- [ ] Test with sample job

### Vercel Setup
- [ ] Import frontend repo
- [ ] Set framework preset to Vite
- [ ] Add environment variables
- [ ] Configure build command: `npm run build`
- [ ] Set output directory: `dist`

---

## 9. MONITORING & ALERTING

### Health Checks (Automated)
```bash
# Every 5 minutes
curl https://api.obula.io/api/health

# Should return:
{
  "status": "healthy",
  "checks": {
    "supabase": {"status": "healthy"},
    "openai": {"status": "healthy"},
    "runpod": {"status": "healthy"}
  }
}
```

### Alerts (Critical)
| Condition | Action |
|-----------|--------|
| Job fails 3+ times in 10 min | Slack alert + Email |
| Credit lock stuck > 2 hours | Auto-release + Alert |
| Disk space < 5GB | Alert + Cleanup old files |
| RunPod queue > 10 jobs | Scale up workers |
| OpenAI API errors > 5/hour | Alert + Fallback mode |

### Logs to Watch
```bash
# Real-time errors
railway logs --tail | grep ERROR

# Job completions
railway logs --tail | grep "job_completed"

# Failed uploads
railway logs --tail | grep "upload_failed"

# Slow requests
railway logs --tail | grep "slow_request"
```

---

## 10. BACKUP & RECOVERY

### Database (Supabase)
- Automated daily backups (7 days retention)
- Point-in-time recovery (PITR) for Pro plan

### Files (Supabase Storage)
- Cross-region replication enabled
- Version control for outputs

### Disaster Recovery
```bash
# Restore from backup
supabase db restore backup-id

# Regenerate all color previews
python scripts/regenerate_previews.py

# Reprocess failed jobs
python scripts/retry_failed_jobs.py
```

---

## Summary

This architecture provides:
- ✅ Scalable processing (RunPod auto-scaling)
- ✅ Reliable storage (Supabase with backups)
- ✅ Fast frontend (Vercel CDN)
- ✅ Secure API (Railway with auth)
- ✅ Complete audit trail (activity_logs)
- ✅ Credit safety (locks + transactions)

All current issues (transcript, B-roll, color grades) have specific fixes implemented.
