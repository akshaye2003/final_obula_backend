# Obula Observability & Debugging Guide

This guide explains how to use the comprehensive monitoring system to debug any issue in the pipeline.

---

## Overview

We now have **full observability** across the entire pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                        OBSERVABILITY STACK                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FRONTEND                    BACKEND                    EXTERNAL│
│  ─────────                  ────────                   ─────────│
│  • Console logs            • Structured JSON logs      • Sentry │
│  • Error tracking          • Request ID tracing        • RunPod │
│  • Performance metrics     • Prometheus metrics        • OpenAI│
│  • API timing              • Health checks             • Supabase
│                            • Alert webhooks                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start: Debugging an Issue

### Step 1: Check Health Endpoint
```bash
curl https://your-railway-domain.com/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1709912345.123,
  "checks": {
    "supabase": {"status": "healthy", "duration_ms": 45},
    "openai": {"status": "healthy", "duration_ms": 234},
    "runpod": {"status": "healthy", "duration_ms": 567},
    "disk_space": {"status": "healthy", "free_gb": 12.5}
  },
  "metrics": {
    "counters": {
      "http_requests_total": 1523,
      "uploads_completed": 45
    }
  }
}
```

If any check shows `"unhealthy"`, that's your issue.

---

### Step 2: Check Metrics
```bash
curl https://your-railway-domain.com/api/metrics
```

**Example output:**
```
# Counters
http_requests_total{method="POST",path="/api/upload",status="200"} 45
http_requests_total{method="POST",path="/api/upload",status="413"} 3
uploads_completed 42
uploads_failed{reason="too_large"} 3

# Gauges
active_jobs 5
prep_jobs_in_progress 2

# Timings (ms)
http_request_duration_ms_count 1523
http_request_duration_ms_sum 45678.5
http_request_duration_ms_avg 29.99
http_request_duration_ms_p95 125.3
```

---

### Step 3: View Logs (Railway)
```bash
# Watch real-time logs
railway logs --tail

# Filter for errors only
railway logs --tail | grep ERROR

# Filter for specific job
railway logs --tail | grep "job_id=abc-123"

# Filter for uploads
railway logs --tail | grep upload
```

**Log Format:**
```json
{
  "timestamp": 1709912345.123,
  "level": "INFO",
  "logger": "obula",
  "message": "upload_completed",
  "request_id": "abc-123",
  "user_id": "user-456",
  "video_id": "vid-789",
  "size_mb": 45.2,
  "duration_ms": 2345
}
```

---

## Debugging Specific Issues

### Issue: Upload Fails

**Check logs:**
```bash
railway logs --tail | grep upload
```

**Look for:**
- `upload_invalid_extension` - Wrong file type
- `upload_invalid_magic_bytes` - File content doesn't match extension
- `upload_too_large` - File exceeds 500MB limit
- `upload_exception` - Server error

**Check metrics:**
```bash
curl /api/metrics | grep uploads_failed
```

---

### Issue: Transcript Not Showing

**1. Check prep debug endpoint:**
```bash
curl https://railway-domain.com/api/prep/{prep_id}/debug \
  -H "Authorization: Bearer TOKEN"
```

**Expected:**
```json
{
  "prep_id": "xxx",
  "styled_words_stats": {
    "count": 150,
    "has_word_field": true,
    "first_3_words": ["Hello", "this", "is"]
  },
  "timed_captions_stats": {
    "count": 12
  }
}
```

**2. Check OpenAI status:**
```bash
curl /api/health | jq '.checks.openai'
```

**3. Check logs:**
```bash
railway logs | grep -E "(prep_background|transcription)"
```

---

### Issue: Job Shows "Processing Failed"

**1. Check job status:**
```bash
curl https://railway-domain.com/api/jobs/{job_id} \
  -H "Authorization: Bearer TOKEN"
```

**2. Check logs:**
```bash
railway logs | grep "job_id=xxx"
```

**Common patterns:**
- `RunPod not configured` - Missing env vars
- `Supabase upload error` - Storage permission issue
- `GPU processing failed` - RunPod error

**3. Check RunPod dashboard:**
- Go to runpod.io/console
- Find your endpoint
- Check "Recent Jobs" for the specific error

---

### Issue: Frontend Shows Blank Page

**Browser Console:**
```javascript
// Check if logger is working
logger.info('test', {foo: 'bar'})

// Check request ID
getApiRequestId()

// Check performance
performance.getEntriesByType('navigation')
```

**Network Tab:**
- Look for failed requests (4xx/5xx)
- Check response times
- Verify CORS headers

---

## Advanced Debugging

### Trace a Request Through the System

Every request gets a unique ID:

```javascript
// Frontend - automatically added to fetch
fetch('/api/upload', {
  headers: {
    'X-Request-ID': 'auto-generated'
  }
})
```

```bash
# Backend - logs include request_id
railway logs | grep "request_id=abc-123"
```

**Example trace:**
```
[FRONTEND] request_started  request_id=abc-123
[FRONTEND] upload_started   request_id=abc-123
[BACKEND]  request_started  request_id=abc-123, path=/api/upload
[BACKEND]  upload_completed request_id=abc-123, video_id=vid-456
[BACKEND]  prep_background_started request_id=abc-123, prep_id=prep-789
[BACKEND]  prep_background_completed request_id=abc-123, word_count=150
[FRONTEND] user_action      request_id=abc-123, action=export_clicked
[BACKEND]  job_creation_started request_id=abc-123, job_id=job-000
[BACKEND]  job_completed    request_id=abc-123, duration_ms=45000
```

---

### Performance Profiling

**Frontend:**
```javascript
// Automatically tracked
// - Page load metrics
// - Long tasks (>50ms)
// - Slow renders (>100ms)
// - API request timing

// View in console
logger.info('page_load_metrics', {
  domContentLoaded: 234,
  loadComplete: 567,
  ttfb: 45,
  fcp: 123
})
```

**Backend:**
```bash
# View timing metrics
curl /api/metrics | grep duration_ms
```

---

### Error Tracking

**All errors are captured:**

1. **Frontend JS errors** → Reported to `/api/errors/report`
2. **API failures** → Logged with request context
3. **Backend exceptions** → Sent to Sentry + logged
4. **RunPod failures** → Webhook reports back

**To view errors:**
```bash
# Recent errors
railway logs | grep ERROR

# Specific error type
railway logs | grep "error_type=KeyError"

# Frontend errors
railway logs | grep "FRONTEND_ERROR"
```

---

## Environment Variables

### Required for Basic Observability
```bash
# Already set (no action needed)
RAILWAY_PUBLIC_DOMAIN=xxx
RAILWAY_ENVIRONMENT_NAME=production
```

### Optional: Sentry Error Tracking
```bash
SENTRY_DSN=https://xxx@yyy.sentry.io/zzz
```

### Optional: Alert Webhooks
```bash
ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/xxx
ALERT_DISCORD_WEBHOOK=https://discord.com/api/webhooks/xxx
```

---

## Debugging Commands Reference

### Railway
```bash
# View logs
railway logs --tail
railway logs --tail 1000

# View specific service
railway logs -s backend

# Shell access
railway run bash

# Check environment
railway variables

# Check disk usage
railway run df -h
```

### Supabase
```bash
# Check credit locks
curl -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/credit_locks?status=eq.active"

# Check user credits
curl -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/profiles?id=eq.$USER_ID&select=credits"
```

### RunPod
```bash
# Check endpoint status
curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
  "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID"

# Check job status
curl -H "Authorization: Bearer $RUNPOD_API_KEY" \
  "https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/status/$JOB_ID"
```

### Local Testing
```bash
# Test health
curl http://localhost:8000/api/health

# Test metrics
curl http://localhost:8000/api/metrics

# Test upload
curl -X POST -F "file=@test.mp4" \
  http://localhost:8000/api/upload \
  -H "Authorization: Bearer $TOKEN"
```

---

## Common Error Patterns

### Pattern 1: Job Not Found (404)
```
[ERROR] job_creation_failed
  error: Credit lock expired
  
[ERROR] request_failed
  path: /api/jobs/xxx
  status: 404
```

**Fix:** Re-upload video to create new lock

---

### Pattern 2: Transcription Empty
```
[ERROR] prep_background_failed
  error_type: APIError
  error: OpenAI API rate limit exceeded
```

**Fix:** Check OpenAI usage/billing

---

### Pattern 3: RunPod Failure
```
[INFO] job_creation_started
[ERROR] job_failed
  error_type: Exception
  error: GPU processing failed: Out of memory
```

**Fix:** Video too large for GPU, reduce resolution

---

### Pattern 4: Frontend API Error
```
[FRONTEND] api_request_failed
  url: /api/prep/xxx
  error: Network Error
  
[BACKEND] request_completed
  path: /api/prep/xxx
  status: 200
```

**Fix:** CORS issue or network timeout

---

## Dashboards

### Railway Dashboard
URL: https://railway.app/project/xxx
- View logs
- Metrics (CPU, memory, disk)
- Deployments
- Environment variables

### RunPod Dashboard  
URL: https://www.runpod.io/console/serverless
- Endpoint status
- Recent jobs
- GPU utilization
- Error logs

### Supabase Dashboard
URL: https://app.supabase.com/project/xxx
- Database tables
- Auth users
- Storage buckets
- Edge functions

### Sentry Dashboard (if configured)
URL: https://xxx.sentry.io
- Error trends
- Performance issues
- Release tracking

---

## Alerting Setup

### Slack Alerts
1. Create webhook: https://api.slack.com/messaging/webhooks
2. Set env var: `ALERT_SLACK_WEBHOOK=https://hooks.slack.com/services/...`
3. Alerts automatically sent for job failures

### Discord Alerts
1. Create webhook in channel settings
2. Set env var: `ALERT_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...`
3. Alerts appear as embedded messages

---

## Summary

| Issue | Check | Command/URL |
|-------|-------|-------------|
| Service down | Health | `GET /api/health` |
| Performance | Metrics | `GET /api/metrics` |
| Recent errors | Logs | `railway logs --tail` |
| Specific error | Logs grep | `railway logs \| grep ERROR` |
| User issue | Request ID | `railway logs \| grep request_id=xxx` |
| Transcript empty | Prep debug | `GET /api/prep/{id}/debug` |
| Job failed | Job status | `GET /api/jobs/{id}` |
| Frontend bug | Console | Browser DevTools |
| GPU error | RunPod | runpod.io/console |
