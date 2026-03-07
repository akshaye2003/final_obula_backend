import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { m, motion } from 'framer-motion';
import LandingNav from '../components/LandingNav.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMobile } from '../hooks/useMobile.js';
import apiClient from '../api/client.js';

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const PLANS = [
  {
    id: 1,
    name: 'Single',
    price: '₹99',
    credits: 100,
    paise: 9900,
    description: '100 credits (1 clip)',
    features: [
      '1 AI-generated clip',
      'Auto captions with word-level timing',
      'Smart B-roll insertion',
      '1080p HD export',
      'Up to 1 min 30 sec clips',
      'Multi-format exports (9:16, 1:1, 16:9)',
      'AI viral moment detection',
      'Word-level caption styling',
      'Red "HOOK" captions for brand names',
      'Noise isolation (clean audio)',
      'Credits never expire',
    ],
    highlight: false,
  },
  {
    id: 3,
    name: 'Pack',
    price: '₹199',
    credits: 300,
    paise: 19900,
    description: '300 credits (3 clips)',
    features: [
      '3 AI-generated clips',
      'Auto captions with word-level timing',
      'Smart B-roll insertion',
      '1080p HD export',
      'Up to 1 min 30 sec clips',
      'Multi-format exports (9:16, 1:1, 16:9)',
      'AI viral moment detection',
      'Word-level caption styling',
      'Red "HOOK" captions for brand names',
      'Noise isolation (clean audio)',
      'Credits never expire',
      'Save ₹98 vs single',
    ],
    highlight: true,
  },
];

// Animated counter hook
function useCounter(end, duration = 2000) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const startTimeRef = useRef(null);

  useEffect(() => {
    const endNum = parseInt(end.replace(/\D/g, ''));
    const startTime = performance.now();
    startTimeRef.current = startTime;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(endNum * easeOut);
      
      countRef.current = current;
      setCount(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return count;
}

// Feature item component with checkmark
function FeatureItem({ text, highlight = false }) {
  return (
    <motion.div 
      className="flex items-start gap-3"
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
    >
      <svg 
        className="w-5 h-5 mt-0.5 shrink-0" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke={highlight ? '#C9A962' : '#4ade80'}
        strokeWidth={2.5}
      >
        <motion.path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          d="M5 13l4 4L19 7"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        />
      </svg>
      <span className={highlight ? 'text-[#C9A962] font-medium' : 'text-white/70 text-sm'}>
        {text}
      </span>
    </motion.div>
  );
}

// Floating particles component
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-[#C9A962]"
          style={{
            left: `${20 + i * 15}%`,
            top: `${30 + (i % 3) * 20}%`,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.2, 0.8, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Animated price component
function AnimatedPrice({ price, inView }) {
  const numericPrice = useCounter(price, 1500);
  
  return (
    <span className="text-6xl font-bold text-white tracking-tight tabular-nums">
      ₹{numericPrice}
    </span>
  );
}

export default function Pricing() {
  const { isAuthenticated, user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [buying, setBuying] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');
  const [cardsInView, setCardsInView] = useState([false, false]);
  const [selectedPlanId, setSelectedPlanId] = useState(1);

  const handleBuy = async (plan) => {
    if (!isAuthenticated) {
      navigate('/signin', { state: { from: '/pricing' } });
      return;
    }

    setBuying(plan.id);
    setError('');

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError('Could not load payment gateway. Check your connection.');
      setBuying(null);
      return;
    }

    let order;
    try {
      const { data } = await apiClient.post('/api/payments/create-order', { plan: plan.id });
      order = data;
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to create order. Try again.');
      setBuying(null);
      return;
    }

    const options = {
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'Obula',
      description: order.description,
      order_id: order.order_id,
      prefill: { email: user?.email || '' },
      theme: { color: '#d4a853' },
      modal: { ondismiss: () => setBuying(null) },
      handler: async (response) => {
        try {
          await apiClient.post('/api/payments/verify', {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          });
          await refreshProfile();
          setSuccess(plan);
        } catch (err) {
          setError('Payment received but verification failed. Contact support.');
        } finally {
          setBuying(null);
        }
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', () => {
      setError('Payment failed. Please try again.');
      setBuying(null);
    });
    rzp.open();
  };

  const credits = profile?.credits ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-body">
      <LandingNav />
      <main className="flex-1 pt-20 sm:pt-28 pb-12 sm:pb-20 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>

          <div className="text-center mb-6 sm:mb-12">
            <motion.p 
              className="text-[#C9A962] text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] mb-2 sm:mb-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Pricing
            </motion.p>
            <motion.h1 
              className="text-3xl sm:text-6xl font-bold text-white mb-2 sm:mb-3 tracking-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Pay per clip
            </motion.h1>
            <motion.p 
              className="text-white/60 text-base sm:text-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              No subscription. Buy credits, use them anytime.
            </motion.p>
            {isAuthenticated && (
              <motion.p 
                className="mt-2 sm:mt-3 text-white/40 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                You have <span className="text-[#C9A962] font-semibold">{credits} credit{credits !== 1 ? 's' : ''}</span> remaining
              </motion.p>
            )}
          </div>

          {success && (
            <m.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`mb-6 sm:mb-8 rounded-2xl border border-green-500/30 bg-green-500/10 text-center space-y-2 ${
                isMobile ? 'p-4' : 'p-5'
              }`}
            >
              <p className="text-green-400 font-semibold text-lg">Payment successful!</p>
              <p className="text-white/60 text-sm">{success.credits} credit{success.credits > 1 ? 's' : ''} added to your account.</p>
              <Link to="/upload" className="inline-block mt-2 px-6 py-2.5 bg-[#C9A962] text-[#0A0A0C] font-semibold rounded-xl hover:bg-[#D4AF37] transition-colors text-sm">
                Create a clip now
              </Link>
            </m.div>
          )}

          {error && (
            <div className="mb-8 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {isMobile && (
            <div className="flex p-1 rounded-full bg-white/[0.04] border border-white/[0.08] mb-6 max-w-[280px] mx-auto">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`flex-1 min-h-[42px] rounded-full text-sm font-semibold touch-manipulation transition-colors ${
                    selectedPlanId === plan.id ? 'bg-gradient-accent text-[#0A0A0C]' : 'text-white/50'
                  }`}
                >
                  {plan.name}
                </button>
              ))}
            </div>
          )}

          <div className={`grid sm:grid-cols-2 ${isMobile ? 'gap-5' : 'gap-8'}`} style={{ perspective: '1500px' }}>
            {(isMobile ? PLANS.filter((p) => p.id === selectedPlanId) : PLANS).map((plan) => {
              const index = PLANS.findIndex((p) => p.id === plan.id);
              return (
              <m.div
                key={plan.id}
                initial={{ opacity: 0, y: 40, rotateX: 15 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ 
                  rotateY: index === 0 ? 5 : -5,
                  rotateX: -3,
                  z: 50,
                  transition: { type: 'spring', stiffness: 300, damping: 25 }
                }}
                onViewportEnter={() => {
                  const newInView = [...cardsInView];
                  newInView[index] = true;
                  setCardsInView(newInView);
                }}
                className={`rounded-2xl sm:rounded-3xl relative flex flex-col ${isMobile ? 'p-5' : 'p-8'}`}
                style={{
                  background: 'linear-gradient(145deg, rgba(20,19,24,0.98) 0%, rgba(13,13,16,0.98) 100%)',
                  border: plan.highlight ? '2px solid #C9A962' : '1px solid rgba(201,169,98,0.15)',
                  boxShadow: plan.highlight 
                    ? '0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(201,169,98,0.2)' 
                    : '0 8px 32px rgba(0,0,0,0.5)',
                  transformStyle: 'preserve-3d',
                }}
              >
                {/* Animated gradient pulse for cards */}
                {plan.highlight ? (
                  <>
                    <motion.div
                      className="absolute inset-0 rounded-3xl"
                      initial={{ opacity: 0.5 }}
                      whileHover={{ opacity: 0.8 }}
                      style={{
                        background: 'radial-gradient(circle at 50% 40%, rgba(201,169,98,0.5) 0%, transparent 65%)',
                      }}
                      animate={{
                        scale: [1, 1.15, 1],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-3xl pointer-events-none"
                      style={{
                        background: 'radial-gradient(circle at 50% 40%, rgba(212,175,55,0.3) 0%, transparent 50%)',
                        filter: 'blur(20px)',
                      }}
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.4, 0.6, 0.4],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.5,
                      }}
                    />
                    <FloatingParticles />
                  </>
                ) : (
                  <motion.div
                    className="absolute inset-0 rounded-3xl"
                    style={{
                      background: 'radial-gradient(circle at 35% 35%, rgba(139, 92, 246, 0.4) 0%, transparent 55%)',
                    }}
                    animate={{
                      scale: [1, 1.06, 1],
                      opacity: [0.3, 0.45, 0.3],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
                
                {/* Most Popular Ribbon */}
                {plan.highlight && (
                  <motion.div 
                    className="absolute -top-1 right-6 overflow-hidden"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, type: 'spring' }}
                  >
                    <div 
                      className="px-8 py-1.5 text-xs font-bold uppercase tracking-wider text-[#0A0A0C]"
                      style={{
                        background: 'linear-gradient(135deg, #C9A962 0%, #D4AF37 100%)',
                        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)',
                        boxShadow: '0 4px 15px rgba(201,169,98,0.5)',
                      }}
                    >
                      Most Popular
                    </div>
                    {/* Glow effect around ribbon */}
                    <motion.div
                      className="absolute inset-0 -z-10 blur-md"
                      style={{
                        background: '#C9A962',
                        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)',
                      }}
                      animate={{
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </motion.div>
                )}
                
                <div className={`relative z-10 ${isMobile ? 'mb-4' : 'mb-6'}`}>
                  <h2 className={`font-semibold text-white mb-1 sm:mb-2 ${isMobile ? 'text-lg' : 'text-xl'}`}>{plan.name}</h2>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {cardsInView[index] ? (
                      <AnimatedPrice price={plan.price} inView={cardsInView[index]} />
                    ) : (
                      <span className={`font-bold text-white tracking-tight ${isMobile ? 'text-5xl' : 'text-6xl'}`}>{plan.price}</span>
                    )}
                    <span className="text-white/40 text-sm sm:text-base">/ {plan.description}</span>
                  </div>
                </div>

                <div className={`flex-1 relative z-10 ${isMobile ? 'space-y-2 mb-5' : 'space-y-3 mb-8'}`}>
                  {plan.features.map((f, idx) => (
                    <FeatureItem 
                      key={idx} 
                      text={f} 
                      highlight={plan.highlight && idx === plan.features.length - 1} 
                    />
                  ))}
                </div>

                <motion.button
                  type="button"
                  onClick={() => handleBuy(plan)}
                  disabled={buying !== null}
                  className={`w-full font-semibold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed relative z-10 touch-manipulation ${
                    isMobile ? 'py-3.5 text-sm' : 'py-4 text-base'
                  }`}
                  style={plan.highlight 
                    ? {
                        background: 'linear-gradient(135deg, #C9A962 0%, #D4AF37 100%)',
                        color: '#0A0A0C',
                        boxShadow: '0 4px 20px rgba(201,169,98,0.4)',
                      }
                    : {
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: 'white',
                      }
                  }
                  whileHover={!buying ? { 
                    scale: 1.02,
                    boxShadow: plan.highlight 
                      ? '0 6px 30px rgba(201,169,98,0.6)' 
                      : '0 4px 20px rgba(255,255,255,0.1)'
                  } : {}}
                  whileTap={!buying ? { scale: 0.98 } : {}}
                >
                  {buying === plan.id ? 'Opening payment…' : isAuthenticated ? `Buy for ${plan.price}` : 'Sign in to buy'}
                </motion.button>
              </m.div>
            );
            })}
          </div>

          {/* Trust badges */}
          <motion.div 
            className={`flex flex-wrap items-center justify-center text-white/40 text-sm ${
              isMobile ? 'gap-4 mt-6' : 'gap-6 mt-10'
            }`}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C9A962]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Trusted by 2000+ creators</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C9A962]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Secure payments</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#C9A962]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 001-1l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
              <span>Credits never expire</span>
            </div>
          </motion.div>

          <p className={`text-center text-white/30 text-sm ${isMobile ? 'mt-4' : 'mt-6'}`}>
            Powered by Razorpay ·{' '}
            <Link to="/contact" className="text-white/50 hover:text-white transition">Questions?</Link>
          </p>
        </m.div>
      </main>
    </div>
  );
}
