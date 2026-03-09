-- =============================================================================
-- OBULA – Complete Supabase Setup (Single File, Safe to Re-run)
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================
-- Includes: profiles, admin_users, videos, payments, feedbacks, locked_credits
-- All triggers, functions, RLS policies, storage bucket, and admin accounts.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0: CLEAN SLATE (drop all policies, triggers, functions)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop all policies on profiles dynamically
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.profiles';
  END LOOP;
END $$;

-- Drop all policies on videos dynamically
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'videos' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.videos';
  END LOOP;
END $$;

-- Drop all policies on feedbacks dynamically
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'feedbacks' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.feedbacks';
  END LOOP;
END $$;

-- Drop all policies on locked_credits dynamically
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'locked_credits' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.locked_credits';
  END LOOP;
END $$;

-- Drop all policies on credit_locks dynamically
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'credit_locks' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.credit_locks';
  END LOOP;
END $$;

-- Drop all policies on admin_users dynamically
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'admin_users' AND schemaname = 'public' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON public.admin_users';
  END LOOP;
END $$;

-- Drop storage policies
DROP POLICY IF EXISTS "Users can upload own videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own videos"   ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;

-- Drop payments policy
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;

-- Drop triggers
DROP TRIGGER IF EXISTS on_auth_user_created    ON auth.users;
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;

-- Drop all functions
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.set_updated_at();
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.check_is_admin();
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.grant_admin(uuid);
DROP FUNCTION IF EXISTS public.revoke_admin(uuid);
DROP FUNCTION IF EXISTS public.admin_add_credits(uuid, integer);
DROP FUNCTION IF EXISTS public.admin_set_credits(uuid, integer);
DROP FUNCTION IF EXISTS public.decrement_credits(uuid);
DROP FUNCTION IF EXISTS public.add_credits(uuid, integer);
DROP FUNCTION IF EXISTS public.refund_credit(uuid);
DROP FUNCTION IF EXISTS public.get_all_user_video_stats();
DROP FUNCTION IF EXISTS public.lock_credits_for_video(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.deduct_locked_credits(uuid);
DROP FUNCTION IF EXISTS public.release_locked_credits(uuid);
DROP FUNCTION IF EXISTS public.mark_download_failed(uuid);
DROP FUNCTION IF EXISTS public.mark_download_success(uuid);
DROP FUNCTION IF EXISTS public.mark_video_ready(uuid);
DROP FUNCTION IF EXISTS public.get_available_credits(uuid);
DROP FUNCTION IF EXISTS public.get_user_downloadable_videos(uuid);
DROP FUNCTION IF EXISTS public.cleanup_expired_videos();
DROP FUNCTION IF EXISTS public.get_revenue_stats();
DROP FUNCTION IF EXISTS public.get_revenue_by_plan();
DROP FUNCTION IF EXISTS public.get_payment_details();
DROP FUNCTION IF EXISTS public.get_daily_revenue(integer);
DROP FUNCTION IF EXISTS public.get_user_growth_stats();
DROP FUNCTION IF EXISTS public.get_daily_signups(integer);
DROP FUNCTION IF EXISTS public.get_top_users_by_videos(integer);
DROP FUNCTION IF EXISTS public.get_video_stats();
DROP FUNCTION IF EXISTS public.get_daily_videos(integer);
DROP FUNCTION IF EXISTS public.get_credit_stats();
DROP FUNCTION IF EXISTS public.get_top_credit_buyers(text, integer);
DROP FUNCTION IF EXISTS public.get_user_purchase_history(uuid);
DROP FUNCTION IF EXISTS public.lock_credits(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.release_credit_locks(uuid);
DROP FUNCTION IF EXISTS public.deduct_credit_locks(uuid);
DROP FUNCTION IF EXISTS public.increment_retry(uuid);
DROP FUNCTION IF EXISTS public.get_remaining_retries(uuid);
DROP FUNCTION IF EXISTS public.cleanup_expired_locks();
DROP FUNCTION IF EXISTS public.get_available_credits_v2(uuid);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  full_name  text,
  avatar_url text,
  phone      text,
  credits    integer     NOT NULL DEFAULT 0,
  role       text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone   text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 0;

-- 1b. Admin users (separate table prevents recursive RLS)
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 1c. Videos
CREATE TABLE IF NOT EXISTS public.videos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               text        NOT NULL DEFAULT 'Obula Clip',
  storage_path        text        NOT NULL,
  file_size           bigint,
  status              text        DEFAULT 'uploaded',
  expires_at          timestamptz,
  download_attempted  boolean     DEFAULT FALSE,
  credits_deducted    boolean     DEFAULT FALSE,
  processed_url       text,
  credits_locked_at   timestamptz,
  credits_deducted_at timestamptz,
  created_at          timestamptz DEFAULT now()
);
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS status              text        DEFAULT 'uploaded';
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS expires_at          timestamptz;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS download_attempted  boolean     DEFAULT FALSE;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS credits_deducted    boolean     DEFAULT FALSE;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS processed_url       text;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS credits_locked_at   timestamptz;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS credits_deducted_at timestamptz;

-- 1d. Payments (Razorpay)
CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_order_id   text    NOT NULL UNIQUE,
  razorpay_payment_id text,
  plan                integer NOT NULL,
  amount_paise        integer NOT NULL,
  status              text    NOT NULL DEFAULT 'created',
  created_at          timestamptz DEFAULT now()
);

-- 1e. Feedbacks
CREATE TABLE IF NOT EXISTS public.feedbacks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  email      text        NOT NULL,
  message    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
  created_at timestamptz DEFAULT now()
);

-- 1f. Locked credits
CREATE TABLE IF NOT EXISTS public.locked_credits (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id    uuid        REFERENCES public.videos(id) ON DELETE CASCADE,
  amount      integer     NOT NULL DEFAULT 100,
  locked_at   timestamptz DEFAULT now(),
  deducted_at timestamptz,
  released_at timestamptz,
  status      text        DEFAULT 'locked' CHECK (status IN ('locked', 'deducted', 'released', 'expired'))
);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique      ON public.profiles (phone) WHERE phone IS NOT NULL;
CREATE INDEX        IF NOT EXISTS profiles_email_idx         ON public.profiles (email);
CREATE INDEX        IF NOT EXISTS profiles_role_idx          ON public.profiles (role);
CREATE INDEX        IF NOT EXISTS idx_locked_credits_user    ON public.locked_credits (user_id);
CREATE INDEX        IF NOT EXISTS idx_locked_credits_video   ON public.locked_credits (video_id);
CREATE INDEX        IF NOT EXISTS idx_locked_credits_status  ON public.locked_credits (status);
CREATE INDEX        IF NOT EXISTS idx_feedbacks_user_id      ON public.feedbacks (user_id);
CREATE INDEX        IF NOT EXISTS idx_feedbacks_status       ON public.feedbacks (status);
CREATE INDEX        IF NOT EXISTS idx_feedbacks_created_at   ON public.feedbacks (created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: TRIGGERS & CORE FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    'user',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email      = excluded.email,
    full_name  = COALESCE(excluded.full_name, profiles.full_name),
    phone      = COALESCE(excluded.phone, profiles.phone),
    avatar_url = COALESCE(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3b. Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3c. Admin check (queries admin_users — no recursion possible)
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
$$;

-- 3d. Super admin check (only athul.boban18@gmail.com)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND email = 'athul.boban18@gmail.com'
  );
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locked_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users    ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT USING (public.check_is_admin());

-- Admins can update any profile field (including credits) but NOT role
-- Only super admin can change role
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.check_is_admin())
  WITH CHECK (
    role = (SELECT role FROM public.profiles WHERE id = profiles.id)
    OR public.is_super_admin()
  );

-- Videos
CREATE POLICY "Users can view own videos"
  ON public.videos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own videos"
  ON public.videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own videos"
  ON public.videos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own videos"
  ON public.videos FOR DELETE USING (auth.uid() = user_id);

-- Payments
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT USING (auth.uid() = user_id);

-- Feedbacks
CREATE POLICY "Users can insert own feedback"
  ON public.feedbacks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own feedback"
  ON public.feedbacks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all feedbacks"
  ON public.feedbacks FOR SELECT USING (public.check_is_admin());
CREATE POLICY "Admins can update feedbacks"
  ON public.feedbacks FOR UPDATE USING (public.check_is_admin());

-- Locked credits
CREATE POLICY "Users can view own locked credits"
  ON public.locked_credits FOR SELECT USING (auth.uid() = user_id);

-- Admin users table: any admin can read, only super admin can insert/delete
CREATE POLICY "Admins can view admin_users"
  ON public.admin_users FOR SELECT USING (public.check_is_admin());
CREATE POLICY "Super admin can insert admins"
  ON public.admin_users FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin can delete admins"
  ON public.admin_users FOR DELETE USING (public.is_super_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: STORAGE BUCKET (private, 500 MB, video files only)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos', 'videos', false, 524288000,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm'];

CREATE POLICY "Users can upload own videos"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own videos"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own videos"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'videos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: ADMIN ROLE MANAGEMENT (super admin only)
-- ─────────────────────────────────────────────────────────────────────────────

-- Grant admin to a user
CREATE OR REPLACE FUNCTION public.grant_admin(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission_denied: only the super admin can grant admin access';
  END IF;

  INSERT INTO public.admin_users (user_id)
  VALUES (target_user_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET role = 'admin' WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;

-- Revoke admin from a user (cannot revoke super admin)
CREATE OR REPLACE FUNCTION public.revoke_admin(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission_denied: only the super admin can revoke admin access';
  END IF;

  IF (SELECT email FROM public.profiles WHERE id = target_user_id) = 'athul.boban18@gmail.com' THEN
    RAISE EXCEPTION 'cannot_revoke_super_admin';
  END IF;

  DELETE FROM public.admin_users WHERE user_id = target_user_id;
  UPDATE public.profiles SET role = 'user' WHERE id = target_user_id;

  RETURN TRUE;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: CREDIT FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Deduct 100 credits before starting a job
CREATE OR REPLACE FUNCTION public.decrement_credits(user_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur           integer;
  cost_per_clip integer := 100;
BEGIN
  SELECT credits INTO cur FROM profiles WHERE id = user_uuid FOR UPDATE;
  IF cur IS NULL OR cur < cost_per_clip THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;
  UPDATE profiles SET credits = credits - cost_per_clip WHERE id = user_uuid;
  RETURN cur - cost_per_clip;
END;
$$;

-- Add credits after successful payment
CREATE OR REPLACE FUNCTION public.add_credits(user_uuid uuid, credit_count integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE new_total integer;
BEGIN
  UPDATE profiles SET credits = credits + credit_count WHERE id = user_uuid
  RETURNING credits INTO new_total;
  RETURN new_total;
END;
$$;

-- Refund 100 credits when a job fails
CREATE OR REPLACE FUNCTION public.refund_credit(user_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET credits = credits + 100 WHERE id = user_uuid;
END;
$$;

-- Admin: add or subtract credits for any user (any admin can call)
CREATE OR REPLACE FUNCTION public.admin_add_credits(
  target_user_id uuid,
  amount         integer  -- positive = add, negative = deduct
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_total integer;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'permission_denied: admin only';
  END IF;

  UPDATE public.profiles
  SET credits = GREATEST(0, credits + amount)
  WHERE id = target_user_id
  RETURNING credits INTO new_total;

  IF new_total IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  RETURN new_total;
END;
$$;

-- Admin: set credits to an exact value for any user (any admin can call)
CREATE OR REPLACE FUNCTION public.admin_set_credits(
  target_user_id uuid,
  new_credits    integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_total integer;
BEGIN
  IF NOT public.check_is_admin() THEN
    RAISE EXCEPTION 'permission_denied: admin only';
  END IF;

  UPDATE public.profiles
  SET credits = GREATEST(0, new_credits)
  WHERE id = target_user_id
  RETURNING credits INTO new_total;

  IF new_total IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  RETURN new_total;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 8: VIDEO WORKFLOW FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Lock credits when a video upload starts
CREATE OR REPLACE FUNCTION public.lock_credits_for_video(
  p_user_id  uuid,
  p_video_id uuid,
  p_amount   integer DEFAULT 100
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_credits   integer;
  v_locked    integer;
  v_available integer;
BEGIN
  SELECT credits INTO v_credits FROM profiles WHERE id = p_user_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_locked
    FROM locked_credits WHERE user_id = p_user_id AND status = 'locked';
  v_available := v_credits - v_locked;
  IF v_available < p_amount THEN
    RETURN FALSE;
  END IF;
  INSERT INTO locked_credits (user_id, video_id, amount, status)
  VALUES (p_user_id, p_video_id, p_amount, 'locked');
  UPDATE videos SET credits_locked_at = NOW(), status = 'processing' WHERE id = p_video_id;
  RETURN TRUE;
END;
$$;

-- Deduct locked credits when user confirms download
CREATE OR REPLACE FUNCTION public.deduct_locked_credits(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_amount  integer;
BEGIN
  SELECT user_id INTO v_user_id FROM videos WHERE id = p_video_id;
  SELECT amount INTO v_amount
    FROM locked_credits WHERE video_id = p_video_id AND status = 'locked';
  IF v_amount IS NULL THEN
    RETURN FALSE;
  END IF;
  UPDATE profiles SET credits = credits - v_amount WHERE id = v_user_id;
  UPDATE locked_credits SET status = 'deducted', deducted_at = NOW()
    WHERE video_id = p_video_id AND status = 'locked';
  UPDATE videos SET credits_deducted_at = NOW(), status = 'downloading' WHERE id = p_video_id;
  RETURN TRUE;
END;
$$;

-- Release locked credits (video expired or job cancelled)
CREATE OR REPLACE FUNCTION public.release_locked_credits(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE locked_credits SET status = 'released', released_at = NOW()
    WHERE video_id = p_video_id AND status = 'locked';
  RETURN FOUND;
END;
$$;

-- Mark video ready for download (1-hour expiry window)
CREATE OR REPLACE FUNCTION public.mark_video_ready(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE videos SET
    status     = 'ready_for_download',
    expires_at = NOW() + INTERVAL '1 hour'
  WHERE id = p_video_id;
  RETURN FOUND;
END;
$$;

-- Mark download failed (preserve original expiry window)
CREATE OR REPLACE FUNCTION public.mark_download_failed(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE videos SET
    download_attempted = TRUE,
    status             = 'ready_for_download',
    expires_at         = GREATEST(expires_at, NOW() + INTERVAL '5 minutes')
  WHERE id = p_video_id;
  RETURN FOUND;
END;
$$;

-- Mark download successful — hide from My Videos
CREATE OR REPLACE FUNCTION public.mark_download_success(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE videos SET
    status     = 'downloaded',
    expires_at = NULL
  WHERE id = p_video_id;
  RETURN FOUND;
END;
$$;

-- Get user's real available credits (total minus locked)
CREATE OR REPLACE FUNCTION public.get_available_credits(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_credits integer;
  v_locked  integer;
BEGIN
  SELECT credits INTO v_credits FROM profiles WHERE id = p_user_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_locked
    FROM locked_credits WHERE user_id = p_user_id AND status = 'locked';
  RETURN v_credits - v_locked;
END;
$$;

-- Get videos shown in My Videos (ready, not yet expired)
CREATE OR REPLACE FUNCTION public.get_user_downloadable_videos(p_user_id uuid)
RETURNS TABLE (
  id                uuid,
  title             text,
  created_at        timestamptz,
  expires_at        timestamptz,
  seconds_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id, v.title, v.created_at, v.expires_at,
    EXTRACT(EPOCH FROM (v.expires_at - NOW()))::integer AS seconds_remaining
  FROM videos v
  WHERE v.user_id = p_user_id
    AND v.status  = 'ready_for_download'
    AND v.expires_at > NOW()
  ORDER BY v.expires_at ASC;
END;
$$;

-- Cleanup expired videos (run via pg_cron every minute)
CREATE OR REPLACE FUNCTION public.cleanup_expired_videos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  rec           RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM videos
    WHERE status = 'ready_for_download' AND expires_at < NOW()
  LOOP
    PERFORM release_locked_credits(rec.id);
    UPDATE videos SET status = 'expired' WHERE id = rec.id;
    deleted_count := deleted_count + 1;
  END LOOP;
  RETURN deleted_count;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 9: ADMIN ANALYTICS FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_all_user_video_stats()
RETURNS TABLE (user_id uuid, video_count bigint, last_video_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id, COUNT(*) AS video_count, MAX(created_at) AS last_video_at
  FROM public.videos GROUP BY user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_stats()
RETURNS TABLE (
  total_revenue   bigint,
  paid_revenue    bigint,
  pending_revenue bigint,
  today_revenue   bigint,
  week_revenue    bigint,
  month_revenue   bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(amount_paise), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'paid'    THEN amount_paise ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'created' THEN amount_paise ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'paid' AND created_at >= CURRENT_DATE                       THEN amount_paise ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '7 days'  THEN amount_paise ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '30 days' THEN amount_paise ELSE 0 END), 0)::bigint
  FROM public.payments;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_by_plan()
RETURNS TABLE (plan integer, plan_name text, count bigint, total_amount bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.plan,
    CASE WHEN p.plan = 1 THEN 'Single (1 clip)'
         WHEN p.plan = 3 THEN 'Saver (3 clips)'
         ELSE 'Unknown' END AS plan_name,
    COUNT(*)::bigint,
    COALESCE(SUM(p.amount_paise), 0)::bigint
  FROM public.payments p WHERE p.status = 'paid'
  GROUP BY p.plan ORDER BY p.plan;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_details()
RETURNS TABLE (
  payment_id    uuid,
  user_id       uuid,
  user_email    text,
  user_name     text,
  plan          integer,
  plan_name     text,
  credits       integer,
  amount_paise  integer,
  amount_rupees numeric,
  status        text,
  created_at    timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.user_id, pr.email, pr.full_name,
    p.plan,
    CASE WHEN p.plan = 1 THEN 'Single (1 clip)'
         WHEN p.plan = 3 THEN 'Saver (3 clips)'
         ELSE 'Unknown' END,
    CASE WHEN p.plan = 1 THEN 100
         WHEN p.plan = 3 THEN 300
         ELSE 0 END,
    p.amount_paise,
    (p.amount_paise / 100.0)::numeric,
    p.status, p.created_at
  FROM public.payments p
  JOIN public.profiles pr ON p.user_id = pr.id
  ORDER BY p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_revenue(days_count integer DEFAULT 30)
RETURNS TABLE (date text, amount bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(created_at::date, 'YYYY-MM-DD'),
    COALESCE(SUM(amount_paise), 0)::bigint
  FROM public.payments
  WHERE status = 'paid'
    AND created_at >= CURRENT_DATE - (days_count || ' days')::INTERVAL
  GROUP BY created_at::date ORDER BY created_at::date;
$$;

CREATE OR REPLACE FUNCTION public.get_user_growth_stats()
RETURNS TABLE (
  total_users  bigint,
  today_users  bigint,
  week_users   bigint,
  month_users  bigint,
  active_7d    bigint,
  active_30d   bigint,
  zero_credits bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM public.profiles),
    (SELECT COUNT(*)::bigint FROM public.profiles WHERE created_at >= CURRENT_DATE),
    (SELECT COUNT(*)::bigint FROM public.profiles WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    (SELECT COUNT(*)::bigint FROM public.profiles WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'),
    (SELECT COUNT(DISTINCT user_id)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    (SELECT COUNT(DISTINCT user_id)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'),
    (SELECT COUNT(*)::bigint FROM public.profiles WHERE COALESCE(credits, 0) = 0);
$$;

CREATE OR REPLACE FUNCTION public.get_daily_signups(days_count integer DEFAULT 30)
RETURNS TABLE (date text, count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(created_at::date, 'YYYY-MM-DD'),
    COUNT(*)::bigint
  FROM public.profiles
  WHERE created_at >= CURRENT_DATE - (days_count || ' days')::INTERVAL
  GROUP BY created_at::date ORDER BY created_at::date;
$$;

CREATE OR REPLACE FUNCTION public.get_top_users_by_videos(limit_count integer DEFAULT 10)
RETURNS TABLE (
  user_id       uuid,
  email         text,
  full_name     text,
  video_count   bigint,
  total_credits integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.full_name, COUNT(v.id)::bigint, p.credits
  FROM public.profiles p
  LEFT JOIN public.videos v ON p.id = v.user_id
  GROUP BY p.id, p.email, p.full_name, p.credits
  ORDER BY COUNT(v.id) DESC
  LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION public.get_video_stats()
RETURNS TABLE (
  total_videos        bigint,
  today_videos        bigint,
  week_videos         bigint,
  month_videos        bigint,
  success_rate        numeric,
  avg_processing_time numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM public.videos),
    (SELECT COUNT(*)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE),
    (SELECT COUNT(*)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'),
    (SELECT COUNT(*)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'),
    100.0::numeric,
    0::numeric;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_videos(days_count integer DEFAULT 30)
RETURNS TABLE (date text, count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    TO_CHAR(created_at::date, 'YYYY-MM-DD'),
    COUNT(*)::bigint
  FROM public.videos
  WHERE created_at >= CURRENT_DATE - (days_count || ' days')::INTERVAL
  GROUP BY created_at::date ORDER BY created_at::date;
$$;

CREATE OR REPLACE FUNCTION public.get_credit_stats()
RETURNS TABLE (
  total_credits_circulation bigint,
  total_credits_purchased   bigint,
  total_credits_granted     bigint,
  avg_credits_per_user      numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(credits), 0)::bigint,
    (
      SELECT COALESCE(SUM(
        CASE WHEN plan = 1 THEN 100 WHEN plan = 3 THEN 300 ELSE 0 END
      ), 0)::bigint
      FROM public.payments WHERE status = 'paid'
    ),
    0::bigint,
    COALESCE(AVG(credits), 0)::numeric
  FROM public.profiles;
$$;

CREATE OR REPLACE FUNCTION public.get_top_credit_buyers(
  period_filter text    DEFAULT 'all',
  limit_count   integer DEFAULT 20
)
RETURNS TABLE (
  user_id              uuid,
  email                text,
  full_name            text,
  total_purchases      bigint,
  total_credits_bought bigint,
  total_spent_paise    bigint,
  last_purchase_at     timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.user_id, pr.email, pr.full_name,
    COUNT(*)::bigint,
    SUM(CASE WHEN p.plan = 1 THEN 100 WHEN p.plan = 3 THEN 300 ELSE 0 END)::bigint,
    SUM(p.amount_paise)::bigint,
    MAX(p.created_at)
  FROM public.payments p
  JOIN public.profiles pr ON p.user_id = pr.id
  WHERE p.status = 'paid'
    AND (
      period_filter = 'all'
      OR (period_filter = 'today' AND p.created_at >= CURRENT_DATE)
      OR (period_filter = 'week'  AND p.created_at >= CURRENT_DATE - INTERVAL '7 days')
      OR (period_filter = 'month' AND p.created_at >= CURRENT_DATE - INTERVAL '30 days')
    )
  GROUP BY p.user_id, pr.email, pr.full_name
  ORDER BY SUM(CASE WHEN p.plan = 1 THEN 100 WHEN p.plan = 3 THEN 300 ELSE 0 END) DESC
  LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION public.get_user_purchase_history(target_user_id uuid)
RETURNS TABLE (
  payment_id    uuid,
  plan          integer,
  plan_name     text,
  credits       integer,
  amount_paise  integer,
  amount_rupees numeric,
  status        text,
  created_at    timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.plan,
    CASE WHEN p.plan = 1 THEN 'Single (1 clip)'
         WHEN p.plan = 3 THEN 'Saver (3 clips)'
         ELSE 'Unknown' END,
    CASE WHEN p.plan = 1 THEN 100
         WHEN p.plan = 3 THEN 300
         ELSE 0 END,
    p.amount_paise,
    (p.amount_paise / 100.0)::numeric,
    p.status, p.created_at
  FROM public.payments p
  WHERE p.user_id = target_user_id
  ORDER BY p.created_at DESC;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10: FUNCTION GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.lock_credits_for_video       TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_locked_credits        TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_video_ready             TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_download_failed         TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_download_success        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_credits        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_downloadable_videos TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_credits            TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_credits            TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 10b: CREDIT_LOCKS TABLE (for credit locking system)
-- ─────────────────────────────────────────────────────────────────────────────

-- Create credit_locks table (separate from locked_credits for different workflow)
CREATE TABLE IF NOT EXISTS public.credit_locks (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id        text NOT NULL,              -- Internal video ID (prep_id or job_id)
    upload_id       text,                       -- Original upload ID
    locked_amount   integer NOT NULL DEFAULT 100,
    locked_at       timestamptz DEFAULT now(),
    expires_at      timestamptz NOT NULL,       -- Auto-unlock time (1 hour)
    retry_count     integer DEFAULT 0,          -- Edit Again attempts used
    max_retries     integer DEFAULT 5,
    status          text DEFAULT 'active' CHECK (status IN ('active', 'released', 'deducted', 'expired')),
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_locks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own credit locks"
    ON public.credit_locks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can insert credit locks"
    ON public.credit_locks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credit locks"
    ON public.credit_locks FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "System can delete expired locks"
    ON public.credit_locks FOR DELETE
    USING (expires_at < now() OR status = 'released');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_locks_user_id ON public.credit_locks(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_locks_video_id ON public.credit_locks(video_id);
CREATE INDEX IF NOT EXISTS idx_credit_locks_expires_at ON public.credit_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_credit_locks_status ON public.credit_locks(status);

-- Add locked_credits column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS locked_credits integer DEFAULT 0;

-- Function to lock credits (returns lock_id)
CREATE OR REPLACE FUNCTION public.lock_credits(
    user_uuid uuid,
    vid_id text,
    upload_vid_id text,
    amount integer DEFAULT 100
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    available integer;
    lock_id uuid;
BEGIN
    -- Check available credits
    SELECT COALESCE(credits, 0) - COALESCE(locked_credits, 0) INTO available
    FROM public.profiles WHERE id = user_uuid;
    
    IF available < amount THEN
        RAISE EXCEPTION 'Insufficient credits. Available: %, Required: %', available, amount;
    END IF;
    
    -- Create lock (expires in 1 hour)
    INSERT INTO public.credit_locks (
        user_id,
        video_id,
        upload_id,
        locked_amount,
        expires_at,
        status
    ) VALUES (
        user_uuid,
        vid_id,
        upload_vid_id,
        amount,
        now() + interval '1 hour',
        'active'
    )
    RETURNING id INTO lock_id;
    
    -- Update profile locked_credits
    UPDATE public.profiles
    SET locked_credits = COALESCE(locked_credits, 0) + amount
    WHERE id = user_uuid;
    
    RETURN lock_id;
END;
$$;

-- Function to release/unlock credits
CREATE OR REPLACE FUNCTION public.release_credit_locks(lock_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    lock_record public.credit_locks%ROWTYPE;
BEGIN
    SELECT * INTO lock_record
    FROM public.credit_locks
    WHERE id = lock_id
    AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Update lock status
    UPDATE public.credit_locks
    SET status = 'released',
        updated_at = now()
    WHERE id = lock_id;
    
    -- Decrease profile locked_credits
    UPDATE public.profiles
    SET locked_credits = GREATEST(COALESCE(locked_credits, 0) - lock_record.locked_amount, 0)
    WHERE id = lock_record.user_id;
    
    RETURN true;
END;
$$;

-- Function to deduct credits (when downloading)
CREATE OR REPLACE FUNCTION public.deduct_credit_locks(lock_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    lock_record public.credit_locks%ROWTYPE;
BEGIN
    SELECT * INTO lock_record
    FROM public.credit_locks
    WHERE id = lock_id
    AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Deduct from profile credits
    UPDATE public.profiles
    SET credits = GREATEST(COALESCE(credits, 0) - lock_record.locked_amount, 0),
        locked_credits = GREATEST(COALESCE(locked_credits, 0) - lock_record.locked_amount, 0)
    WHERE id = lock_record.user_id;
    
    -- Mark lock as deducted
    UPDATE public.credit_locks
    SET status = 'deducted',
        updated_at = now()
    WHERE id = lock_id;
    
    RETURN true;
END;
$$;

-- Function to increment retry count
CREATE OR REPLACE FUNCTION public.increment_retry(lock_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_count integer;
    max_retries integer;
BEGIN
    UPDATE public.credit_locks
    SET retry_count = retry_count + 1,
        updated_at = now()
    WHERE id = lock_id
    AND status = 'active'
    RETURNING retry_count, max_retries INTO new_count, max_retries;
    
    IF new_count > max_retries THEN
        RAISE EXCEPTION 'Maximum retries exceeded';
    END IF;
    
    RETURN max_retries - new_count;
END;
$$;

-- Function to get remaining retries
CREATE OR REPLACE FUNCTION public.get_remaining_retries(lock_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    remaining integer;
BEGIN
    SELECT GREATEST(max_retries - retry_count, 0) INTO remaining
    FROM public.credit_locks
    WHERE id = lock_id;
    
    RETURN COALESCE(remaining, 0);
END;
$$;

-- Function to cleanup expired locks
CREATE OR REPLACE FUNCTION public.cleanup_expired_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    released_count integer := 0;
    lock_record RECORD;
BEGIN
    FOR lock_record IN
        SELECT id, user_id, locked_amount
        FROM public.credit_locks
        WHERE status = 'active'
        AND expires_at < now()
    LOOP
        -- Update lock status
        UPDATE public.credit_locks
        SET status = 'expired',
            updated_at = now()
        WHERE id = lock_record.id;
        
        -- Decrease profile locked_credits
        UPDATE public.profiles
        SET locked_credits = GREATEST(COALESCE(locked_credits, 0) - lock_record.locked_amount, 0)
        WHERE id = lock_record.user_id;
        
        released_count := released_count + 1;
    END LOOP;
    
    RETURN released_count;
END;
$$;

-- Function to get available credits (uses credit_locks table)
CREATE OR REPLACE FUNCTION public.get_available_credits_v2(user_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    total_credits integer;
    locked_credits integer;
BEGIN
    SELECT COALESCE(credits, 0) INTO total_credits
    FROM public.profiles
    WHERE id = user_uuid;
    
    SELECT COALESCE(SUM(locked_amount), 0) INTO locked_credits
    FROM public.credit_locks
    WHERE user_id = user_uuid
    AND status = 'active'
    AND expires_at > now();
    
    RETURN GREATEST(total_credits - locked_credits, 0);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.lock_credits TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_credit_locks TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_retry TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_remaining_retries TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_credits_v2 TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 11: BACKFILL EXISTING USERS & SET ADMINS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.profiles (id, email, full_name, avatar_url)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users
WHERE email IN ('athul.boban18@gmail.com', 'aaeclip@gmail.com')
ON CONFLICT DO NOTHING;

UPDATE public.profiles
SET role = 'admin'
WHERE email IN ('athul.boban18@gmail.com', 'aaeclip@gmail.com');


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 12: VERIFY
-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'profiles'       AS table_name, COUNT(*) AS row_count FROM public.profiles
UNION ALL
SELECT 'admin_users',                  COUNT(*)              FROM public.admin_users
UNION ALL
SELECT 'videos',                       COUNT(*)              FROM public.videos
UNION ALL
SELECT 'payments',                     COUNT(*)              FROM public.payments
UNION ALL
SELECT 'feedbacks',                    COUNT(*)              FROM public.feedbacks
UNION ALL
SELECT 'locked_credits',               COUNT(*)              FROM public.locked_credits
UNION ALL
SELECT 'credit_locks',                 COUNT(*)              FROM public.credit_locks;

SELECT p.email, p.role, 'YES' AS in_admin_table
FROM public.admin_users au
JOIN public.profiles p ON au.user_id = p.id;

-- =============================================================================
-- DONE! Your Obula Supabase database is fully set up.
--
-- Permission summary:
--   • Any admin  → view all users/videos/payments/feedbacks, adjust credits
--   • Super admin only (athul.boban18@gmail.com) → grant/revoke admin roles
--
-- Frontend usage:
--   supabase.rpc('admin_add_credits', { target_user_id: '...', amount: 100 })
--   supabase.rpc('admin_set_credits', { target_user_id: '...', new_credits: 300 })
--   supabase.rpc('grant_admin',  { target_user_id: '...' })  // super admin only
--   supabase.rpc('revoke_admin', { target_user_id: '...' })  // super admin only
--
-- Optional pg_cron for auto-cleanup:
--   SELECT cron.schedule('cleanup-expired-videos', '* * * * *', 'SELECT cleanup_expired_videos()');
-- =============================================================================