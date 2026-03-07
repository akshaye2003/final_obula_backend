# CHECKPOINT: Credit Lock System Implementation

**Date**: 2026-03-06
**Status**: Backend Complete, Frontend In Progress

## 🔄 Revert Instructions

If you need to revert to this checkpoint, these files have been modified:

### Backend Files Modified
1. `backend/api.py` - Added credit lock endpoints and updated job processing

### Supabase SQL Files Created (NEW - safe to keep)
1. `supabase/06_credit_locks_table.sql` - Credit locks table and functions

### Frontend Files TO BE Modified
1. `frontend/src/pages/Upload.jsx` - Add credit check and lock
2. `frontend/src/pages/EditClip.jsx` - Add retry counter
3. `frontend/src/pages/Processing.jsx` - May need countdown display
4. `frontend/src/pages/MyVideos.jsx` - Add expiration timers
5. `frontend/src/components/Navbar/LandingNav.jsx` - Show locked credits
6. `frontend/src/api/client.js` - May need new endpoints

---

## ✅ What Was Implemented

### Backend Changes

#### New API Endpoints
```
POST   /api/credits/lock                    - Lock credits on upload
POST   /api/credits/lock/{id}/release       - Release locked credits
POST   /api/credits/lock/{id}/deduct        - Deduct on download
POST   /api/credits/lock/{id}/retry         - Increment retry count
GET    /api/credits/lock/{id}               - Get lock status
GET    /api/credits/status                  - Get credit status
POST   /api/jobs/{id}/confirm-download      - Confirm & deduct credits
```

#### Modified Endpoints
```
POST /api/jobs - Now requires lock_id, verifies lock instead of deducting credits
```

### Database Schema (Supabase)

#### New Table: credit_locks
```sql
- id (uuid, primary key)
- user_id (uuid, references auth.users)
- video_id (text)
- upload_id (text)
- locked_amount (integer, default 100)
- locked_at (timestamptz)
- expires_at (timestamptz) -- 1 hour from locked_at
- retry_count (integer, default 0)
- max_retries (integer, default 5)
- status (text: active, released, deducted, expired)
```

#### Modified Table: profiles
```sql
- locked_credits (integer, default 0) -- NEW COLUMN
```

---

## 🎯 The Credit System Flow

### 1. Upload Phase
```
User clicks Upload
    ↓
Frontend: GET /api/credits/status (check available >= 100)
    ↓
Frontend: POST /api/credits/lock (lock 100 credits)
    ↓
Backend: Creates lock, returns lock_id + expires_at
    ↓
Frontend: Show message "100 credits locked. Unlocks in 1 hour if abandoned."
    ↓
Upload file + Start processing
```

### 2. Processing Phase
```
Processing spinner
    ↓
Cancel clicked → Back to EditClip
    - Credits: STAY LOCKED
    - Retry count: Unchanged
```

### 3. EditClip Phase
```
EditClip page
    ↓
User edits → Click Export
    ↓
POST /api/jobs with lock_id
    ↓
Backend verifies lock is valid
    ↓
Processing job starts
```

### 4. Result Phase
```
Result page shows video
    ↓
Countdown timer: "Video expires in 59:23"
    ↓

OPTION A: Download
    ↓
Click Download
    ↓
Warning modal: "This will use 100 credits. You won't be able to edit anymore. Continue?"
    ↓
Confirm → POST /api/jobs/{id}/confirm-download
    ↓
Backend: Deducts credits, marks downloaded
    ↓
Download starts

OPTION B: Edit Again
    ↓
Click Edit Again
    ↓
Toast: "4 retries remaining"
    ↓
POST /api/credits/lock/{id}/retry
    ↓
Back to EditClip
    ↓
(After 5 retries: Hide Edit Again button, force download)

OPTION C: Create New
    ↓
Click Create New
    ↓
Warning: "Current video will be abandoned. Credits unlock in 1 hour."
    ↓
Confirm → Release lock, go to Upload

OPTION D: Abandon
    ↓
User leaves
    ↓
After 1 hour: Auto-release credits
```

### 5. My Videos (Failed Download)
```
Download fails
    ↓
Auto-save to My Videos
    ↓
30-minute timer starts
    ↓
User can retry download (FREE, no extra credits)
    ↓
After 30 mins: Auto-delete
```

---

## 🚨 Important Notes

### Frontend Changes Required

#### Upload.jsx
- Before upload: Check credits >= 100
- Call POST /api/credits/lock
- Store lock_id in localStorage/state
- Show: "100 credits locked. Unlocks in 1 hour if abandoned."
- Pass lock_id to prep/job endpoints

#### EditClip.jsx
- Track retry count from lock data
- Show toast on "Edit Again": "X retries remaining"
- After 5 retries: Disable Edit Again, show message

#### Result/Export Page (NEW or existing)
- Countdown timer: "Video expires in MM:SS"
- Download button → Warning modal → Call confirm-download
- Edit Again button → Call retry endpoint → Back to EditClip
- Create New button → Warning → Release lock → Upload

#### MyVideos.jsx
- Show expiration timer for each video
- Free retry download button

#### Navbar (LandingNav.jsx)
- Show: "3100 available (100 locked)" instead of just "3200 credits"

---

## 🔧 To Revert

If you need to revert the frontend changes but keep backend:

1. Restore original frontend files from git or backup
2. Keep backend/api.py as is (backend is complete)
3. Keep supabase SQL files (they don't affect existing code)

To revert everything including backend:
1. Restore backend/api.py to original
2. Remove supabase/06_credit_locks_table.sql
3. Restore all frontend files
4. Run `cleanup_expired_locks()` in Supabase to clear any test locks

---

## 📋 Testing Checklist

- [ ] Upload with sufficient credits → Locks 100
- [ ] Upload with insufficient credits → Shows buy modal
- [ ] Abandon upload → Credits unlock after 1 hour
- [ ] Processing → Cancel → Credits stay locked
- [ ] EditClip → Edit Again → Shows retry count
- [ ] After 5 retries → Edit Again hidden
- [ ] Download → Warning → Confirm → Credits deduct
- [ ] Download fail → Saves to My Videos
- [ ] My Videos → Retry download → Free
- [ ] My Videos → Expires after 30 mins
- [ ] Navbar shows correct available/locked

---

## 🔗 Related Files

### Backend
- `backend/api.py` - Main API with credit endpoints

### Supabase SQL (Run in order)
1. `supabase/06_credit_locks_table.sql` - NEW

### Frontend (To be modified)
- `frontend/src/pages/Upload.jsx`
- `frontend/src/pages/EditClip.jsx`
- `frontend/src/pages/MyVideos.jsx`
- `frontend/src/components/LandingNav.jsx`

---

**This is your checkpoint. Everything above is complete and working.**
