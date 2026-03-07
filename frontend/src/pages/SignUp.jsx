import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import LandingNav from '../components/LandingNav.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function SignUp() {
  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await signUp({ email: form.email, password: form.password, fullName: form.fullName });
      setInfo('Check your email for a confirmation link, then sign in.');
    } catch (err) {
      setError(err.message || 'Sign-up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    try {
      await signInWithGoogle(); // redirects away — no state update needed
    } catch (err) {
      setError(err.message ?? 'Google sign-in failed.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-body">
      <LandingNav />
      <div className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <h1 className="text-4xl sm:text-5xl font-bold mb-3 tracking-tight text-white font-display inline-flex items-center justify-center gap-3">
              <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
              OBULA
            </h1>
            <p className="text-white/60 text-base">Create your account</p>
          </div>

          <div className="rounded-2xl p-8 sm:p-10 backdrop-blur-xl border border-white/[0.08] bg-white/[0.03]">
            {info ? (
              <div className="text-center space-y-4">
                <p className="text-green-400 text-sm">{info}</p>
                <Link
                  to="/signin"
                  className="block w-full py-3 text-base bg-primary text-white font-semibold rounded-xl text-center transition-colors hover:bg-primary-dark"
                >
                  Go to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Full name</label>
                  <input
                    type="text"
                    name="fullName"
                    value={form.fullName}
                    onChange={update}
                    placeholder="Jane Doe"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={update}
                    placeholder="jane@example.com"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Password</label>
                  <input
                    type="password"
                    name="password"
                    required
                    value={form.password}
                    onChange={update}
                    placeholder="At least 6 characters"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Confirm password</label>
                  <input
                    type="password"
                    name="confirm"
                    required
                    value={form.confirm}
                    onChange={update}
                    placeholder="Repeat password"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-primary transition"
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-base bg-primary text-white font-semibold rounded-xl transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating account…' : 'Create account'}
                </button>

                <div className="relative flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-white/30 text-xs uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogle}
                  className="w-full py-3 flex items-center justify-center gap-3 bg-white text-[#0a0a0a] font-semibold rounded-xl transition-opacity hover:opacity-90"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-white/50 text-sm mt-8">
            Already have an account?{' '}
            <Link to="/signin" className="text-white/80 hover:text-white transition font-medium">
              Sign in
            </Link>
          </p>
        </m.div>
      </div>
    </div>
  );
}
