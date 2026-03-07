-- ============================================
-- CREDIT LOCKS SYSTEM
-- For locking credits during video processing/editing
-- ============================================

-- Create credit_locks table
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

-- Function to calculate available credits
CREATE OR REPLACE FUNCTION public.get_available_credits(user_uuid uuid)
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

-- Function to lock credits
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
    SELECT public.get_available_credits(user_uuid) INTO available;
    
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
CREATE OR REPLACE FUNCTION public.release_credits(lock_id uuid)
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
CREATE OR REPLACE FUNCTION public.deduct_locked_credits(lock_id uuid)
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

-- Function to cleanup expired locks (call on server startup or via cron)
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_available_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_credits(uuid, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_locked_credits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_retry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_remaining_retries(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_locks() TO authenticated;

SELECT 'Credit locks system created successfully' as status;
