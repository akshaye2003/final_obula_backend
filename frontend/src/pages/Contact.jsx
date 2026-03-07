import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { m } from 'framer-motion';
import LandingNav from '../components/LandingNav.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../api/client.js';

export default function Contact() {
  const navigate = useNavigate();
  const { isAuthenticated, user, profile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated && !localStorage.getItem('supabase.auth.token')) {
      navigate('/signin', { state: { from: '/contact', message: 'Please sign in to send feedback' } });
    }
  }, [isAuthenticated, navigate]);

  // Auto-fill name and email from profile
  useEffect(() => {
    if (profile) {
      setName(profile.full_name || user?.email?.split('@')[0] || '');
      setEmail(user?.email || '');
    } else if (user?.email) {
      setEmail(user.email);
      setName(user.email.split('@')[0]);
    }
  }, [profile, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!message.trim()) {
      setError('Please enter a message');
      return;
    }
    if (message.length > 5000) {
      setError('Message too long (max 5000 characters)');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/contact', {
        name: name.trim(),
        message: message.trim(),
      });
      setResult('Thank you! Your feedback has been submitted.');
      setMessage('');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(detail || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white font-body flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white/50">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-body">
      <LandingNav />

      <main className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-2xl mx-auto">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <span className="text-primary text-xs font-semibold uppercase tracking-[0.2em] mb-3 block">
            Contact
          </span>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight font-display">
            Get in touch
          </h1>
          <p className="text-white/50 mt-3 max-w-md mx-auto">
            Questions, feedback, or partnership ideas? We'd love to hear from you.
          </p>
        </m.div>

        <m.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-primary/50 focus:outline-none transition-colors"
              required
            />
          </div>

          {/* Email - LOCKED to user's email */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              readOnly
              disabled
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-white/50 cursor-not-allowed"
              title="Email is locked to your account"
            />
            <p className="text-white/30 text-xs mt-1">Email is linked to your account and cannot be changed</p>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help? Describe your issue, suggestion, or question..."
              rows={5}
              maxLength={5000}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-primary/50 focus:outline-none transition-colors resize-none"
              required
            />
            <div className="flex justify-between mt-1">
              <span className="text-white/30 text-xs">
                {message.length}/5000 characters
              </span>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-white font-semibold py-3.5 rounded-xl hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {submitting ? 'Sending...' : 'Send message'}
          </button>

          {/* Success/Error messages */}
          {result && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-center text-sm"
            >
              {result}
            </m.div>
          )}
          {error && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center text-sm"
            >
              {error}
            </m.div>
          )}
        </m.form>
      </main>
    </div>
  );
}
