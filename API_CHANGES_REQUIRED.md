# Exact API Changes Required

## Overview
This document shows the exact code changes needed in `backend/api.py` to fix B-roll and color grade previews.

---

## Step 1: Add Imports (Top of api.py)

Add these imports after the existing ones (around line 30):

```python
# B-roll and color grade imports (ADD THESE)
from broll_engine import generate_broll_suggestions as generate_broll
from color_grade_previews import (
    generate_color_grade_previews, 
    save_previews_to_database,
    COLOR_GRADES
)
```

---

## Step 2: Replace B-Roll Endpoint (Line ~1162)

**REPLACE** the current `generate_broll_suggestions` function with this:

```python
@app.post("/api/prep/{prep_id}/broll-suggestions")
async def generate_broll_suggestions_endpoint(prep_id: str, user: dict = Depends(require_auth)):
    """Generate B-roll suggestions from transcript keywords."""
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    if not sb_url or not sb_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json"
    }
    
    # Get prep data from database
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}&user_id=eq.{user['id']}",
            headers=headers,
            timeout=5
        )
        
        if not r.ok or not r.json():
            raise HTTPException(status_code=404, detail="Prep not found")
        
        prep = r.json()[0]
        
    except Exception as e:
        print(f"[B-roll] Database error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch prep data")
    
    # Check if already generated and not empty
    if prep.get("broll_status") == "completed" and prep.get("broll_placements"):
        return {
            "broll_placements": prep["broll_placements"],
            "cached": True
        }
    
    # Get transcript data
    transcript = prep.get("transcript_text", "")
    styled_words = prep.get("styled_words", [])
    
    if not transcript:
        return {
            "broll_placements": [],
            "error": "No transcript available",
            "cached": False
        }
    
    # Update status to generating
    try:
        requests.patch(
            f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}",
            headers=headers,
            json={"broll_status": "generating"},
            timeout=5
        )
    except Exception as e:
        print(f"[B-roll] Status update error: {e}")
    
    # Generate suggestions
    try:
        placements = await generate_broll(prep_id, transcript, styled_words)
        
        # Save to database
        requests.patch(
            f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}",
            headers=headers,
            json={
                "broll_placements": placements,
                "broll_status": "completed"
            },
            timeout=5
        )
        
        return {
            "broll_placements": placements,
            "cached": False
        }
        
    except Exception as e:
        # Update status to failed
        requests.patch(
            f"{sb_url}/rest/v1/prep_data?id=eq.{prep_id}",
            headers=headers,
            json={"broll_status": "failed"},
            timeout=5
        )
        print(f"[B-roll] Generation error: {e}")
        raise HTTPException(status_code=500, detail=f"B-roll generation failed: {str(e)}")
```

---

## Step 3: Replace Color Grade Endpoint (Line ~1337)

**REPLACE** the current `get_color_grade_previews` function with this:

```python
@app.get("/api/prep/{prep_id}/color-grade-previews")
async def get_color_grade_previews_endpoint(prep_id: str, user: dict = Depends(require_auth)):
    """Get color grade previews - generates once, caches in Supabase."""
    
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    if not sb_url or not sb_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json"
    }
    
    # Get prep data with video info
    try:
        r = requests.get(
            f"{sb_url}/rest/v1/prep_data?select=*,videos(*)&id=eq.{prep_id}&user_id=eq.{user['id']}",
            headers=headers,
            timeout=5
        )
        
        if not r.ok or not r.json():
            raise HTTPException(status_code=404, detail="Prep not found")
        
        data = r.json()[0]
        
    except Exception as e:
        print(f"[Color Preview] Database error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch prep data")
    
    video = data.get("videos", {})
    video_id = video.get("id")
    storage_path = video.get("storage_path")
    
    if not video_id or not storage_path:
        raise HTTPException(status_code=404, detail="Video not found")
    
    # Check for cached previews in database
    try:
        cached_r = requests.get(
            f"{sb_url}/rest/v1/color_grade_previews?video_id=eq.{video_id}",
            headers=headers,
            timeout=5
        )
        
        if cached_r.ok and cached_r.json():
            previews = {p["color_grade"]: p["public_url"] for p in cached_r.json()}
            return {
                "previews": previews,
                "cached": True
            }
    except Exception as e:
        print(f"[Color Preview] Cache check error: {e}")
    
    # Download video temporarily for processing
    import tempfile
    
    try:
        video_r = requests.get(
            f"{sb_url}/storage/v1/object/videos/{storage_path}",
            headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
            timeout=300
        )
        
        if not video_r.ok:
            raise HTTPException(status_code=500, detail="Failed to download video")
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(video_r.content)
            tmp.flush()
            temp_path = tmp.name
        
        # Generate previews
        previews = await generate_color_grade_previews(
            temp_path,
            video_id,
            sb_url,
            sb_key
        )
        
        # Clean up temp file
        try:
            os.unlink(temp_path)
        except:
            pass
        
        # Save to database
        if previews:
            await save_previews_to_database(video_id, previews, sb_url, sb_key)
        
        return {
            "previews": previews,
            "cached": False
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Color Preview] Generation error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}")
```

---

## Step 4: Add Database Helper Functions

Add these helper functions near the other Supabase helpers (around line 177):

```python
# =============================================================================
# DATABASE HELPERS (ADD THESE)
# =============================================================================

def _get_supabase_headers() -> dict:
    """Get Supabase headers with service role key."""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _fetch_from_supabase(table: str, query: str = None, user_id: str = None) -> list:
    """Fetch data from Supabase table."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    if not sb_url:
        return []
    
    url = f"{sb_url}/rest/v1/{table}"
    if query:
        url += f"?{query}"
    elif user_id:
        url += f"?user_id=eq.{user_id}"
    
    try:
        r = requests.get(url, headers=_get_supabase_headers(), timeout=5)
        return r.json() if r.ok else []
    except Exception as e:
        print(f"[DB] Fetch error from {table}: {e}")
        return []


def _update_supabase(table: str, id: str, data: dict) -> bool:
    """Update record in Supabase table."""
    sb_url = os.environ.get("SUPABASE_URL", "").strip()
    if not sb_url:
        return False
    
    try:
        r = requests.patch(
            f"{sb_url}/rest/v1/{table}?id=eq.{id}",
            headers=_get_supabase_headers(),
            json=data,
            timeout=5
        )
        return r.ok
    except Exception as e:
        print(f"[DB] Update error in {table}: {e}")
        return False
```

---

## Step 5: Environment Variables

Add to your Railway environment variables:

```bash
# B-Roll (REQUIRED for B-roll to work)
PEXELS_API_KEY=your_pexels_api_key_here

# Optional backup
PIXABAY_API_KEY=your_pixabay_api_key_here
```

**Get free API keys:**
- Pexels: https://www.pexels.com/api/ (free, 200 requests/hour)
- Pixabay: https://pixabay.com/api/docs/ (free, 100 requests/minute)

---

## Step 6: Supabase Database Setup

Run this SQL in Supabase SQL Editor:

```sql
-- Create prep_data table if not exists
CREATE TABLE IF NOT EXISTS prep_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL,
    user_id UUID NOT NULL,
    transcript_text TEXT,
    styled_words JSONB DEFAULT '[]',
    timed_captions JSONB DEFAULT '[]',
    broll_placements JSONB DEFAULT '[]',
    broll_status TEXT DEFAULT 'pending',
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
CREATE POLICY "Users can access own prep data" ON prep_data 
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can access own previews" ON color_grade_previews 
    FOR ALL USING (auth.uid() IN (
        SELECT user_id FROM videos WHERE id = color_grade_previews.video_id
    ));

-- Indexes
CREATE INDEX idx_prep_data_user_id ON prep_data(user_id);
CREATE INDEX idx_prep_data_video_id ON prep_data(video_id);
CREATE INDEX idx_color_previews_video_id ON color_grade_previews(video_id);
```

---

## Step 7: Create Supabase Storage Bucket

In Supabase Dashboard:

1. Go to Storage → New Bucket
2. Name: `previews`
3. Check "Public bucket"
4. Click Create

Add this policy to the `previews` bucket:

```sql
-- Allow public read access
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'previews');

-- Allow authenticated uploads
CREATE POLICY "Authenticated Uploads" ON storage.objects
    FOR INSERT TO authenticated 
    WITH CHECK (bucket_id = 'previews');
```

---

## Testing

After making these changes:

1. **Restart Railway backend**
2. **Upload a new video**
3. **Test B-roll**: 
   ```bash
   curl -X POST https://your-api.com/api/prep/{prep_id}/broll-suggestions \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```
4. **Test Color Previews**:
   ```bash
   curl https://your-api.com/api/prep/{prep_id}/color-grade-previews \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

---

## Troubleshooting

### B-roll returns empty array
- Check Pexels API key is set: `echo $PEXELS_API_KEY`
- Check transcript has visual keywords (beach, city, coffee, etc.)
- Check logs for "Found X visual keywords"

### Color previews fail
- Check Supabase Storage bucket "previews" exists
- Check bucket is public
- Check FFmpeg is installed: `ffmpeg -version`

### Database errors
- Check tables exist: `SELECT * FROM prep_data LIMIT 1`
- Check RLS policies allow access
- Check service role key has correct permissions
