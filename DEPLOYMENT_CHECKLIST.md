# Obula Deployment Checklist

## Overview
Deploying www.obula.io with distributed architecture:
- **Frontend**: Vercel (Edge)
- **API**: Railway
- **GPU Processing**: RunPod
- **Database**: Supabase

---

## Phase 1: Supabase Setup (Already Done ✅)

- [x] Create Supabase project
- [x] Configure Auth (Google OAuth)
- [x] Set up Database tables
- [x] Configure Storage bucket for videos
- [x] Set up Row Level Security (RLS)

**Required for deployment:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
```

---

## Phase 2: RunPod Worker (GPU Processing)

### 2.1 Prepare Worker Code

- [ ] Copy backend scripts to runpod-worker/
```bash
cd runpod-worker
mkdir -p scripts presets color_grading fonts

# Copy from backend
cp ../backend/scripts/*.py scripts/
cp ../backend/presets/*.json presets/
cp ../backend/color_grading/*.cube color_grading/
cp -r ../backend/fonts/* fonts/
```

### 2.2 Build Docker Image

- [ ] Update `build.sh` with your Docker Hub username
- [ ] Build and push image
```bash
cd runpod-worker
chmod +x build.sh
./build.sh
```

### 2.3 Create RunPod Endpoint

- [ ] Go to [RunPod Console](https://runpod.io/console/serverless)
- [ ] Click "New Endpoint"
- [ ] Configure:
  - **Name**: `obula-video-processor`
  - **Image**: `your-dockerhub-username/obula-runpod-worker:latest`
  - **GPU**: RTX 3090 (start with this)
  - **Max Workers**: 3
  - **Idle Timeout**: 60s
  - **Execution Timeout**: 600s
- [ ] Save and copy **Endpoint ID**

### 2.4 Test RunPod Endpoint

- [ ] Get RunPod API Key from Settings
- [ ] Test with curl:
```bash
curl -X POST https://api.runpod.io/v2/YOUR_ENDPOINT_ID/run \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "job_id": "test-123",
      "video_url": "https://your-test-video-url.mp4",
      "user_id": "test-user",
      "preset": "dynamic_smart"
    }
  }'
```

---

## Phase 3: Railway (API Server)

### 3.1 Connect Repository

- [ ] Go to [Railway](https://railway.app)
- [ ] New Project → Deploy from GitHub repo
- [ ] Select your repository
- [ ] Set Root Directory: `backend`

### 3.2 Configure Environment Variables

Add in Railway Dashboard → Variables:

```env
# Required
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...

# RunPod
RUNPOD_API_KEY=...
RUNPOD_ENDPOINT_ID=...
USE_RUNPOD=true

# Razorpay (optional)
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...

# Config
ENV=production
DEBUG=false
MAX_UPLOAD_MB=500
CORS_ORIGINS=https://www.obula.io,https://obula.io
```

### 3.3 Add Persistent Volume

- [ ] Railway Dashboard → Volumes
- [ ] Add Volume:
  - **Mount Path**: `/app/uploads`
  - **Size**: 10GB (start)
- [ ] Add another Volume:
  - **Mount Path**: `/app/outputs`
  - **Size**: 10GB

### 3.4 Configure Health Check

- [ ] Add health check path: `/api/health`
- [ ] Set interval: 30s

### 3.5 Deploy

- [ ] Railway will auto-deploy on push
- [ ] Check logs for errors
- [ ] Test health endpoint

### 3.6 Custom Domain

- [ ] Railway Dashboard → Settings → Domains
- [ ] Add custom domain: `api.obula.io`
- [ ] Copy CNAME target
- [ ] Add DNS record (see Phase 5)

---

## Phase 4: Vercel (Frontend)

### 4.1 Connect Repository

- [ ] Go to [Vercel](https://vercel.com)
- [ ] New Project → Import GitHub repo
- [ ] Select your repository
- [ ] Framework: Vite
- [ ] Root Directory: `frontend`
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`

### 4.2 Configure Environment Variables

```env
VITE_API_URL=https://api.obula.io
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

### 4.3 Deploy

- [ ] Vercel will auto-deploy on push
- [ ] Check build logs

### 4.4 Custom Domain

- [ ] Vercel Dashboard → Domains
- [ ] Add: `www.obula.io`
- [ ] Add: `obula.io` (redirects to www)
- [ ] Follow Vercel's DNS instructions

---

## Phase 5: DNS Configuration (Cloudflare)

### 5.1 Add Domain to Cloudflare

- [ ] Go to [Cloudflare](https://dash.cloudflare.com)
- [ ] Add Site: `obula.io`
- [ ] Choose Free plan
- [ ] Update nameservers at your registrar

### 5.2 DNS Records

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | www | cname.vercel-dns.com | ✅ |
| CNAME | api | your-railway-app.up.railway.app | ✅ |
| A | @ | 76.76.21.21 (Vercel) | ✅ |

### 5.3 SSL/TLS

- [ ] SSL/TLS mode: Full (strict)
- [ ] Always Use HTTPS: ON
- [ ] Automatic HTTPS Rewrites: ON

---

## Phase 6: Testing

### 6.1 End-to-End Test

- [ ] Visit https://www.obula.io
- [ ] Sign in with Google
- [ ] Upload a test video
- [ ] Edit transcript
- [ ] Export video
- [ ] Verify video processes via RunPod
- [ ] Download result

### 6.2 Check Each Service

- [ ] Frontend loads: https://www.obula.io
- [ ] API health: https://api.obula.io/api/health
- [ ] RunPod dashboard shows jobs running
- [ ] Supabase shows data in tables

### 6.3 Error Scenarios

- [ ] Test large file upload (>500MB should fail)
- [ ] Test cancel job during processing
- [ ] Test with bad video format
- [ ] Test auth expiration

---

## Phase 7: Monitoring & Alerts

### 7.1 RunPod Monitoring

- [ ] Set up alerts for:
  - Job failures > 5%
  - Cold start > 30s
  - GPU utilization

### 7.2 Railway Monitoring

- [ ] Enable log drains (optional)
- [ ] Set up usage alerts
- [ ] Monitor disk usage (uploads volume)

### 7.3 Supabase Monitoring

- [ ] Check database connections
- [ ] Monitor storage usage
- [ ] Set up connection pooling if needed

### 7.4 Vercel Analytics

- [ ] Enable Web Vitals
- [ ] Check Core Web Vitals scores
- [ ] Monitor traffic

---

## Phase 8: Optimization

### 8.1 Performance

- [ ] Enable Vercel Edge Network
- [ ] Add Redis caching for API (Railway has Redis)
- [ ] Optimize video upload (chunked uploads)
- [ ] Add CDN for video delivery (Cloudflare R2 or Supabase CDN)

### 8.2 Cost Optimization

- [ ] RunPod: Set idle timeout to 30-60s
- [ ] Railway: Start with 2GB RAM, scale if needed
- [ ] Supabase: Monitor database size
- [ ] Vercel: Pro plan if traffic > 1TB/month

### 8.3 Security

- [ ] Enable Cloudflare WAF
- [ ] Set up rate limiting
- [ ] Review CORS origins
- [ ] Rotate API keys
- [ ] Enable Supabase RLS on all tables

---

## Troubleshooting

### RunPod Issues

**Job stuck in QUEUED:**
- Check endpoint has active workers
- Verify GPU type is available
- Check RunPod status page

**Out of Memory:**
- Switch to A100 (80GB) for large videos
- Process in chunks

**Cold start slow:**
- Increase idle timeout
- Reduce Docker image size

### Railway Issues

**Build fails:**
- Check requirements.txt
- Verify Python version

**Upload fails:**
- Check volume is mounted
- Verify MAX_UPLOAD_MB env var

**CORS errors:**
- Check CORS_ORIGINS includes your domain

### Vercel Issues

**Build fails:**
- Check npm install runs clean
- Verify Vite config

**API calls fail:**
- Check VITE_API_URL
- Verify CORS on backend

---

## Cost Estimates

| Service | Plan | Est. Monthly |
|---------|------|-------------|
| Vercel | Pro | $20 |
| Railway | 2GB + volumes | $15-25 |
| Supabase | Pro (start Free) | $25 |
| RunPod | Usage-based | $20-100* |
| Cloudflare | Free | $0 |
| **Total** | | **$80-170** |

*RunPod depends on video volume: ~$0.015 per 2-min video

---

## Support Contacts

- **RunPod**: Discord or support@runpod.io
- **Railway**: Discord or support@railway.app
- **Vercel**: Support portal
- **Supabase**: Discord or support@supabase.io

---

## Done! 🎉

Once all checkboxes are checked, your app should be live at:
- **App**: https://www.obula.io
- **API**: https://api.obula.io
