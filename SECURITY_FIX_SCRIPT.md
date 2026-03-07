# 🚨 SECURITY FIXES - IMMEDIATE ACTION REQUIRED

## DO THIS RIGHT NOW (Before pushing any more code)

### Step 1: Remove Exposed Secrets from Git

```bash
# Navigate to project root
cd C:\Users\aksha\Downloads\final_mvp_backend_final\final_mvp_backend

# Add env files to gitignore (if not already there)
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo "*.env" >> .gitignore

# Remove from git tracking (but keep files locally)
git rm --cached backend/.env 2>nul
git rm --cached frontend/.env.local 2>nul
git rm --cached .env 2>nul

# Commit the changes
git add .gitignore
git commit -m "SECURITY: Remove env files from git tracking

- Add .env and .env.local to .gitignore
- Remove cached env files from repository
- Prevent accidental exposure of secrets"

# Push to remote
git push origin main
```

---

### Step 2: ROTATE API KEYS (CRITICAL)

**OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Delete the exposed key: `sk-proj-G4H52Q2xZPMbM8vm...`
3. Create a new key
4. Update `backend/.env` with new key

**XAI API Key:**
1. Go to https://console.x.ai/
2. Delete the exposed key: `xai-N5grfwNOQIDeknzNVdzxmbNyPqg3to5Qd4DE9dLaZPyIyWAvTb7YneFhDlxW0LTTkhd3mqupvH4XzWvm`
3. Create a new key
4. Update `backend/.env` with new key

**Supabase:**
1. Go to https://supabase.com/dashboard
2. Navigate to your project → Settings → API
3. Regenerate the service role key
4. Update both `backend/.env` and `frontend/.env.local`

---

### Step 3: Verify Keys Are Gone from Git History

```bash
# Check if keys are still in history
git log --all --full-history --source -- backend/.env
git log --all --full-history --source -- frontend/.env.local

# If they appear in history, you may need to use BFG Repo-Cleaner or git-filter-branch
```

---

### Step 4: Fix Code Issues

**Fix 1: Remove dev token from client.js**

File: `frontend/src/api/client.js`

```javascript
// BEFORE (line 22):
const token = import.meta.env.DEV ? 'dev-token-xyz' : (getToken() || null);

// AFTER:
const token = getToken();
if (!token) {
  console.warn('No authentication token available');
}
```

Also fix line 48:
```javascript
// BEFORE:
const t = import.meta.env.DEV ? 'dev-token-xyz' : (getToken() || null);

// AFTER:
const t = getToken();
```

---

**Fix 2: Restrict CORS in production**

File: `backend/api.py` (around line 70)

```python
# BEFORE:
_origins = (
    [f"http://localhost:{p}" for p in range(5173, 5181)] +
    [f"http://127.0.0.1:{p}" for p in range(5173, 5181)] +
    [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# AFTER:
_origins_str = os.environ.get("CORS_ORIGINS", "")
if _origins_str:
    _origins = [o.strip() for o in _origins_str.split(",") if o.strip()]
else:
    # Default to localhost for development
    _origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

---

### Step 5: Update Environment Files

**backend/.env:**
```
# OpenAI (required for Whisper + GPT)
OPENAI_API_KEY=your-NEW-rotated-key

# XAI (optional)
XAI_API_KEY=your-NEW-rotated-key

# Supabase (auth, credits, My Videos)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-NEW-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Razorpay (optional - payments)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# API config
MAX_UPLOAD_MB=500
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

**frontend/.env.local:**
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-NEW-anon-key
VITE_API_URL=https://api.yourdomain.com
```

---

### Step 6: Test Everything

```bash
# Backend
cd backend
uvicorn api:app --reload --port 8000

# In another terminal, test health endpoint
curl http://localhost:8000/api/health

# Frontend
cd frontend
npm run dev

# Build test
npm run build
```

---

### Step 7: Commit Security Fixes

```bash
git add frontend/src/api/client.js
git add backend/api.py
git add SECURITY_FIX_SCRIPT.md
git add PRODUCTION_READINESS_REPORT.md

git commit -m "SECURITY: Fix critical security issues

- Remove dev token fallback from API client
- Restrict CORS to configured domains only
- Add security documentation"

git push
```

---

## 🔍 VERIFICATION CHECKLIST

After completing all steps:

- [ ] OpenAI key rotated and working
- [ ] XAI key rotated and working  
- [ ] Supabase keys rotated and working
- [ ] `git log` shows no env files in recent commits
- [ ] `.gitignore` contains `.env` and `.env.local`
- [ ] Backend starts without errors
- [ ] Frontend builds successfully
- [ ] API calls work in browser
- [ ] Auth flow works correctly

---

## ⚠️ IF KEYS WERE EXPOSED FOR MORE THAN 1 HOUR

**You MUST assume they were scraped by bots.**

1. Check OpenAI usage dashboard for unauthorized usage
2. Check Supabase logs for suspicious activity
3. Consider rotating keys again as a precaution
4. Enable usage alerts on all services

---

## 📞 GETTING HELP

If you're stuck:
1. Read the full `PRODUCTION_READINESS_REPORT.md`
2. Check `DEPLOYMENT_GUIDE.md` for setup instructions
3. Review FastAPI security docs: https://fastapi.tiangolo.com/tutorial/security/
4. Review React security best practices

**DO NOT SKIP THESE STEPS - YOUR API KEYS ARE CURRENTLY EXPOSED**
