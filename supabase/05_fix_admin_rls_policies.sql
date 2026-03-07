-- ============================================
-- FIX ADMIN RLS POLICIES
-- Fixes the recursive RLS policy that prevents admins from seeing all users
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================

-- Step 1: Drop existing broken policies
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Step 2: Create a security definer function that bypasses RLS to check admin role
-- (This function already exists if you ran 02_check_is_admin_function.sql)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Step 3: Recreate policies using the function instead
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin() OR auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin() OR auth.uid() = id);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

SELECT 'Admin RLS policies fixed successfully' as status;
