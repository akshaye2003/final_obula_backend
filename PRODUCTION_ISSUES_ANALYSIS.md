# Production Issues Analysis - Obula Platform

## Current State Assessment

### Your Stack
- **Vercel**: Frontend (React + Vite)
- **Railway**: FastAPI backend
- **RunPod**: GPU workers for video processing
- **Supabase**: PostgreSQL + Storage
- **Docker**: Containerization

---

## 🔴 Critical Issues Found

### Issue 1: B-Roll Always Returns Empty
**Location**: `backend/api.py` line 1175

**Problem**: The endpoint returns empty array because `broll_placements` is never populated:

```python
# Line 1175 - ALWAYS returns empty!
return {"broll_placements": data.get("broll_placements", [])}
```

**Root Cause**: 
- Prep data initializes with `"broll_placements": []` (lines 790, 871, 1007)
- No code actually generates B-roll suggestions
- The `broll_engine.py` module exists but is **NOT imported or used**

**Fix Required**: Wire up B-roll generation in the endpoint

---

### Issue 2: Color Grade Previews Not Cached
**Location**: `backend/api.py` lines 1337-1356

**Problem**: Previews are generated on every request using base64 (inefficient):

```python
# Current: Generates every time, returns base64
def _generate_color_grade_previews(input_video: str) -> dict:
    # Extracts frame + applies LUTs every request!
    return {"vintage": "data:image/jpeg;base64,...", ...}
```

**Issues**:
1. No caching - regenerates on every page load
2. Base64 is slow and memory-intensive
3. No storage in Supabase
4. No database tracking

**Fix Required**: Generate once, upload to Supabase Storage, return URLs

---

### Issue 3: File-Based Storage (Not Database)
**Location**: Throughout `api.py`

**Problem**: Using JSON files instead of database:

```python
# Current: File-based storage
PREP_DIR = DATA_DIR / "prep"
path = PREP_DIR / f"{prep_id}.json"  # Fragile!
```

**Issues**:
1. Files lost on Railway restart (ephemeral filesystem)
2. No concurrency control
3. No backups
4. Can't query across users
5. Race conditions with threading.Lock()

**Fix Required**: Move to Supabase PostgreSQL

---

### Issue 4: In-Memory Job Storage
**Location**: `backend/api.py` lines 1416-1444

**Problem**: Jobs stored in memory dictionary:

```python
JOBS: dict[str, dict] = {}  # Lost on restart!
```

**Fix Required**: Move to Supabase `jobs` table

---

## ✅ What Actually Works

| Feature | Status | Notes |
|---------|--------|-------|
| Video Upload | ✅ | Works with magic bytes validation |
| Transcription | ✅ | Uses OpenAI Whisper correctly |
| Styled Words | ✅ | Correct field name ("word") |
| Job Submission | ✅ | Submits to RunPod correctly |
| Credit System | ✅ | Lock-based system works |
| Auth | ✅ | JWT verification works |

---

## 🏗️ Required Production Architecture

### Database Schema (Supabase)

```sql
-- ============================================
-- 1. VIDEOS TABLE
-- ============================================
CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Storage
    storage_path TEXT NOT NULL, -- "videos/{user_id}/{video_id}.mp4"
    
    -- Metadata
    filename TEXT,
    file_size_bytes BIGINT,
    duration_seconds FLOAT,
    width INTEGER,
    height INTEGER,
    
    -- Status tracking
    status TEXT DEFAULT 'uploaded', 
    -- uploaded → processing_prep → prep_complete → processing_job → completed/failed
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PREP DATA TABLE (Replaces JSON files)
-- ============================================
CREATE TABLE prep_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Transcription (from Whisper)
    transcript_text TEXT,
    styled_words JSONB DEFAULT '[]', -- [{"word": "hi", "start": 0.0, "end": 0.5}]
    timed_captions JSONB DEFAULT '[]', -- [[0.0, 2.0, ["Hello"]]]
    
    -- B-roll (NEW - actually populated!)
    broll_placements JSONB DEFAULT '[]', -- [{"timestamp": 5.0, "keyword": "beach", "clips": [...]}]
    broll_status TEXT DEFAULT 'pending', -- pending → generating → completed/failed
    broll_generated_at TIMESTAMPTZ,
    
    -- Color grade previews (NEW - tracks generated previews)
    color_previews_generated BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. JOBS TABLE (Replaces in-memory JOBS dict)
-- ============================================
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    prep_id UUID REFERENCES prep_data(id),
    
    -- Job settings
    settings JSONB NOT NULL DEFAULT '{}', -- All user-selected options
    
    -- Status tracking
    status TEXT DEFAULT 'queued', -- queued → processing → completed/failed/cancelled
    stage TEXT DEFAULT 'queued', -- More granular: transcribing, generating_masks, etc.
    progress INTEGER DEFAULT 0, -- 0-100
    message TEXT,
    
    -- RunPod tracking
    runpod_job_id TEXT,
    
    -- Output
    output_video_url TEXT,
    thumbnail_url TEXT,
    
    -- Credit tracking
    lock_id UUID,
    credits_deducted BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

-- ============================================
-- 4. COLOR GRADE PREVIEWS TABLE
-- ============================================
CREATE TABLE color_grade_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    color_grade TEXT NOT NULL, -- "vintage", "cinematic", etc.
    
    -- Storage
    storage_path TEXT NOT NULL, -- "previews/{video_id}/{grade}.jpg"
    public_url TEXT, -- Supabase public URL
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(video_id, color_grade)
);

-- Indexes for performance
CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_prep_data_video_id ON prep_data(video_id);
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_runpod_job_id ON jobs(runpod_job_id);
CREATE INDEX idx_color_previews_video_id ON color_grade_previews(video_id);

-- RLS Policies
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE color_grade_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own videos"
    ON videos FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own prep data"
    ON prep_data FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own jobs"
    ON jobs FOR ALL USING (auth.uid() = user_id);
```

---

### Supabase Storage Buckets

```bash
# Create these buckets in Supabase Dashboard:

1. videos/           # User uploads (private)
2. outputs/          # Processed videos (private, signed URLs)
3. previews/         # Color grade previews (public)
4. broll-clips/      # Downloaded B-roll stock footage (public)
5. thumbnails/       # Video thumbnails (public)
```

---

## 🔧 Fixed API Endpoints

### 1. Fixed B-Roll Endpoint

```python
# backend/api.py - REPLACE the current endpoint

from broll_engine import generate_broll_suggestions as generate_broll

@app.post("/api/prep/{prep_id}/broll-suggestions")
async def generate_broll_suggestions(prep_id: str, user: dict = Depends(require_auth)):
    """Generate B-roll suggestions from transcript keywords."""
    
    # Get prep data from DATABASE (not file)
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    r = requests.get(
        f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}&user_id=eq.{user['id']}",
        headers=_sb_headers(),
        timeout=5
    )
    
    if not r.ok or not r.json():
        raise HTTPException(status_code=404, detail="Prep not found")
    
    prep = r.json()[0]
    
    # Check if already generated
    if prep.get("broll_status") == "completed" and prep.get("broll_placements"):
        return {"broll_placements": prep["broll_placements"]}
    
    # Generate suggestions using broll_engine
    transcript = prep.get("transcript_text", "")
    styled_words = prep.get("styled_words", [])
    
    if not transcript:
        return {"broll_placements": [], "error": "No transcript available"}
    
    # Update status to generating
    requests.patch(
        f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}",
        headers=_sb_headers(),
        json={"broll_status": "generating"},
        timeout=5
    )
    
    try:
        # Generate suggestions
        placements = await generate_broll(prep_id, transcript, styled_words)
        
        # Save to database
        requests.patch(
            f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}",
            headers=_sb_headers(),
            json={
                "broll_placements": placements,
                "broll_status": "completed",
                "broll_generated_at": "now()"
            },
            timeout=5
        )
        
        return {"broll_placements": placements}
        
    except Exception as e:
        # Update status to failed
        requests.patch(
            f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}",
            headers=_sb_headers(),
            json={"broll_status": "failed"},
            timeout=5
        )
        raise HTTPException(status_code=500, detail=str(e))
```

### 2. Fixed Color Grade Previews Endpoint

```python
# backend/api.py - REPLACE the current endpoint

from color_grade_previews import generate_color_grade_previews

@app.get("/api/prep/{prep_id}/color-grade-previews")
async def get_color_grade_previews(prep_id: str, user: dict = Depends(require_auth)):
    """Get color grade previews - generates once, caches in Supabase."""
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    # Get prep and video info
    r = requests.get(
        f"{sb_url}/rest/v1/prep_data?select=*,videos(*)&id=eq.{prep_id}&user_id=eq.{user['id']}",
        headers=_sb_headers(),
        timeout=5
    )
    
    if not r.ok or not r.json():
        raise HTTPException(status_code=404, detail="Prep not found")
    
    data = r.json()[0]
    video = data.get("videos", {})
    video_id = video.get("id")
    storage_path = video.get("storage_path")
    
    if not storage_path:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check for cached previews
    cached_r = requests.get(
        f"{sb_url}/rest/v1/color_grade_previews?video_id=eq.{video_id}",
        headers=_sb_headers(),
        timeout=5
    )
    
    if cached_r.ok and cached_r.json():
        previews = {p["color_grade"]: p["public_url"] for p in cached_r.json()}
        return {"previews": previews, "cached": True}
    
    # Download video temporarily for processing
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        video_r = requests.get(
            f"{sb_url}/storage/v1/object/videos/{storage_path}",
            headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
            timeout=300
        )
        if video_r.ok:
            tmp.write(video_r.content)
            tmp.flush()
            
            # Generate previews
            previews = await generate_color_grade_previews(
                tmp.name, 
                video_id, 
                sb_url, 
                sb_key
            )
            
            # Clean up temp file
            os.unlink(tmp.name)
            
            return {"previews": previews, "cached": False}
        else:
            raise HTTPException(status_code=500, detail="Failed to download video")
```

---

## 📋 Implementation Checklist

### Phase 1: Database Migration (Priority: CRITICAL)
- [ ] Run SQL schema in Supabase
- [ ] Create storage buckets
- [ ] Set bucket policies (public/private)
- [ ] Migrate existing JSON files to database

### Phase 2: Backend Updates
- [ ] Add `broll_engine` import to `api.py`
- [ ] Add `color_grade_previews` import to `api.py`
- [ ] Replace file-based prep endpoints with database queries
- [ ] Replace in-memory JOBS with database table
- [ ] Add Pexels API key to Railway environment

### Phase 3: Frontend Updates
- [ ] Update API calls to use new response format
- [ ] Handle B-roll loading states
- [ ] Handle color preview loading states

### Phase 4: Testing
- [ ] Test video upload
- [ ] Test transcription
- [ ] Test B-roll generation
- [ ] Test color grade previews
- [ ] Test full processing pipeline

---

## 🔐 Environment Variables

### Railway Backend
```env
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

# AI/ML
OPENAI_API_KEY=sk-...

# Video Processing (RunPod)
RUNPOD_API_KEY=your-runpod-key
RUNPOD_ENDPOINT_ID=your-endpoint-id

# B-Roll (NEW)
PEXELS_API_KEY=your-pexels-key  # Get from pexels.com/api (free)
PIXABAY_API_KEY=your-pixabay-key  # Optional backup

# App
ENV=production
```

### Vercel Frontend
```env
VITE_API_URL=https://your-railway-app.up.railway.app
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 🚨 Important Notes

1. **Previous "fixes" were incomplete** - The `broll_engine.py` and `color_grade_previews.py` files exist but were never wired into the API.

2. **File-based storage must go** - Railway's filesystem is ephemeral. All data must be in Supabase.

3. **B-roll needs Pexels API key** - Get a free key at pexels.com/api

4. **Color previews need Supabase Storage** - The current base64 approach won't scale.

5. **Test incrementally** - Don't deploy all changes at once. Test each feature separately.
