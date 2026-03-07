import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { m } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function CompleteProfile() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Enter a valid phone number (at least 10 digits).');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({ phone: phone.trim() })
        .eq('id', user.id);

      if (err) {
        if (err.message?.includes('profiles_phone_unique') || err.code === '23505') {
          setError('This phone number is already linked to another account.');
        } else {
          setError(err.message || 'Failed to save phone number.');
        }
        return;
      }

      await refreshProfile();
      const from = location.state?.from?.pathname || '/upload';
      navigate(from, { replace: true });
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4 font-body">
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-white font-display mb-3">OBULA</h1>
          <p className="text-white/60 text-base">One last step — add your phone number</p>
          <p className="text-white/35 text-sm mt-2">
            We use this to link your account and prevent duplicate sign-ups.
          </p>
        </div>

        <div className="rounded-2xl p-8 backdrop-blur-xl border border-white/[0.08] bg-white/[0.03]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-1">Phone number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                autoFocus
                className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-primary transition"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-base bg-primary text-white font-semibold rounded-xl transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving…' : 'Continue'}
            </button>
          </form>
        </div>
      </m.div>
    </div>
  );
}
