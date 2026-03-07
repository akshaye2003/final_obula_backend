# Credit Lock System - Implementation Summary

## Overview
Implemented a credit lock system for the video processing workflow to ensure users have sufficient credits before processing begins, while allowing flexibility for edits and retries.

## Flow
```
Upload → Lock 100 credits → Process/Edit → Export → Result → Download(Confirm) → Deduct credits
```

## Backend (Already Implemented)
- Credit lock endpoints in `backend/api.py`
- Supabase SQL functions in `supabase/06_credit_locks_table.sql`

## Frontend Changes

### 1. New API Module: `frontend/src/api/credits.js`
Functions for credit operations:
- `getCreditsStatus()` - Get user's credit status (available, locked, total)
- `lockCredits()` - Lock credits when starting upload
- `releaseCredits()` - Release locked credits (abandoned video)
- `deductCredits()` - Deduct locked credits on download
- `incrementRetry()` - Track edit retries (max 5)
- `confirmDownload()` - Confirm download and deduct credits

### 2. Updated `frontend/src/pages/Upload.jsx`
- Added credit check before upload
- Shows credit confirmation modal with:
  - Available credits
  - Credits to lock (100)
  - Remaining after lock
  - Info about 1-hour auto-unlock
- Locks 100 credits when user confirms
- Stores `lock_id`, `upload_id`, and `lock_expires_at` in sessionStorage
- Shows toast notification: "100 Credits Locked"
- Releases credits on upload failure

### 3. Updated `frontend/src/pages/EditClip.jsx`
- Receives `lock_id` from navigation state
- Displays credit lock status in header:
  - "100 credits locked" badge
  - Retry counter (X/5 retries)
- On "Edit Again":
  - Increments retry count via API
  - Shows toast with remaining retries (4, 3, 2, 1...)
  - Shows warning on final retry
- Passes `lock_id` to job creation API

### 4. Updated `frontend/src/pages/Processing.jsx` (Result Page)
- Shows countdown timer: "Video expires in 59:23"
- Download confirmation modal:
  - Warns about 100 credit deduction
  - Warns that editing won't be possible after download
  - Shows expiration countdown
  - Calls `confirmDownload()` to deduct credits
- "Create New" warning modal:
  - Warns that credits will be released
  - Warns that video will be abandoned
  - Calls `releaseCredits()` before navigating

### 5. Updated `frontend/src/main.jsx`
- Added `react-toastify` ToastContainer with dark theme
- Styled to match app design

### 6. MyVideos Page (`frontend/src/pages/MyVideos.jsx`)
- Already has 30-minute expiration timers
- Shows "expiring soon" warning for videos < 5 min
- Auto-deletes expired videos

## Key Features

### Credit Lock Rules
1. **Lock on Upload**: 100 credits locked immediately when upload starts
2. **Deduct on Download**: Credits deducted only when user confirms download
3. **Auto-unlock**: 1 hour timer - credits auto-release if abandoned
4. **Edit Again Limit**: Max 5 retries, toast shows remaining count
5. **Failed Download**: Video saved to My Videos (30 min retention, free retry)
6. **Create New Warning**: Warns if current video will be abandoned

### UI Elements
- Upload page: Credit info banner ("100 credits to process", "1 hour unlock timer")
- EditClip: Credit lock badge and retry counter in header
- Result page: Expiration countdown timer
- Result page: Download confirmation modal with credit warning
- Result page: Create New warning modal
- Toast notifications for all credit operations

## Testing Checklist
- [ ] Upload with insufficient credits → redirect to pricing
- [ ] Upload with sufficient credits → credit lock modal → lock success
- [ ] Cancel upload → credits released
- [ ] Edit video → no credit change
- [ ] Edit Again → retry count increments, toast shows remaining
- [ ] 5th Edit Again → warning toast (final retry)
- [ ] Download → confirmation modal → credits deducted
- [ ] Create New without downloading → warning modal → credits released
- [ ] Wait 1 hour → credits auto-released (backend)
- [ ] My Videos → 30 min expiration timer visible
