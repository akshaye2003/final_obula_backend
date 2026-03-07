-- ============================================
-- TOP CREDIT BUYERS FUNCTION
-- Add this to your Supabase SQL Editor
-- ============================================

-- Get top credit buyers with filter by time period
DROP FUNCTION IF EXISTS public.get_top_credit_buyers(text, integer);
CREATE OR REPLACE FUNCTION public.get_top_credit_buyers(
    period_filter text DEFAULT 'all',
    limit_count integer DEFAULT 20
)
RETURNS TABLE (
    user_id uuid,
    email text,
    full_name text,
    total_purchases bigint,
    total_credits_bought bigint,
    total_spent_paise bigint,
    last_purchase_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        p.user_id,
        pr.email,
        pr.full_name,
        COUNT(*)::bigint as total_purchases,
        SUM(CASE 
            WHEN p.plan = 1 THEN 100
            WHEN p.plan = 3 THEN 300
            ELSE 0
        END)::bigint as total_credits_bought,
        SUM(p.amount_paise)::bigint as total_spent_paise,
        MAX(p.created_at) as last_purchase_at
    FROM public.payments p
    JOIN public.profiles pr ON p.user_id = pr.id
    WHERE p.status = 'paid'
        AND (
            period_filter = 'all'
            OR (period_filter = 'today' AND p.created_at >= CURRENT_DATE)
            OR (period_filter = 'week' AND p.created_at >= CURRENT_DATE - INTERVAL '7 days')
            OR (period_filter = 'month' AND p.created_at >= CURRENT_DATE - INTERVAL '30 days')
        )
    GROUP BY p.user_id, pr.email, pr.full_name
    ORDER BY total_credits_bought DESC
    LIMIT limit_count;
$$;

-- Get purchase history for a specific user
DROP FUNCTION IF EXISTS public.get_user_purchase_history(uuid);
CREATE OR REPLACE FUNCTION public.get_user_purchase_history(target_user_id uuid)
RETURNS TABLE (
    payment_id uuid,
    plan integer,
    plan_name text,
    credits integer,
    amount_rupees numeric,
    status text,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        p.id as payment_id,
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
        (p.amount_paise / 100.0)::numeric as amount_rupees,
        p.status,
        p.created_at
    FROM public.payments p
    WHERE p.user_id = target_user_id
        AND p.status = 'paid'
    ORDER BY p.created_at DESC;
$$;

-- Get all user video stats (for user manager)
DROP FUNCTION IF EXISTS public.get_all_user_video_stats();
CREATE OR REPLACE FUNCTION public.get_all_user_video_stats()
RETURNS TABLE (
    user_id uuid,
    video_count bigint,
    last_video_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
    SELECT 
        v.user_id,
        COUNT(*)::bigint as video_count,
        MAX(v.created_at) as last_video_at
    FROM public.videos v
    GROUP BY v.user_id;
$$;

SELECT 'Top buyers functions created successfully' as status;
