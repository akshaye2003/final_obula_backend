import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

/**
 * Landing page for Supabase OAuth redirects (e.g. Google sign-in).
 * Supabase appends the session tokens in the URL hash; the client SDK
 * reads them automatically on mount. We just wait for the session and
 * then forward the user to the app.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      navigate(session ? '/upload' : '/signin', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
