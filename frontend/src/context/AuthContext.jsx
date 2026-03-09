import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { setTokenGetter } from '../api/client.js';
import { getCreditsStatus } from '../api/credits.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdminState, setIsAdminState] = useState(false);
  // In dev mode, "signed out" state so Sign out actually works
  const [devSignedOut, setDevSignedOut] = useState(false);
  // In dev mode, skip loading so we can access protected routes immediately
  const [loading, setLoading] = useState(!import.meta.env.DEV);

  const loadUser = useCallback(async (userId) => {
    try {
      // Check admin status via security definer function (bypasses RLS safely)
      const { data: isAdminResult, error: adminErr } = await supabase
        .rpc('check_is_admin');
      if (import.meta.env.DEV) console.log('[AuthContext] check_is_admin:', isAdminResult, 'error:', adminErr);
      setIsAdminState(!!isAdminResult);

      // Fetch full profile
      const { data: profileRow, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (import.meta.env.DEV) console.log('[AuthContext] profiles result:', profileRow, 'error:', profileErr);

      // Fetch credit status to get locked credits (from locked_credits table via API)
      let creditStatus = null;
      try {
        creditStatus = await getCreditsStatus();
      } catch (creditErr) {
        if (import.meta.env.DEV) console.error('[AuthContext] getCreditsStatus error:', creditErr);
      }

      // Calculate locked credits from active locks returned by API
      // Note: overal.sql stores locked credits in locked_credits table, not profiles column
      const lockedCredits = creditStatus?.locked_credits ?? 
        (creditStatus?.active_locks?.reduce((sum, lock) => sum + (lock.amount || 0), 0) ?? 0);
      const totalCredits = profileRow?.credits ?? 0;
      
      // Merge locked_credits into profile
      const mergedProfile = {
        ...profileRow,
        locked_credits: lockedCredits,
        available_credits: creditStatus?.available_credits ?? Math.max(0, totalCredits - lockedCredits),
      };
      
      setProfile(mergedProfile ?? null);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AuthContext] loadUser error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUser(s.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setLoading(true);
        loadUser(s.user.id);
      } else {
        setProfile(null);
        setIsAdminState(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUser]);

  // ── Auth actions ──────────────────────────────────────────────────────────

  const signUp = useCallback(async ({ email, password, fullName, phone }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone: phone || null } },
    });
    if (error) throw error;
    return data;
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (import.meta.env.DEV) {
      setDevSignedOut(true);
      setSession(null);
      setUser(null);
      setProfile(null);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) throw error;
  }, []);

  // In dev: "sign in" as dev (clears devSignedOut so you can use the app again)
  const loginAsDev = useCallback(() => {
    if (import.meta.env.DEV) setDevSignedOut(false);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  // Keep the backend API client in sync with the Supabase session token
  useEffect(() => {
    setTokenGetter(() => {
      if (devSignedOut && (import.meta.env.DEV || (typeof window !== 'undefined' && ['localhost','127.0.0.1'].includes(window.location?.hostname || '')))) return null;
      if (session?.access_token) return session.access_token;
      if (import.meta.env.DEV) return 'dev-token-xyz';
      if (typeof window !== 'undefined' && ['localhost','127.0.0.1'].includes(window.location?.hostname || '')) return 'dev-token-xyz';
      return null;
    });
  }, [session, devSignedOut]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadUser(user.id);
  }, [user, loadUser]);

  // Dev bypass: treat as authenticated for local testing (no Supabase sign-in needed)
  // In dev, respect devSignedOut so Sign out actually works
  const isAuthenticated = import.meta.env.DEV ? !devSignedOut : !!session;
  const isAdmin = isAdminState;
  // True when user is logged in but hasn't linked a phone yet (blocks access until added)
  const needsPhone = isAuthenticated && !loading && profile !== null && !profile?.phone;

  // Debug output for auth state
  useEffect(() => {
    console.log('[AuthContext] State changed:', { isAuthenticated, user: user?.email, loading, sessionExists: !!session });
  }, [isAuthenticated, user, loading, session]);

  const value = {
    session,
    user,
    profile,
    loading,
    isAuthenticated,
    isAdmin,
    needsPhone,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    refreshProfile,
    login: signIn,
    logout: signOut,
    loginAsDev,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
