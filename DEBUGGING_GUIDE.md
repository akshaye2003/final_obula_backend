# Obula Complete Debugging Guide

## Pipeline Architecture

```
┌─────────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   USER      │────▶│ FRONTEND │────▶│  RAILWAY │────▶│ OPENAI   │
│  (Browser)  │◄────│ (Vercel) │◄────│ (Backend)│◄────│(Whisper) │
└─────────────┘     └──────────┘     └────┬─────┘     └──────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │   SUPABASE   │
                                   │  (DB/Storage)│
                                   └──────────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │   RUNPOD     │
                                   │ (GPU Worker) │
                                   └──────────────┘
```

---

## Stage 1: Frontend Upload

### Flow
User selects video → Frontend validates → Uploads to Railway `/api/upload`

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `CORS error` | Railway/Vercel | Browser console shows CORS blocked | Check `allow_origins` in `api.py` includes Vercel domain |
| `413 Payload Too Large` | Railway | Upload fails immediately | Check Railway/Vercel max body size limits |
| `Network Error` | Network/Vercel | Request never reaches backend | Check Vercel function timeout (max 60s for uploads) |
| `JWT verification failed` | Railway/Supabase | 401 Unauthorized | Check `SUPABASE_JWT_SECRET` env var |
| `Credit lock failed` | Railway/Supabase | 402 Payment Required | Check Supabase `credit_locks` table & RLS policies |

### Debug Commands
```bash
# Check if Railway is receiving requests
railway logs --tail

# Check CORS configuration
curl -H "Origin: https://your-vercel-domain.com" \
     -H "Access-Control-Request-Method: POST" \
     -I https://your-railway-domain/api/upload
```

---

## Stage 2: Credit Lock System

### Flow
Upload starts → Check credits → Create lock in Supabase → Proceed

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `Cannot acquire lock` | Supabase/RLS | 402 with "insufficient credits" | Check `profiles.credits` column, verify `check_and_lock_credits` RPC |
| `Lock expired during upload` | Railway/Time | Upload takes too long, lock times out | Check `CREDIT_LOCK_DURATION_MINUTES` env var |
| `RLS policy violation` | Supabase | 403 or silent failure | Test Supabase RLS: `SELECT * FROM credit_locks WHERE user_id = 'xxx'` |
| `Duplicate lock` | Supabase | Multiple locks for same user | Check for stuck locks: `SELECT * FROM credit_locks WHERE status = 'active'` |

### Debug SQL (Supabase SQL Editor)
```sql
-- Check user's credits
SELECT credits FROM profiles WHERE id = 'user-uuid';

-- Check active locks for user
SELECT * FROM credit_locks 
WHERE user_id = 'user-uuid' 
AND status = 'active' 
AND expires_at > now();

-- Check for stuck locks
SELECT * FROM credit_locks 
WHERE status = 'active' 
AND expires_at < now();
```

---

## Stage 3: Prep/Transcription (OpenAI Whisper)

### Flow
Video saved → Background thread → OpenAI API → Save `prep.json`

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `transcript_text` is empty | OpenAI/Railway | Prep file exists but no transcript | Check Railway logs for OpenAI API error |
| `styled_words` has `"text"` not `"word"` | Code bug | Transcript shows blank in EditClip | Check `debug_prep` endpoint field names |
| `timed_captions` empty | Code bug | Captions tab empty | Check `prep.json` has `timed_captions` array |
| `Transcription error` | OpenAI | Logs show Whisper API failure | Check `OPENAI_API_KEY`, file size < 25MB |
| Prep file 404 | Railway/Disk | EditClip shows "Prep session not found" | Check `PREP_DIR` path, disk persistence |

### Debug Endpoints
```bash
# Check prep data health
curl https://railway-domain.com/api/prep/{prep_id}/debug \
  -H "Authorization: Bearer TOKEN"

# Response should show:
# - transcript_text_length > 0
# - styled_words has "word" field (not "text")
# - timed_captions count > 0
```

### Railway Logs to Watch
```
[Prep BG] Transcribed 150 words          ← SUCCESS
[Prep BG] Transcription error: ...       ← FAILURE
[DEBUG get_prep] styled_words count=0    ← EMPTY TRANSCRIPT
```

---

## Stage 4: EditClip Loading

### Flow
User navigates to `/edit/{prepId}` → Frontend fetches prep → Displays transcript

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `Prep session not found` | Railway/Disk | 404 on `/api/prep/{id}` | Check `backend/data/prep/` has `.json` file |
| `styled_words` empty | Backend | Words don't appear | Check `prep.json` field is `"word"` not `"text"` |
| `timed_captions` empty | Backend | Captions tab blank | Check backend created captions from transcript |
| `Access denied` | Supabase/Auth | 403 Forbidden | Check prep file `user_id` matches JWT |
| Blank transcript | Frontend/Backend | Words not rendering | Check browser console for `[DEBUG EditClip]` logs |

### Browser Console Debug
Open DevTools → Console:
```javascript
// Should see:
[DEBUG EditClip] Received prep data: {
  styled_words_count: 150,        // Should be > 0
  timed_captions_count: 12,       // Should be > 0
  transcript_text_length: 1234,   // Should be > 0
  raw_keys: ['styled_words', ...] // Should include all fields
}
```

---

## Stage 5: Job Submission (Railway → RunPod)

### Flow
User clicks Export → Railway creates job → Uploads to Supabase → Calls RunPod

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `Job not found` after restart | Railway | Processing shows "failed" immediately | Jobs lost on restart - **FIXED with persistence** |
| `RunPod not configured` | Railway/Env | Job fails at start | Check `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` |
| `Credit lock expired` | Railway/Supabase | 402 on job creation | Lock too old, re-upload to create new lock |
| `Failed to upload to Supabase` | Supabase/Storage | Job fails at 10% progress | Check Supabase storage permissions, bucket exists |
| `Prep file not found` | Railway/Disk | 404 when submitting | Prep was deleted or path wrong |

### Debug Commands
```bash
# Check job in Railway memory
railway run python -c "
import json
from backend.api import JOBS
print(json.dumps(JOBS.get('job-id', {}), indent=2))
"

# Check jobs.json persistence
cat backend/data/jobs.json | jq '.["job-id"]'
```

### Key Log Patterns
```
[Job xxx] ERROR: RunPod not configured              ← Missing env vars
[Job xxx] Submitted to RunPod: runpod-job-id        ← SUCCESS
[Job xxx] ERROR: ...                                ← RunPod/Supabase failure
```

---

## Stage 6: RunPod GPU Processing

### Flow
RunPod downloads video → Processes (cv2, mediapipe, whisper) → Uploads result → Calls webhook

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `Out of Memory` | RunPod/GPU | Job fails mid-processing | Reduce video resolution, check RunPod GPU memory |
| `Module not found` | Docker/RunPod | Import error in handler | Check Docker image has all dependencies |
| `Download failed` | RunPod/Supabase | Can't fetch video | Check video_url is publicly accessible |
| `Upload failed` | RunPod/Supabase | Processing completes but no output | Check Supabase storage permissions |
| `cv2.error` | OpenCV/RunPod | Video codec issues | Check input video format (H.264 recommended) |
| Webhook timeout | RunPod/Railway | Job done but status stuck | Check Railway can receive webhook from RunPod |

### RunPod Debugging
```bash
# Check RunPod job logs (via RunPod dashboard or CLI)
runpodctl get pod {pod-id}
runpodctl logs {pod-id}

# Test handler locally
cd runpod-worker
docker build -t obula-worker .
docker run -e OPENAI_API_KEY=xxx obula-worker
```

### Key Log Patterns in RunPod
```
[INFO] Downloaded video: input.mp4
[INFO] Processing with Pipeline...
[ERROR] Failed to load video                        ← cv2 can't read video
[INFO] Uploaded result to Supabase                   ← SUCCESS
[INFO] Webhook called: 200                          ← SUCCESS
```

---

## Stage 7: Webhook Response

### Flow
RunPod finishes → POST to `/api/webhooks/runpod` → Railway updates job status

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `Job not found` | Railway | Webhook 404 | Job was lost (restart before persistence fix) |
| `Invalid signature` | Railway/Security | Webhook rejected | Check webhook secret/authentication |
| `Webhook timeout` | Railway/RunPod | RunPod retries webhook | Railway function timeout (check Vercel/Railway limits) |
| `video_url is None` | RunPod/Supabase | Webhook received but no URL | RunPod failed to upload output |

### Debug Webhook
```bash
# Test webhook manually
curl -X POST https://railway-domain.com/api/webhooks/runpod \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "xxx",
    "success": true,
    "video_url": "https://...",
    "thumbnail_url": "https://..."
  }'
```

---

## Stage 8: Download/Confirmation

### Flow
User clicks Download → Frontend calls `/confirm-download` → Credits deducted

### Possible Errors

| Error | Source | Symptoms | Debug Steps |
|-------|--------|----------|-------------|
| `Video not ready` | Railway | 400 when downloading | Job not completed yet |
| `Credit lock mismatch` | Railway/Supabase | 400 on download | Job's lock_id doesn't match current lock |
| `Credit deduction failed` | Supabase | Download works but credits unchanged | Check `deduct_locked_credits` RPC, RLS policies |
| `URL expired` | Supabase | Video was processed but download fails | Supabase signed URL expired, regenerate |

---

## Quick Diagnostic Commands

### Frontend (Browser Console)
```javascript
// Check if prep data is loading correctly
fetch(`/api/prep/${prepId}`, {headers: {Authorization: `Bearer ${token}`}})
  .then(r => r.json())
  .then(d => console.log('Prep fields:', Object.keys(d), 'Words:', d.styled_words?.length))

// Check job status
fetch(`/api/jobs/${jobId}`, {headers: {Authorization: `Bearer ${token}`}})
  .then(r => r.json())
  .then(d => console.log('Job:', d.status, d.progress, d.message))
```

### Backend (Railway CLI)
```bash
# Check recent errors
railway logs --tail 100 | grep ERROR

# Check prep file exists
railway run ls -la backend/data/prep/

# Check jobs persistence
railway run cat backend/data/jobs.json | head -50

# Check environment variables
railway variables
```

### Supabase (SQL Editor)
```sql
-- User credit status
SELECT id, credits FROM profiles WHERE id = 'user-uuid';

-- Active credit locks
SELECT * FROM credit_locks 
WHERE user_id = 'user-uuid' 
AND status = 'active';

-- Credit transactions history
SELECT * FROM credit_transactions 
WHERE user_id = 'user-uuid' 
ORDER BY created_at DESC 
LIMIT 10;
```

### RunPod (Dashboard)
1. Go to RunPod dashboard → Serverless
2. Find your endpoint
3. Check "Recent Jobs" for errors
4. Click on failed job to see logs

---

## Error Matrix by Component

| Component | Common Errors | Logs Location |
|-----------|---------------|---------------|
| **Vercel** | Function timeout, CORS, 413 Payload | Vercel Dashboard → Functions |
| **Railway** | Job lost, Import errors, Env vars | Railway Dashboard → Logs |
| **RunPod** | OOM, CUDA errors, Docker build | RunPod Dashboard → Jobs |
| **Supabase** | RLS violations, RPC failures | Supabase Dashboard → Logs |
| **OpenAI** | Rate limits, API errors | Railway logs (grep "OpenAI") |
| **Docker** | Build failures, Missing deps | Local build or CI logs |

---

## Automated Health Check Script

Create `health_check.py`:

```python
#!/usr/bin/env python3
"""Quick health check for all pipeline components."""

import requests
import os

def check_component(name, url, headers=None):
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            print(f"✅ {name}: OK")
            return True
        else:
            print(f"❌ {name}: HTTP {r.status_code}")
            return False
    except Exception as e:
        print(f"❌ {name}: {e}")
        return False

# Check Railway backend
check_component("Railway Backend", "https://your-railway-domain.com/api/health")

# Check Supabase
check_component("Supabase", os.getenv("SUPABASE_URL", ""))

# Check RunPod endpoint (list endpoints)
headers = {"Authorization": f"Bearer {os.getenv('RUNPOD_API_KEY', '')}"}
check_component("RunPod", "https://api.runpod.ai/v2", headers)

# Check OpenAI
headers = {"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', '')}"}
check_component("OpenAI", "https://api.openai.com/v1/models", headers)
```

---

## Emergency Procedures

### If All Jobs Start Failing
1. Check Railway logs for crash loops
2. Verify all env vars are set: `railway variables`
3. Check Supabase is up: status.supabase.com
4. Check RunPod status: status.runpod.io

### If Transcription Stops Working
1. Check `OPENAI_API_KEY` is valid
2. Check OpenAI usage/billing: platform.openai.com
3. Verify audio files are < 25MB
4. Check Railway logs: `grep -i "transcription error"`

### If Videos Process But Can't Download
1. Check Supabase storage bucket permissions
2. Verify `SUPABASE_SERVICE_ROLE_KEY` has storage access
3. Check signed URL expiration time
4. Test download URL with `curl -I`

### If Frontend Shows Blank Page
1. Check Vercel deployment logs
2. Verify API_BASE_URL points to Railway
3. Check browser console for JS errors
4. Test backend health: `curl /api/health`

---

## Contact Points

| Service | Where to Check | Support |
|---------|---------------|---------|
| Railway | railway.app/dashboard | Discord, Email |
| RunPod | runpod.io/console | Discord |
| Supabase | supabase.com/dashboard | Discord, GitHub |
| Vercel | vercel.com/dashboard | Twitter, Email |
| OpenAI | platform.openai.com | Help center |
