# 📦 ZIP Cleanup Plan

## BEFORE YOU ZIP - Here's what we'll remove:

---

## 🟢 SAFE TO DELETE (Will be removed)

### 1. CACHE & TEMPORARY FILES
```
backend/masks_generated/*          ← 4,478 MB (Person detection masks - will regenerate)
backend/uploads/*                  ←   710 MB (Old user uploads)
backend/outputs/*                  ←   204 MB (Old processed videos)
backend/data/prep/*                ←   0.4 MB (Edit session temp data)
backend/data/broll_thumbnails/*    ←   0.3 MB (Auto-generated thumbnails)
backend/gpt_cache/*                ←     0 MB (GPT response cache)
```

### 2. PYTHON CACHE
```
All __pycache__/ folders           ←   ~50 MB
All *.pyc files                    ←   (Compiled Python)
All *.pyo files                    ←   (Optimized Python)
```

### 3. NODE MODULES (can reinstall)
```
frontend/node_modules/             ←   139 MB
```

### 4. IDE/EDITOR FILES
```
.claude/                           ←   (IDE cache)
```

### 5. TEST VIDEO FILES (in root)
```
IMG_1986_dynamic_smart.mp4         ←   26 MB
IMG_1986_dynamic_smart_captions.json
IMG_1986_recreated.mp4             ←   34 MB
IMG_1986_recreated_v2.mp4          ←   35 MB
IMG_1986_split.mp4                 ←   34 MB
IMG_1986_split_captions.json
IMG_1986_viral.mp4                 ←   26 MB
IMG_1986_viral_captions.json
try_output.mp4                     ←  2.7 MB
try_output_captions.json
```
**Keep these test videos (your originals):**
- ✅ `IMG_1986.MOV` (33 MB) - Original
- ✅ `My movie 2.mp4` (57 MB) - Original
- ✅ `my movie 3 .mp4` (48 MB) - Original
- ✅ `try.mp4` (2.4 MB) - Original

---

## 🔴 KEEP (Essential for running the project)

### SOURCE CODE
```
backend/api.py
backend/main.py
backend/check_captions.py
backend/recreate_with_captions.py
backend/scripts/*.py               ← All Python modules
frontend/src/**/*                  ← React components
frontend/*.config.js
frontend/*.html
frontend/package.json
```

### CONFIGURATION
```
backend/presets/*.json             ← Caption presets
backend/.env.example               ← Env template
frontend/.env.example              ← Env template
backend/requirements-api.txt
backend/requirements-production.txt
```

### ASSETS (NEEDED)
```
backend/movie_clips/*              ← B-roll library (~500 MB)
backend/color_grading/*            ← LUT files
backend/fonts/*                    ← Fonts
backend/models/*                   ← ML models (~120 MB)
```

### DOCUMENTATION
```
.gitignore
deploy.sh
docker-compose.yml
nginx.conf
PRODUCTION_READINESS_REPORT.md
SECURITY_FIX_SCRIPT.md
DEPLOYMENT_GUIDE.md
CLEANUP_REPORT.md
ZIP_CLEANUP_PLAN.md (this file)
```

---

## 📊 SPACE SAVED

| Category | Size | Action |
|----------|------|--------|
| masks_generated | 4,478 MB | DELETE |
| uploads | 710 MB | DELETE |
| outputs | 204 MB | DELETE |
| node_modules | 139 MB | DELETE |
| Python cache | 50 MB | DELETE |
| Test videos | 158 MB | DELETE |
| thumbnails/prep | 1 MB | DELETE |
| **TOTAL** | **~5.7 GB** | **DELETE** |

**After cleanup: ~1.3 GB** (from ~7 GB)

---

## ✅ CONFIRMATION CHECKLIST

Before I proceed, confirm:

- [ ] Delete all cached masks (4.4 GB) - Will regenerate when processing videos
- [ ] Delete old uploads (710 MB) - Old user videos
- [ ] Delete old outputs (204 MB) - Old processed videos  
- [ ] Delete node_modules (139 MB) - Can reinstall with `npm install`
- [ ] Delete processed test videos (158 MB) - Keep only originals
- [ ] Delete Python cache (~50 MB) - Will regenerate
- [ ] Delete IDE cache (.claude/)

---

## 🎯 AFTER CLEANUP

Your ZIP will contain:
- ✅ All source code
- ✅ All configuration
- ✅ Required assets (movie clips, fonts, LUTs)
- ✅ Documentation
- ✅ Deployment scripts
- ⚠️ NO cached data
- ⚠️ NO temp files
- ⚠️ NO node_modules (install with `npm install`)

---

## 🚀 READY TO PROCEED?

**Reply with:**
- `"YES"` - I'll delete all listed files and create a clean ZIP
- `"NO"` - Cancel the operation
- `"Keep X"` - Tell me specific files/folders to keep

Example: `"YES but keep all test videos"` or `"Delete everything except masks"`
