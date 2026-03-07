# 🧹 Project Cleanup Report

**Analysis Date:** March 6, 2026  
**Total Project Size:** ~7.5 GB  
**Space You Can Free:** ~6.5 GB

---

## 📊 Directory Breakdown

| Directory | Size | Can Delete? |
|-----------|------|-------------|
| `backend/masks_generated/` | 4.4 GB | ✅ YES |
| `backend/uploads/` | 710 MB | ✅ YES |
| `frontend/node_modules/` | 139 MB | ✅ YES |
| `backend/outputs/` | 204 MB | ✅ YES |
| Root video files | ~250 MB | ⚠️ Review |
| `backend/movie_clips/` | ~500 MB | ❌ NO (needed) |
| `backend/models/` | ~120 MB | ❌ NO (needed) |
| Source code | ~50 MB | ❌ NO |

---

## 🗂️ FILES SAFE TO DELETE

### 1. **Video Processing Cache** (4.4 GB)
```powershell
# Location: backend/masks_generated/
# What: Generated person masks for videos
# Safe to delete: YES - Will be regenerated when needed
Remove-Item -Path "backend\masks_generated\*" -Recurse -Force
```

### 2. **User Uploads** (710 MB)
```powershell
# Location: backend/uploads/
# What: Videos uploaded by users
# Safe to delete: YES - Only if you don't need these videos
Remove-Item -Path "backend\uploads\*" -Recurse -Force
```

### 3. **Processed Outputs** (204 MB)
```powershell
# Location: backend/outputs/
# What: Final processed videos
# Safe to delete: YES - Old output files
Remove-Item -Path "backend\outputs\*" -Recurse -Force
```

### 4. **Prep Data** (0.4 MB)
```powershell
# Location: backend/data/prep/
# What: Temporary edit session data
# Safe to delete: YES
Remove-Item -Path "backend\data\prep\*" -Recurse -Force
```

### 5. **B-Roll Thumbnails** (0.26 MB)
```powershell
# Location: backend/data/broll_thumbnails/
# What: Generated thumbnails
# Safe to delete: YES - Will regenerate
Remove-Item -Path "backend\data\broll_thumbnails\*" -Recurse -Force
```

### 6. **Python Cache** (~50 MB estimated)
```powershell
# What: Compiled Python bytecode
# Safe to delete: YES - Will regenerate
Get-ChildItem -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force
Get-ChildItem -Recurse -Filter "*.pyc" | Remove-Item -Force
Get-ChildItem -Recurse -Filter "*.pyo" | Remove-Item -Force
```

### 7. **Node Modules** (139 MB)
```powershell
# Location: frontend/node_modules/
# What: JavaScript dependencies
# Safe to delete: YES - Can reinstall with `npm install`
Remove-Item -Path "frontend\node_modules" -Recurse -Force
```

### 8. **Claude/IDE Files**
```powershell
# Location: .claude/
# What: IDE cache files
# Safe to delete: YES
Remove-Item -Path ".claude" -Recurse -Force
```

---

## ⚠️ FILES TO REVIEW (Don't Auto-Delete)

### Root Video Files (~250 MB)
These are in your project root - likely test videos:
- `IMG_1986.MOV` (33 MB)
- `IMG_1986_dynamic_smart.mp4` (26 MB)
- `IMG_1986_recreated.mp4` (34 MB)
- `IMG_1986_recreated_v2.mp4` (34 MB)
- `IMG_1986_split.mp4` (34 MB)
- `IMG_1986_viral.mp4` (26 MB)
- `My movie 2.mp4` (57 MB)
- `my movie 3 .mp4` (48 MB)
- `try.mp4` (2.4 MB)
- `try_output.mp4` (2.7 MB)

**Action:** Keep if they're examples/important, delete if just test files.

---

## 🚫 NEVER DELETE (Required Files)

### Critical Source Code
- `backend/*.py` (api.py, main.py, etc.)
- `backend/scripts/*.py`
- `frontend/src/**/*`
- `frontend/*.config.js`
- `frontend/*.html`

### Configuration Files
- `backend/presets/*.json`
- `backend/.env.example`
- `frontend/.env.example`

### Assets & Resources
- `backend/movie_clips/*` (B-roll library)
- `backend/color_grading/*` (LUT files)
- `backend/fonts/*` (Font files)
- `backend/models/*` (ML models - if any)

### Documentation
- `README.md` (if exists)
- `PRODUCTION_READINESS_REPORT.md`
- `DEPLOYMENT_GUIDE.md`
- `SECURITY_FIX_SCRIPT.md`
- `deploy.sh`
- `docker-compose.yml`
- `nginx.conf`
- `.gitignore`

---

## 🚀 QUICK CLEANUP SCRIPT

Run this PowerShell script to clean everything safe:

```powershell
# cleanup.ps1
Write-Host "🧹 Starting Project Cleanup..." -ForegroundColor Green

$totalFreed = 0

# Function to get folder size
function Get-FolderSize($path) {
    if (Test-Path $path) {
        $size = (Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue | 
                Measure-Object -Property Length -Sum).Sum
        return [math]::Round($size/1MB, 2)
    }
    return 0
}

# 1. Clean Python cache
Write-Host "`n🐍 Cleaning Python cache..." -ForegroundColor Yellow
$pycache = Get-ChildItem -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue
$pycache | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
$pyc = Get-ChildItem -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue
$pyc | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ Python cache cleaned" -ForegroundColor Green

# 2. Clean masks generated
$path = "backend\masks_generated"
if (Test-Path $path) {
    $size = Get-FolderSize $path
    Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleaned masks_generated ($size MB)" -ForegroundColor Green
    $totalFreed += $size
}

# 3. Clean uploads
$path = "backend\uploads"
if (Test-Path $path) {
    $size = Get-FolderSize $path
    Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleaned uploads ($size MB)" -ForegroundColor Green
    $totalFreed += $size
}

# 4. Clean outputs
$path = "backend\outputs"
if (Test-Path $path) {
    $size = Get-FolderSize $path
    Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleaned outputs ($size MB)" -ForegroundColor Green
    $totalFreed += $size
}

# 5. Clean prep data
$path = "backend\data\prep"
if (Test-Path $path) {
    $size = Get-FolderSize $path
    Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleaned prep data ($size MB)" -ForegroundColor Green
    $totalFreed += $size
}

# 6. Clean thumbnails
$path = "backend\data\broll_thumbnails"
if (Test-Path $path) {
    $size = Get-FolderSize $path
    Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleaned thumbnails ($size MB)" -ForegroundColor Green
    $totalFreed += $size
}

# 7. Clean GPT cache
$path = "backend\gpt_cache"
if (Test-Path $path) {
    $size = Get-FolderSize $path
    Remove-Item -Path "$path\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleaned GPT cache ($size MB)" -ForegroundColor Green
    $totalFreed += $size
}

# 8. Clean node_modules (optional - uncomment if needed)
# $path = "frontend\node_modules"
# if (Test-Path $path) {
#     $size = Get-FolderSize $path
#     Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
#     Write-Host "   ✅ Cleaned node_modules ($size MB)" -ForegroundColor Green
#     $totalFreed += $size
# }

# 9. Clean .claude
$path = ".claude"
if (Test-Path $path) {
    Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Cleaned .claude folder" -ForegroundColor Green
}

Write-Host "`n🎉 Cleanup Complete!" -ForegroundColor Green
Write-Host "   Total space freed: ~$totalFreed MB" -ForegroundColor Cyan
Write-Host "`n💡 To reinstall frontend dependencies, run: cd frontend && npm install" -ForegroundColor Yellow
```

---

## 💾 SPACE SAVED SUMMARY

| Action | Space Saved |
|--------|-------------|
| Delete masks_generated | 4,478 MB (4.4 GB) |
| Delete uploads | 710 MB |
| Delete outputs | 204 MB |
| Delete node_modules | 139 MB |
| Delete prep data | 0.4 MB |
| Delete thumbnails | 0.26 MB |
| Delete Python cache | ~50 MB |
| **TOTAL** | **~5,582 MB (5.4 GB)** |

After cleanup, your project will be **~1 GB** instead of **~7.5 GB**!

---

## ✅ SAFE CLEANUP CHECKLIST

- [ ] Python cache files deleted
- [ ] backend/masks_generated/ cleared
- [ ] backend/uploads/ cleared
- [ ] backend/outputs/ cleared
- [ ] backend/data/prep/ cleared
- [ ] backend/data/broll_thumbnails/ cleared
- [ ] backend/gpt_cache/ cleared
- [ ] frontend/node_modules/ deleted (if needed)
- [ ] .claude/ folder deleted
- [ ] Root test videos reviewed and deleted if not needed

---

## 🔄 REGULAR MAINTENANCE

Add this to your `api.py` to auto-cleanup old files:

```python
# Add to api.py
from fastapi_utils.tasks import repeat_every

@app.on_event("startup")
@repeat_every(seconds=86400)  # Daily
async def cleanup_old_files():
    import time
    cutoff = time.time() - (7 * 86400)  # 7 days
    
    for folder in [UPLOAD_DIR, OUTPUT_DIR]:
        for file in folder.glob("*"):
            if file.stat().st_mtime < cutoff:
                file.unlink(missing_ok=True)
```

---

**Ready to clean?** Run the PowerShell script above or delete files manually! 🚀
