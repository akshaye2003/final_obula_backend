# Video Reels Studio

A SaaS platform for editing short-form video content with AI-powered features including automatic transcription, captions, b-roll insertion, and style customization.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Third-Party Service Setup](#third-party-service-setup)
  - [Supabase](#1-supabase-setup)
  - [Razorpay](#2-razorpay-payment-gateway-setup)
  - [OpenAI](#3-openai-setup)
- [API Documentation](#api-documentation)
- [Credit System](#credit-system)
- [Video Processing Pipeline](#video-processing-pipeline)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

Video Reels Studio is a web application that allows users to:

1. **Upload videos** - Supports MP4, MOV, and other common formats
2. **Edit clips** - Trim, add captions, insert b-roll footage
3. **Apply styles** - Choose from viral, minimal, or dynamic caption themes
4. **Export videos** - Processed videos with professional captions and effects
5. **Manage credits** - Pay-as-you-go credit system for video processing

### Key Features

- **AI-Powered Transcription**: Uses OpenAI Whisper for accurate speech-to-text
- **Smart B-Roll**: AI-suggested stock footage based on video content
- **Caption Themes**: Multiple styles (Viral, Minimal, Dynamic) with animated text
- **Credit System**: Lock credits on upload, deduct only on successful download
- **Edit Again**: Up to 5 retries to refine videos without extra charges

---

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11)
- **Video Processing**: OpenCV, FFmpeg, MoviePy
- **AI/ML**: OpenAI Whisper (transcription), GPT-4 (b-roll suggestions)
- **Database**: Supabase (PostgreSQL)
- **Payments**: Razorpay
- **Authentication**: Supabase Auth (JWT)

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **State Management**: React Context API

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx
- **File Storage**: Local filesystem (production: migrate to S3)

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Nginx         │────▶│   FastAPI       │
│   (React)       │     │   (Port 80/443) │     │   Backend       │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌──────────────────────────┼──────────┐
                              │                          │          │
                              ▼                          ▼          ▼
                       ┌─────────────┐            ┌──────────┐  ┌────────┐
                       │  Supabase   │            │  Local   │  │ OpenAI │
                       │  (Auth/DB)  │            │  Files   │  │  APIs  │
                       └─────────────┘            └──────────┘  └────────┘
```

### Directory Structure

```
.
├── backend/
│   ├── api.py                 # Main FastAPI application
│   ├── main.py                # CLI entry point for video processing
│   ├── scripts/
│   │   ├── pipeline.py        # Video processing pipeline
│   │   ├── animator.py        # Caption animation engine
││   ├── caption_renderer.py  # Text rendering
│   │   └── broll_engine.py    # B-roll search/insertion
│   ├── uploads/               # Uploaded videos (temp)
│   └── outputs/               # Processed videos
├── frontend/
│   ├── src/
│   │   ├── pages/             # React pages
│   │   ├── components/        # Reusable components
│   │   ├── api/               # API client functions
│   │   └── context/           # React contexts (Auth, Theme)
│   └── public/                # Static assets
├── supabase/
│   └── *.sql                  # Database migrations
└── docker-compose.yml         # Docker orchestration
```

---

## Quick Start

### Prerequisites

Before starting, set up these third-party services:

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Supabase](https://supabase.com) | Database & Auth | Yes - 500MB DB |
| [OpenAI](https://platform.openai.com) | AI transcription | Yes - $5 credit |
| [Razorpay](https://razorpay.com) | Payments | Test mode free |

👉 **See [Third-Party Service Setup](#third-party-service-setup) for detailed instructions.**

**Development Tools:**
- Docker and Docker Compose
- Node.js 18+ (for local frontend development)
- Python 3.11+ (for local backend development)

### Docker Deployment (Recommended)

1. **Clone and configure:**
```bash
# Copy environment files
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials
```

2. **Start services:**
```bash
docker-compose up -d
```

3. **Access the application:**
- Frontend: http://localhost
- Backend API: http://localhost/api
- API Docs: http://localhost/api/docs

### Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

### Backend (`.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key | Yes |
| `SUPABASE_JWT_SECRET` | JWT secret for auth | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `RAZORPAY_KEY_ID` | Razorpay key ID | Yes |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | Yes |
| `ENV` | `development` or `production` | No (default: development) |

### Frontend (`.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Backend URL (optional, uses proxy in dev) | No |

---

## API Documentation

### Authentication

All protected endpoints require a Bearer token:
```
Authorization: Bearer <jwt_token>
```

### Core Endpoints

#### Video Upload & Processing
```
POST   /api/upload              # Upload video file
POST   /api/jobs                # Create processing job (requires lock_id)
GET    /api/jobs/{id}           # Get job status
POST   /api/jobs/{id}/confirm-download  # Confirm download & deduct credits
GET    /api/jobs/{id}/download  # Download processed video
```

#### Credit System
```
GET    /api/credits/status      # Get credit totals
POST   /api/credits/lock        # Lock credits (returns lock_id)
POST   /api/credits/lock/{id}/release   # Release locked credits
POST   /api/credits/lock/{id}/deduct    # Deduct locked credits
POST   /api/credits/lock/{id}/retry     # Increment retry counter
GET    /api/credits/lock/{id}   # Get lock status
```

#### B-Roll & Assets
```
GET    /api/broll/search        # Search stock footage
GET    /api/broll/curated       # Get curated collections
POST   /api/broll/segments      # Save b-roll segments
```

#### Payments
```
POST   /api/create-order        # Create Razorpay order
POST   /api/verify-payment      # Verify payment signature
```

#### Admin
```
GET    /api/admin/users         # List users
GET    /api/admin/credits/distribution  # Credit analytics
POST   /api/admin/credits/{user_id}     # Add credits to user
```

Full API docs available at `/api/docs` (Swagger UI) when running.

---

## Credit System

### Overview

The platform uses a **credit lock** system to ensure fair usage:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Upload    │───▶│ Lock 100    │───▶│   Edit &    │───▶│  Download   │
│   Video     │    │   credits   │    │   Process   │    │  & Deduct   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                           │                                   │
                           ▼                                   ▼
                    ┌─────────────┐                    ┌─────────────┐
                    │ Expires in  │                    │ Credits     │
                    │ 1 hour      │                    │ deducted    │
                    └─────────────┘                    └─────────────┘
```

### Workflow

1. **Upload** → Lock 100 credits immediately
2. **Edit/Process** → Work on your video (max 5 retries via "Edit Again")
3. **Export** → Video processed, ready for download
4. **Download** → Confirm to deduct credits
5. **Abandon** → Credits auto-release after 1 hour

### Credit Operations

| Operation | Effect | Endpoint |
|-----------|--------|----------|
| Lock | Reserves 100 credits | `POST /api/credits/lock` |
| Release | Unlocks reserved credits | `POST /api/credits/lock/{id}/release` |
| Deduct | Actually charges credits | `POST /api/credits/lock/{id}/deduct` |
| Retry | Increments retry counter (max 5) | `POST /api/credits/lock/{id}/retry` |

### SQL Functions

Located in `supabase/06_credit_locks_table.sql`:

```sql
-- Lock credits
SELECT lock_credits(user_uuid, vid_id, upload_vid_id, amount);

-- Release credits
SELECT release_credits(lock_id);

-- Deduct credits
SELECT deduct_locked_credits(lock_id);

-- Cleanup expired locks (run periodically)
SELECT cleanup_expired_locks();
```

---

## Video Processing Pipeline

### Stages

1. **Upload** → Video saved to `uploads/`
2. **Mask Detection** → AI detects face/body positions
3. **Transcription** → Whisper generates subtitles
4. **Caption Generation** → Styled text overlays created
5. **B-Roll Insertion** → Stock footage added (optional)
6. **Export** → Final video rendered to `outputs/`

### Pipeline Script (`backend/scripts/pipeline.py`)

```python
from scripts.pipeline import Pipeline

pipeline = Pipeline(api_key="sk-...")
pipeline.process(
    input_path="input.mp4",
    output_path="output.mp4",
    segments=[...],
    style="viral"
)
```

### Caption Themes

| Theme | Description | Use Case |
|-------|-------------|----------|
| `viral` | Bold, high-contrast, animated | TikTok/Reels style |
| `minimal` | Clean, simple, elegant | Professional content |
| `dynamic` | Colorful, motion-heavy | High-energy videos |

---

## Third-Party Service Setup

### 1. Supabase Setup

Supabase handles authentication, database, and user management.

#### Step 1: Create Project
1. Go to [https://supabase.com](https://supabase.com) and sign up
2. Click "New Project"
3. Choose organization → Project name → Database password → Region (closest to users)
4. Click "Create new project"

#### Step 2: Get API Keys
1. Go to Project Settings → API
2. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (secret) → `SUPABASE_SERVICE_ROLE_KEY`
   - **JWT Settings** → JWT Secret → `SUPABASE_JWT_SECRET`

#### Step 3: Run SQL Migrations
Go to SQL Editor and run these files in order:

```sql
-- 1. Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create users table (handled by Supabase Auth)
-- Users are auto-created via Supabase Auth

-- 3. Create credits table
CREATE TABLE IF NOT EXISTS public.credits (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_credits integer DEFAULT 0,
    locked_credits integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 4. Create credit_locks table
CREATE TABLE IF NOT EXISTS public.credit_locks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id text,
    upload_video_id text,
    amount integer DEFAULT 100,
    retry_count integer DEFAULT 0,
    status text DEFAULT 'active',
    expires_at timestamp with time zone DEFAULT timezone('utc'::text, now() + interval '1 hour'),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 5. Create payment_orders table
CREATE TABLE IF NOT EXISTS public.payment_orders (
    id text PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    amount integer,
    credits integer,
    status text DEFAULT 'pending',
    razorpay_order_id text,
    razorpay_payment_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
CREATE POLICY "Users can view own credits" ON public.credits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own locks" ON public.credit_locks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own orders" ON public.payment_orders
    FOR SELECT USING (auth.uid() = user_id);

-- 8. Create credit lock functions
CREATE OR REPLACE FUNCTION public.lock_credits(
    user_uuid uuid,
    vid_id text,
    upload_vid_id text,
    amount int DEFAULT 100
) RETURNS uuid AS $$
DECLARE
    lock_id uuid;
    available_credits int;
BEGIN
    -- Check available credits
    SELECT (total_credits - locked_credits) INTO available_credits
    FROM public.credits WHERE user_id = user_uuid;
    
    IF available_credits < amount THEN
        RAISE EXCEPTION 'Insufficient credits';
    END IF;
    
    -- Create lock
    INSERT INTO public.credit_locks (user_id, video_id, upload_video_id, amount)
    VALUES (user_uuid, vid_id, upload_vid_id, amount)
    RETURNING id INTO lock_id;
    
    -- Update locked credits
    UPDATE public.credits 
    SET locked_credits = locked_credits + amount,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = user_uuid;
    
    RETURN lock_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create release credits function
CREATE OR REPLACE FUNCTION public.release_credits(lock_id uuid)
RETURNS boolean AS $$
DECLARE
    lock_record public.credit_locks%ROWTYPE;
BEGIN
    SELECT * INTO lock_record FROM public.credit_locks WHERE id = lock_id;
    
    IF lock_record.status != 'active' THEN
        RETURN false;
    END IF;
    
    UPDATE public.credit_locks 
    SET status = 'released' 
    WHERE id = lock_id;
    
    UPDATE public.credits 
    SET locked_credits = locked_credits - lock_record.amount,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = lock_record.user_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create deduct credits function
CREATE OR REPLACE FUNCTION public.deduct_locked_credits(lock_id uuid)
RETURNS boolean AS $$
DECLARE
    lock_record public.credit_locks%ROWTYPE;
BEGIN
    SELECT * INTO lock_record FROM public.credit_locks WHERE id = lock_id;
    
    IF lock_record.status != 'active' THEN
        RETURN false;
    END IF;
    
    UPDATE public.credit_locks 
    SET status = 'deducted' 
    WHERE id = lock_id;
    
    UPDATE public.credits 
    SET total_credits = total_credits - lock_record.amount,
        locked_credits = locked_credits - lock_record.amount,
        updated_at = timezone('utc'::text, now())
    WHERE user_id = lock_record.user_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Create cleanup function for expired locks
CREATE OR REPLACE FUNCTION public.cleanup_expired_locks()
RETURNS integer AS $$
DECLARE
    count integer := 0;
    lock_record public.credit_locks%ROWTYPE;
BEGIN
    FOR lock_record IN 
        SELECT * FROM public.credit_locks 
        WHERE status = 'active' AND expires_at < timezone('utc'::text, now())
    LOOP
        UPDATE public.credit_locks 
        SET status = 'expired' 
        WHERE id = lock_record.id;
        
        UPDATE public.credits 
        SET locked_credits = locked_credits - lock_record.amount,
            updated_at = timezone('utc'::text, now())
        WHERE user_id = lock_record.user_id;
        
        count := count + 1;
    END LOOP;
    
    RETURN count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Step 4: Configure Auth
1. Go to Authentication → Settings
2. Enable Email provider
3. Configure Site URL (for redirects): `http://localhost` (dev) or your domain
4. Disable "Confirm email" for easier testing (enable in production)

---

### 2. Razorpay (Payment Gateway) Setup

Razorpay handles credit purchases.

#### Step 1: Create Account
1. Go to [https://razorpay.com](https://razorpay.com)
2. Sign up with your business email
3. Complete KYC verification (required for live mode)

#### Step 2: Get API Keys

**Test Mode:**
1. Dashboard → Account & Settings → API Keys
2. Generate Key (Test Mode)
3. Copy:
   - **Key ID** → `RAZORPAY_KEY_ID`
   - **Key Secret** → `RAZORPAY_KEY_SECRET`

**Live Mode:**
1. Switch dashboard to "Live Mode" (toggle in top-right)
2. Generate Key (Live Mode)
3. Use live keys in production

#### Step 3: Configure Webhooks (Optional but Recommended)
1. Dashboard → Account & Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/verify-payment`
3. Select events: `payment.captured`, `order.paid`

#### Step 4: Test Payments
Use Razorpay test card numbers:
- Card: `5267 3181 8797 5449`
- Expiry: Any future date
- CVV: Any 3 digits
- OTP: `1234`

---

### 3. OpenAI Setup

OpenAI powers transcription (Whisper) and b-roll suggestions (GPT-4).

#### Step 1: Create Account
1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up with your email
3. Verify phone number

#### Step 2: Get API Key
1. Go to API Keys section
2. Click "Create new secret key"
3. Copy the key → `OPENAI_API_KEY`

**Important:** Save the key immediately - you can't view it again!

#### Step 3: Add Credits
1. Go to Settings → Billing
2. Add payment method
3. Set usage limits if desired

#### Step 4: Models Used
| Feature | Model | Cost |
|---------|-------|------|
| Transcription | `whisper-1` | ~$0.006/minute |
| B-Roll Suggestions | `gpt-4o-mini` | ~$0.0006/1K tokens |

---

## Database Schema

### Tables

**users**
```sql
id uuid primary key
email text
name text
created_at timestamp
```

**credits**
```sql
user_id uuid references users(id)
total_credits integer
locked_credits integer
created_at timestamp
updated_at timestamp
```

**credit_locks**
```sql
id uuid primary key
user_id uuid references users(id)
video_id text
upload_video_id text
amount integer
retry_count integer (default 0, max 5)
status text (active/released/deducted/expired)
expires_at timestamp
created_at timestamp
```

**payment_orders**
```sql
id text primary key
user_id uuid
amount integer
credits integer
status text
razorpay_order_id text
razorpay_payment_id text
```

---

## Deployment

### Production Checklist

- [ ] Migrate file storage to S3/CloudFront
- [ ] Set up Redis for job queue (replace in-memory storage)
- [ ] Configure production Supabase project
- [ ] Set `ENV=production` in backend
- [ ] Configure Razorpay live keys
- [ ] Set up SSL certificates
- [ ] Configure CDN for static assets
- [ ] Set up monitoring (Sentry, etc.)

### Known Limitations

1. **Job Persistence**: Jobs stored in memory (`JOBS` dict) - lost on server restart
2. **File Storage**: Local filesystem only - not scalable
3. **No Job Queue**: Async processing without persistent queue

### Docker Production

```bash
# Build and deploy
docker-compose -f docker-compose.yml up -d --build

# View logs
docker-compose logs -f backend
```

---

## Troubleshooting

### Common Issues

**Backend won't start**
```bash
# Check environment variables
python -c "import os; print(os.environ.get('SUPABASE_URL'))"

# Test Supabase connection
curl $SUPABASE_URL/rest/v1/users?limit=1 \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
```

**Video processing fails**
- Check FFmpeg installation: `ffmpeg -version`
- Verify OpenCV: `python -c "import cv2; print(cv2.__version__)"`
- Check disk space in `uploads/` and `outputs/`

**Credit lock issues**
```sql
-- Check user's locked credits
SELECT * FROM credit_locks WHERE user_id = 'uuid' AND status = 'active';

-- Manual release (emergency)
UPDATE credit_locks SET status = 'released' WHERE id = 'lock_id';
UPDATE credits SET locked_credits = locked_credits - 100 WHERE user_id = 'uuid';
```

**Frontend build fails**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Getting Help

- Check `PRODUCTION_READINESS_REPORT.md` for detailed analysis
- Check `CLEANUP_REPORT.md` for file cleanup guidelines
- Review `DEPLOYMENT_GUIDE.md` for step-by-step deployment

---

## License

Private - All rights reserved.

## Credits

Built with ❤️ using FastAPI, React, and Supabase.
