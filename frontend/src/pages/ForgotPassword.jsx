import { useState } from 'react';
import { Link } from 'react-router-dom';
import { m } from 'framer-motion';
import LandingNav from '../components/LandingNav.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
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
            <h1 className="text-4xl sm:text-5xl font-bold mb-3 tracking-tight text-white font-display">OBULA</h1>
            <p className="text-white/60 text-base">Reset your password</p>
          </div>

          <div className="rounded-2xl p-8 sm:p-10 backdrop-blur-xl border border-white/[0.08] bg-white/[0.03]">
            {sent ? (
              <div className="text-center space-y-4">
                <p className="text-green-400 text-sm">
                  Check your inbox — we sent a reset link to <strong>{email}</strong>.
                </p>
                <Link
                  to="/signin"
                  className="block w-full py-3 text-base bg-primary text-white font-semibold rounded-xl text-center hover:bg-primary-dark transition-colors"
                >
                  Back to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-primary transition"
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-base bg-primary text-white font-semibold rounded-xl transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-white/50 text-sm mt-8">
            <Link to="/signin" className="text-white/80 hover:text-white transition font-medium">
              Back to Sign In
            </Link>
          </p>
        </m.div>
      </div>
    </div>
  );
}
