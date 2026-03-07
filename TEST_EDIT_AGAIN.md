# 🧪 Testing "Edit Again" Feature

## Quick Test Steps

### 1. Start Your Servers
```bash
# Terminal 1 - Backend
cd backend
source venv/bin/activate  # or .\venv\Scripts\activate on Windows
uvicorn api:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 2. Test the Feature

**Step 1: Upload a Video**
- Go to `http://localhost:5178/upload`
- Upload any video
- Wait for prep to complete

**Step 2: Edit & Export**
- Change some settings (e.g., set Size to "L", Color to Gold)
- Click "Export 1080p"
- Wait for processing to complete

**Step 3: Test "Edit Again"**
- On the result page (where you see "Your clip is ready")
- Click the **"Edit Again"** button (rightmost button)
- **Expected:** Should take you back to EditClip page with same video

**Step 4: Verify**
- Check if your previous settings are loaded (Size: L, Color: Gold)
- Change something (e.g., Size to "S")
- Export again
- Should create new video with new settings

---

## ✅ What Should Happen

If working correctly:
1. ✓ Click "Edit Again" → Goes to `/upload/edit/{prep_id}?videoId={video_id}`
2. ✓ EditClip loads with previous transcript and settings
3. ✓ Can modify settings and re-export

---

## ❌ If Something Breaks

### Error: "Cannot GET /upload/edit/..."
**Problem:** Frontend route not found
**Fix:** Check if EditClip.jsx route exists in App.jsx

### Error: "Prep session not found"
**Problem:** Backend can't find prep_id
**Fix:** The job was created before the backend update. Try with a NEW video.

### Error: Blank page
**Problem:** Frontend error
**Fix:** Open browser console (F12) and check for red errors

---

## 🔍 Debug Checklist

If it's not working, check:

1. **Backend running?**
   ```bash
   curl http://localhost:8000/api/health
   # Should return: {"status": "ok"}
   ```

2. **Frontend running?**
   - Open `http://localhost:5178`
   - Should see your app

3. **Check browser console:**
   - Press F12
   - Look for red error messages
   - Screenshot any errors

4. **Check network tab:**
   - F12 → Network tab
   - Click "Edit Again"
   - Look for failed requests (red)

---

## 📸 Send Me Screenshots

If it's not working, send me:
1. Screenshot of the result page (with the 3 buttons)
2. Screenshot of browser console (F12) after clicking "Edit Again"
3. Screenshot of any error pages

I can help fix issues based on what I see!

---

## ⚡ Quick Check

Before testing, verify the code is in place:

**In Processing.jsx line ~102-109, you should see:**
```jsx
{/* Edit Again Button */}
<Link
  to={job.from_prep_id 
    ? `/upload/edit/${job.from_prep_id}?videoId=${job.video_id || ''}`
    : `/upload?videoId=${job.video_id || ''}`
  }
  ...
>
  Edit again
</Link>
```

**In backend/api.py line ~1365-1375, you should see:**
```python
JOBS[job_id] = {
    "status": "queued",
    ...
    "video_id": body.video_id,
    "from_prep_id": body.from_prep_id,
}
```

If both are present, you're good to test!
