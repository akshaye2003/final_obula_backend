# Supabase SQL Setup for Admin, Feedback & Analytics

This directory contains SQL files to set up the admin dashboard, feedback system, and analytics for Obula.

## Setup Order

Run these files in order in your Supabase SQL Editor:

### 1. `01_create_feedbacks_table.sql`
Creates the feedbacks table for user messages to admin.

### 2. `02_check_is_admin_function.sql`
Creates the `check_is_admin()` function required by AuthContext.jsx to verify admin status.

### 3. `03_admin_analytics_functions.sql`
Creates all analytics functions for the admin dashboard:
- Revenue stats (get_revenue_stats, get_revenue_by_plan, get_payment_details, get_daily_revenue)
- User engagement (get_user_growth_stats, get_daily_signups, get_top_users_by_videos)
- Video analytics (get_video_stats, get_daily_videos)
- Credit economy (get_credit_stats)
- Activity feed (get_recent_activity)

### 4. `04_top_buyers_function.sql`
Creates functions for top credit buyers and user purchase history.

### 5. `05_fix_admin_rls_policies.sql`
Fixes RLS policies so admins can view all user profiles without recursion errors.

## Admin Dashboard Tabs

After running these SQL files, the admin dashboard (`/admin`) will have 6 tabs:

1. **Revenue** - Revenue stats, top buyers, payment history
2. **Users** - User growth, active users, top users by videos
3. **Videos** - Video processing statistics
4. **Credits** - Credit economy, zero-credit users
5. **Manage** - User list, grant credits, change roles
6. **Feedbacks** - View and manage user feedbacks

## Making a User Admin

Run this in Supabase SQL Editor:

```sql
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

Or use the `make_admin.sql` file from the source directory.

## API Endpoints

These SQL functions are used by the following API endpoints:

- `GET /api/admin/analytics/revenue` → get_revenue_stats, get_revenue_by_plan
- `GET /api/admin/analytics/payments` → get_payment_details
- `GET /api/admin/analytics/top-buyers` → get_top_credit_buyers
- `GET /api/admin/analytics/user-purchases/{id}` → get_user_purchase_history
- `GET /api/admin/analytics/users` → get_user_growth_stats, get_top_users_by_videos
- `GET /api/admin/analytics/videos` → get_video_stats
- `GET /api/admin/analytics/credits` → get_credit_stats
- `GET /api/admin/analytics/activity` → get_recent_activity
- `GET /api/admin/users` + grant credits → get_all_user_video_stats

## Required Environment Variables

Make sure your backend has these environment variables:

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
```
