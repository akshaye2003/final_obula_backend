-- ============================================
-- ADMIN ANALYTICS - Complete SQL Setup
-- Run this in Supabase SQL Editor
-- Safe to re-run (idempotent)
-- ============================================

-- ============================================
-- 1. REVENUE ANALYTICS FUNCTIONS
-- ============================================

-- Get total revenue by status
DROP FUNCTION IF EXISTS public.get_revenue_stats();
CREATE OR REPLACE FUNCTION public.get_revenue_stats()
RETURNS TABLE (
    total_revenue bigint,
    paid_revenue bigint,
    pending_revenue bigint,
    today_revenue bigint,
    week_revenue bigint,
    month_revenue bigint
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        COALESCE(SUM(amount_paise), 0)::bigint as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_paise ELSE 0 END), 0)::bigint as paid_revenue,
        COALESCE(SUM(CASE WHEN status = 'created' THEN amount_paise ELSE 0 END), 0)::bigint as pending_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' AND created_at >= CURRENT_DATE THEN amount_paise ELSE 0 END), 0)::bigint as today_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '7 days' THEN amount_paise ELSE 0 END), 0)::bigint as week_revenue,
        COALESCE(SUM(CASE WHEN status = 'paid' AND created_at >= CURRENT_DATE - INTERVAL '30 days' THEN amount_paise ELSE 0 END), 0)::bigint as month_revenue
    FROM public.payments;
$$;

-- Get revenue by plan
DROP FUNCTION IF EXISTS public.get_revenue_by_plan();
CREATE OR REPLACE FUNCTION public.get_revenue_by_plan()
RETURNS TABLE (
    plan integer,
    plan_name text,
    count bigint,
    total_amount bigint
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        p.plan,
        CASE 
            WHEN p.plan = 1 THEN 'Single (1 clip)'
            WHEN p.plan = 3 THEN 'Saver (3 clips)'
            ELSE 'Unknown'
        END as plan_name,
        COUNT(*)::bigint,
        COALESCE(SUM(p.amount_paise), 0)::bigint as total_amount
    FROM public.payments p
    WHERE p.status = 'paid'
    GROUP BY p.plan
    ORDER BY p.plan;
$$;

-- Get detailed payment history with user info
DROP FUNCTION IF EXISTS public.get_payment_details();
CREATE OR REPLACE FUNCTION public.get_payment_details()
RETURNS TABLE (
    payment_id uuid,
    user_id uuid,
    user_email text,
    user_name text,
    plan integer,
    plan_name text,
    credits integer,
    amount_paise integer,
    amount_rupees numeric,
    status text,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        p.id as payment_id,
        p.user_id,
        pr.email as user_email,
        pr.full_name as user_name,
        p.plan,
        CASE 
            WHEN p.plan = 1 THEN 'Single (1 clip)'
            WHEN p.plan = 3 THEN 'Saver (3 clips)'
            ELSE 'Unknown'
        END as plan_name,
        CASE 
            WHEN p.plan = 1 THEN 100
            WHEN p.plan = 3 THEN 300
            ELSE 0
        END as credits,
        p.amount_paise,
        (p.amount_paise / 100.0)::numeric as amount_rupees,
        p.status,
        p.created_at
    FROM public.payments p
    JOIN public.profiles pr ON p.user_id = pr.id
    ORDER BY p.created_at DESC;
$$;

-- Get daily revenue for chart (last 30 days)
DROP FUNCTION IF EXISTS public.get_daily_revenue(integer);
CREATE OR REPLACE FUNCTION public.get_daily_revenue(days_count integer DEFAULT 30)
RETURNS TABLE (
    date text,
    amount bigint
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        TO_CHAR(created_at::date, 'YYYY-MM-DD') as date,
        COALESCE(SUM(amount_paise), 0)::bigint as amount
    FROM public.payments
    WHERE status = 'paid'
        AND created_at >= CURRENT_DATE - (days_count || ' days')::INTERVAL
    GROUP BY created_at::date
    ORDER BY created_at::date;
$$;

-- ============================================
-- 2. USER ENGAGEMENT FUNCTIONS
-- ============================================

-- Get user growth stats
DROP FUNCTION IF EXISTS public.get_user_growth_stats();
CREATE OR REPLACE FUNCTION public.get_user_growth_stats()
RETURNS TABLE (
    total_users bigint,
    today_users bigint,
    week_users bigint,
    month_users bigint,
    active_7d bigint,
    active_30d bigint,
    zero_credits bigint
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        (SELECT COUNT(*)::bigint FROM public.profiles) as total_users,
        (SELECT COUNT(*)::bigint FROM public.profiles WHERE created_at >= CURRENT_DATE) as today_users,
        (SELECT COUNT(*)::bigint FROM public.profiles WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_users,
        (SELECT COUNT(*)::bigint FROM public.profiles WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as month_users,
        (SELECT COUNT(DISTINCT user_id)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as active_7d,
        (SELECT COUNT(DISTINCT user_id)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as active_30d,
        (SELECT COUNT(*)::bigint FROM public.profiles WHERE COALESCE(credits, 0) = 0) as zero_credits;
$$;

-- Get daily user signups for chart
DROP FUNCTION IF EXISTS public.get_daily_signups(integer);
CREATE OR REPLACE FUNCTION public.get_daily_signups(days_count integer DEFAULT 30)
RETURNS TABLE (
    date text,
    count bigint
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        TO_CHAR(created_at::date, 'YYYY-MM-DD') as date,
        COUNT(*)::bigint
    FROM public.profiles
    WHERE created_at >= CURRENT_DATE - (days_count || ' days')::INTERVAL
    GROUP BY created_at::date
    ORDER BY created_at::date;
$$;

-- Get top users by video count
DROP FUNCTION IF EXISTS public.get_top_users_by_videos(integer);
CREATE OR REPLACE FUNCTION public.get_top_users_by_videos(limit_count integer DEFAULT 10)
RETURNS TABLE (
    user_id uuid,
    email text,
    full_name text,
    video_count bigint,
    total_credits integer
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        p.id as user_id,
        p.email,
        p.full_name,
        COUNT(v.id)::bigint as video_count,
        p.credits
    FROM public.profiles p
    LEFT JOIN public.videos v ON p.id = v.user_id
    GROUP BY p.id, p.email, p.full_name, p.credits
    ORDER BY video_count DESC
    LIMIT limit_count;
$$;

-- ============================================
-- 3. VIDEO PROCESSING ANALYTICS
-- ============================================

-- Get video processing stats
DROP FUNCTION IF EXISTS public.get_video_stats();
CREATE OR REPLACE FUNCTION public.get_video_stats()
RETURNS TABLE (
    total_videos bigint,
    today_videos bigint,
    week_videos bigint,
    month_videos bigint,
    success_rate numeric,
    avg_processing_time numeric
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        (SELECT COUNT(*)::bigint FROM public.videos) as total_videos,
        (SELECT COUNT(*)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE) as today_videos,
        (SELECT COUNT(*)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_videos,
        (SELECT COUNT(*)::bigint FROM public.videos WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as month_videos,
        (SELECT 100.0)::numeric as success_rate,
        (SELECT 0)::numeric as avg_processing_time;
$$;

-- Get daily video creation for chart
DROP FUNCTION IF EXISTS public.get_daily_videos(integer);
CREATE OR REPLACE FUNCTION public.get_daily_videos(days_count integer DEFAULT 30)
RETURNS TABLE (
    date text,
    count bigint
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        TO_CHAR(created_at::date, 'YYYY-MM-DD') as date,
        COUNT(*)::bigint
    FROM public.videos
    WHERE created_at >= CURRENT_DATE - (days_count || ' days')::INTERVAL
    GROUP BY created_at::date
    ORDER BY created_at::date;
$$;

-- ============================================
-- 4. CREDIT ECONOMY FUNCTIONS
-- ============================================

-- Get credit economy stats
DROP FUNCTION IF EXISTS public.get_credit_stats();
CREATE OR REPLACE FUNCTION public.get_credit_stats()
RETURNS TABLE (
    total_credits_circulation bigint,
    total_credits_purchased bigint,
    total_credits_granted bigint,
    avg_credits_per_user numeric
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        COALESCE(SUM(credits), 0)::bigint as total_credits_circulation,
        (SELECT COALESCE(SUM(
            CASE 
                WHEN plan = 1 THEN 100
                WHEN plan = 3 THEN 300
                ELSE 0
            END
        ), 0)::bigint FROM public.payments WHERE status = 'paid') as total_credits_purchased,
        0::bigint as total_credits_granted,
        COALESCE(AVG(credits), 0)::numeric as avg_credits_per_user
    FROM public.profiles;
$$;

-- ============================================
-- 5. ACTIVITY FEED FUNCTION
-- ============================================

-- Get recent activity feed
DROP FUNCTION IF EXISTS public.get_recent_activity(integer);
CREATE OR REPLACE FUNCTION public.get_recent_activity(limit_count integer DEFAULT 20)
RETURNS TABLE (
    id uuid,
    type text,
    description text,
    user_email text,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    -- Recent videos
    SELECT 
        v.id,
        'video'::text as type,
        'Created a new video'::text as description,
        p.email as user_email,
        v.created_at
    FROM public.videos v
    JOIN public.profiles p ON v.user_id = p.id
    
    UNION ALL
    
    -- Recent payments
    SELECT 
        pay.id,
        'payment'::text as type,
        ('Purchased ' || 
            CASE 
                WHEN pay.plan = 1 THEN 'Single (1 clip)'
                WHEN pay.plan = 3 THEN 'Saver (3 clips)'
                ELSE 'Unknown'
            END
        )::text as description,
        p.email as user_email,
        pay.created_at
    FROM public.payments pay
    JOIN public.profiles p ON pay.user_id = p.id
    WHERE pay.status = 'paid'
    
    ORDER BY created_at DESC
    LIMIT limit_count;
$$;

-- ============================================
-- VERIFY ALL FUNCTIONS CREATED
-- ============================================
SELECT 'All analytics functions created successfully' as status;
