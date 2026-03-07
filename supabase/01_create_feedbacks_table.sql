-- ============================================
-- CREATE FEEDBACKS TABLE
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS public.feedbacks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL,
    email       text NOT NULL,
    message     text NOT NULL,
    status      text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
    created_at  timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
    ON public.feedbacks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own feedback
CREATE POLICY "Users can view own feedback"
    ON public.feedbacks FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Admins can view all feedbacks
CREATE POLICY "Admins can view all feedbacks"
    ON public.feedbacks FOR SELECT
    USING (check_is_admin());

-- Policy: Admins can update feedback status
CREATE POLICY "Admins can update feedbacks"
    ON public.feedbacks FOR UPDATE
    USING (check_is_admin());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON public.feedbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON public.feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON public.feedbacks(created_at DESC);

-- Verify
SELECT 'feedbacks table created successfully' as status;
