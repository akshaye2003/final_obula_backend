# Production Implementation Guide

## Executive Summary

Your current system has **3 broken features** that need fixing:

| Feature | Current Status | Issue | Fix |
|---------|---------------|-------|-----|
| Transcript | ✅ Working | None needed | - |
| B-roll | ❌ Broken | Returns empty array, never generates | Wire up `broll_engine.py` |
| Color Grade Previews | ❌ Broken | Generates on every request, no caching | Add Supabase Storage caching |

---

## Your Production Stack (Correctly Structured)

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL (Frontend)                        │
│                   React 18 + Vite + Tailwind                    │
├─────────────────────────────────────────────────────────────────┤
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RAILWAY (FastAPI Backend)                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   Upload    │  │    Prep     │  │    Jobs     │     │   │
│  │  │  Handler    │  │   Handler   │  │   Handler   │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │   B-roll    │  │   Color     │  │   Health    │     │   │
│  │  │   Engine    │  │   Previews  │  │   Checks    │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SUPABASE (Database + Storage)              │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │  videos  │ │prep_data │ │   jobs   │ │ previews │   │   │
│  │  │   table  │ │  table   │ │   table  │ │  table   │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  │                                                          │   │
│  │  Storage Buckets:                                        │   │
│  │  - videos/ (private)                                     │   │
│  │  - outputs/ (private)                                    │   │
│  │  - previews/ (public)  ← NEW                             │   │
│  │  - broll-clips/ (public)                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              RUNPOD (GPU Workers)                       │   │
│  │         Video Processing Pipeline                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## What The Previous Response Got Wrong

The previous response claimed things were "FIXED" but:

1. ❌ **B-roll module not wired up** - `broll_engine.py` exists but `api.py` doesn't import or use it
2. ❌ **Color previews still use base64** - No Supabase Storage integration
3. ❌ **Still using JSON files** - Database tables were suggested but migration not implemented
4. ❌ **No Pexels API integration** - Required for B-roll to work

---

## Actual Implementation Steps

### Phase 1: Environment Setup (5 minutes)

1. **Get Pexels API Key** (free):
   - Go to https://www.pexels.com/api/
   - Sign up and get API key
   - Add to Railway: `PEXELS_API_KEY=your_key_here`

2. **Create Supabase Storage Bucket**:
   - Go to Supabase Dashboard → Storage
   - Create bucket named "previews"
   - Make it public

### Phase 2: Database Setup (10 minutes)

Run this SQL in Supabase SQL Editor:

```sql
-- Create prep_data table
CREATE TABLE IF NOT EXISTS prep_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transcript_text TEXT,
    styled_words JSONB DEFAULT '[]',
    timed_captions JSONB DEFAULT '[]',
    broll_placements JSONB DEFAULT '[]',
    broll_status TEXT DEFAULT 'pending',
    color_previews_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create color_grade_previews table
CREATE TABLE IF NOT EXISTS color_grade_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL,
    color_grade TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(video_id, color_grade)
);

-- Enable RLS
ALTER TABLE prep_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE color_grade_previews ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users own their prep data" ON prep_data
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their previews" ON color_grade_previews
    FOR ALL USING (video_id IN (
        SELECT id FROM videos WHERE user_id = auth.uid()
    ));

-- Indexes for performance
CREATE INDEX idx_prep_data_user_video ON prep_data(user_id, video_id);
CREATE INDEX idx_color_previews_video ON color_grade_previews(video_id);
```

### Phase 3: Code Changes (20 minutes)

**File: `backend/api.py`**

1. **Add imports** (around line 30):
   ```python
   from broll_engine import generate_broll_suggestions as generate_broll
   from color_grade_previews import generate_color_grade_previews, save_previews_to_database
   ```

2. **Replace B-roll endpoint** (line ~1162):
   - See `API_CHANGES_REQUIRED.md` for complete code

3. **Replace Color Grade endpoint** (line ~1337):
   - See `API_CHANGES_REQUIRED.md` for complete code

### Phase 4: Deploy (5 minutes)

1. Commit changes:
   ```bash
   git add backend/api.py backend/broll_engine.py backend/color_grade_previews.py
   git commit -m "Fix B-roll and color grade previews"
   git push
   ```

2. Railway will auto-deploy

3. Test in browser:
   - Upload video
   - Check B-roll suggestions appear
   - Check color grade previews load

---

## Data Flow (Fixed)

### B-roll Generation Flow

```
1. User uploads video
        ↓
2. Backend creates prep_data in DB
        ↓
3. Frontend calls POST /api/prep/{id}/broll-suggestions
        ↓
4. Backend extracts keywords from transcript
        ↓
5. Backend searches Pexels API for stock videos
        ↓
6. Backend saves results to prep_data.broll_placements
        ↓
7. Frontend displays B-roll clips to user
```

### Color Grade Preview Flow

```
1. Frontend calls GET /api/prep/{id}/color-grade-previews
        ↓
2. Backend checks database for cached previews
        ↓
3. IF cached: Return URLs immediately
   IF not cached:
        ↓
4. Download video from Supabase Storage
        ↓
5. Extract frame using FFmpeg
        ↓
6. Apply each LUT using FFmpeg
        ↓
7. Upload results to Supabase Storage
        ↓
8. Save URLs to color_grade_previews table
        ↓
9. Return URLs to frontend
```

---

## Testing Checklist

### Backend Tests

```bash
# 1. Test B-roll generation
curl -X POST https://your-api.up.railway.app/api/prep/{prep_id}/broll-suggestions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Expected response:
# {
#   "broll_placements": [
#     {
#       "id": "placement_0",
#       "timestamp": 5.2,
#       "keyword": "beach",
#       "clips": [...]
#     }
#   ],
#   "cached": false
# }

# 2. Test color grade previews
curl https://your-api.up.railway.app/api/prep/{prep_id}/color-grade-previews \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected response:
# {
#   "previews": {
#     "original": "https://.../previews/video123/original.jpg",
#     "vintage": "https://.../previews/video123/vintage.jpg",
#     ...
#   },
#   "cached": false
# }
```

### Frontend Tests

1. Upload video → Should complete successfully
2. Wait for transcription → Should show styled words
3. Click "B-roll" tab → Should show clip suggestions
4. Click "Color Grade" tab → Should show preview images
5. Select color grade → Should apply to preview

---

## Migration from File-Based to Database

If you have existing data in JSON files, run this migration:

```python
# migration_script.py
import json
import requests
import os
from pathlib import Path

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

# Migrate prep files
prep_dir = Path("backend/data/prep")
for prep_file in prep_dir.glob("*.json"):
    with open(prep_file) as f:
        data = json.load(f)
    
    # Extract video_id and user_id
    video_id = data.get("video_id")
    user_id = data.get("user_id")
    
    if not video_id or not user_id:
        print(f"Skipping {prep_file} - missing IDs")
        continue
    
    # Insert into database
    db_record = {
        "id": prep_file.stem,  # Use filename as ID
        "video_id": video_id,
        "user_id": user_id,
        "transcript_text": data.get("transcript_text"),
        "styled_words": data.get("styled_words", []),
        "timed_captions": data.get("timed_captions", []),
        "broll_placements": data.get("broll_placements", []),
        "broll_status": "completed" if data.get("broll_placements") else "pending"
    }
    
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/prep_data",
        headers=headers,
        json=db_record
    )
    
    if r.ok:
        print(f"Migrated {prep_file}")
    else:
        print(f"Failed {prep_file}: {r.text}")
```

---

## Common Issues & Solutions

### Issue: B-roll returns empty array

**Causes:**
1. No Pexels API key → Set `PEXELS_API_KEY` in Railway
2. Transcript has no visual keywords → Upload video with visual content
3. API rate limit → Wait 1 hour or upgrade Pexels plan

**Debug:**
```python
# Add to broll_engine.py
print(f"[Debug] Keywords found: {[k['word'] for k in keywords]}")
print(f"[Debug] Pexels API key present: {bool(PEXELS_API_KEY)}")
```

### Issue: Color previews don't generate

**Causes:**
1. FFmpeg not installed → Add to Dockerfile
2. Supabase bucket doesn't exist → Create "previews" bucket
3. RLS policy blocking → Check policies allow insert

**Debug:**
```bash
# Check FFmpeg
railway run ffmpeg -version

# Check bucket exists
curl $SUPABASE_URL/storage/v1/bucket/previews \
  -H "apikey: $SUPABASE_KEY"
```

### Issue: Database connection fails

**Causes:**
1. Wrong Supabase URL → Check format: `https://xxx.supabase.co`
2. Wrong API key → Use service_role key, not anon key
3. RLS blocking → Check policies allow access

---

## Performance Considerations

| Operation | Current | Optimized | Notes |
|-----------|---------|-----------|-------|
| B-roll generation | N/A | ~2-5 seconds | Parallel API calls |
| Color preview (cold) | N/A | ~10-15 seconds | FFmpeg + upload |
| Color preview (hot) | N/A | ~50ms | Database lookup |
| Video upload | Working | Working | Already optimized |

---

## Cost Estimates

### Free Tier Limits

| Service | Free Tier | Your Usage |
|---------|-----------|------------|
| Pexels API | 200 req/hour | ~5 req/video |
| Supabase Storage | 1GB | ~100MB/video |
| Supabase DB | 500MB | Minimal |
| Railway | $5 credit/month | Backend hosting |
| RunPod | Pay per second | Processing only |
| Vercel | 100GB bandwidth | Frontend |

**Estimated Cost:**
- Low usage (< 100 videos/month): **$0-5/month**
- Medium usage (100-1000 videos/month): **$20-50/month**

---

## Next Steps After Fixes

1. ✅ Test B-roll generation
2. ✅ Test color grade previews
3. 🔄 Add more B-roll sources (Pixabay, Unsplash)
4. 🔄 Add preview caching to frontend
5. 🔄 Add B-roll clip preview videos (not just thumbnails)
6. 🔄 Add user feedback on B-roll relevance

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/api.py` | Add imports, replace 2 endpoints |
| `backend/broll_engine.py` | Complete rewrite (functional) |
| `backend/color_grade_previews.py` | Complete rewrite (Supabase integration) |

---

## Support

If issues persist after following this guide:

1. Check Railway logs: `railway logs`
2. Check Supabase logs: Dashboard → Logs
3. Test APIs with curl (see Testing section)
4. Verify environment variables are set
