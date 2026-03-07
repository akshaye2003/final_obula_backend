import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { m as M, AnimatePresence } from 'framer-motion';
import { useInView } from '../hooks/useInView.js';
import ObulaLogo from '../components/ObulaLogo.jsx';
import {
  HERO,
  SECTIONS,
  HOW_IT_WORKS,
  FEATURE_TABS,
  TESTIMONIALS,
  PRICING,
  CHEAPER_THAN,
  PRICE_PLANS,
  SCRAMBLE_CHARS,
} from '../lib/constants.js';

// Easter Egg – fixed tooltip on mobile so it’s never cut off
function EasterEgg() {
  const [showMessage, setShowMessage] = useState(false);
  const [particles, setParticles] = useState([]);
  const [tooltipPos, setTooltipPos] = useState({ left: 0, bottom: 0 });
  const btnRef = useRef(null);

  const handleClick = () => {
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 60,
      y: -Math.random() * 40 - 20,
      rotation: Math.random() * 360,
      color: ['#C9A962', '#D4AF37', '#B8A988', '#FFD700'][Math.floor(Math.random() * 4)],
    }));
    setParticles(newParticles);
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const centerX = r.left + r.width / 2;
      const padding = 20;
      const halfW = 85;
      const maxRight = document.documentElement.clientWidth || window.innerWidth;
      const clampedLeft = Math.max(halfW + padding, Math.min(centerX, maxRight - halfW - padding));
      setTooltipPos({
        left: clampedLeft,
        bottom: window.innerHeight - r.top + 8,
      });
    }
    setShowMessage(true);
    setTimeout(() => setParticles([]), 1000);
    setTimeout(() => setShowMessage(false), 3000);
  };
  return (
    <div className="relative ml-2">
      <M.button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        className="text-xs opacity-60 active:opacity-100 transition-opacity touch-manipulation"
        whileTap={{ scale: 0.9 }}
        title="Click me!"
      >
        📟
      </M.button>
      {particles.map((p) => (
        <M.div
          key={p.id}
          className="absolute top-0 left-1/2 w-2 h-2 rounded-full pointer-events-none"
          style={{ backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: 0,
            scale: 0,
            rotate: p.rotation,
          }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      ))}
      {showMessage &&
        createPortal(
          <AnimatePresence>
            <M.div
              className="fixed whitespace-nowrap z-[200] -translate-x-1/2"
              style={{ left: tooltipPos.left, bottom: tooltipPos.bottom }}
              initial={{ opacity: 0, y: 5, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full block"
                style={{
                  background: 'linear-gradient(135deg, #C9A96220 0%, #D4AF3720 100%)',
                  border: '1px solid rgba(201,169,98,0.3)',
                  color: '#C9A962',
                }}
              >
                Made with love by AAE
              </span>
            </M.div>
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

/**
 * Mobile-only landing layout (viewport ≤768px).
 * Edit this file to customize mobile experience without affecting LandingDesktop.
 */
export default function LandingMobile() {
  const [activeTab, setActiveTab] = useState('captions');
  const [testimonialIdx, setTestimonialIdx] = useState(0);
  const [processStepIdx, setProcessStepIdx] = useState(0);
  const [pricingMode, setPricingMode] = useState('single');
  const [compIdx, setCompIdx] = useState(0);
  const [scrambledText, setScrambledText] = useState(CHEAPER_THAN.single[0]);
  const [scrambledPrice, setScrambledPrice] = useState(PRICE_PLANS.single.price);
  const scrambleIv = useRef(null);
  const priceScrambleIv = useRef(null);
  const testimonialPausedUntil = useRef(0);
  const testimonialStartTime = useRef(Date.now());
  const [testimonialProgress, setTestimonialProgress] = useState(0);
  const processStepPausedUntil = useRef(0);
  const processStepStartTime = useRef(Date.now());
  const [processStepProgress, setProcessStepProgress] = useState(0);

  const TESTIMONIAL_DURATION = 4500;
  const priceRef = useRef(null);

  useEffect(() => { setCompIdx(0); }, [pricingMode]);

  useEffect(() => {
    const list = CHEAPER_THAN[pricingMode];
    const iv = setInterval(() => setCompIdx((i) => (i + 1) % list.length), 3200);
    return () => clearInterval(iv);
  }, [pricingMode]);

  useEffect(() => {
    const target = PRICE_PLANS[pricingMode].price;
    const targetNum = parseInt(target.replace('₹', ''));
    const startNum = 999;
    const duration = 2200;
    const startTime = performance.now();
    if (priceScrambleIv.current) cancelAnimationFrame(priceScrambleIv.current);
    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = Math.round(startNum - (startNum - targetNum) * eased);
      setScrambledPrice('₹' + current);
      if (t < 1) priceScrambleIv.current = requestAnimationFrame(tick);
      else setScrambledPrice(target);
    };
    priceScrambleIv.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(priceScrambleIv.current);
  }, [pricingMode]);

  useEffect(() => {
    const target = CHEAPER_THAN[pricingMode][compIdx] ?? CHEAPER_THAN[pricingMode][0];
    let frame = 0;
    const totalFrames = 18;
    if (scrambleIv.current) clearInterval(scrambleIv.current);
    scrambleIv.current = setInterval(() => {
      frame++;
      const lockedUpTo = Math.floor((frame / totalFrames) * target.length);
      const result = target.split('').map((ch, i) => {
        if (i < lockedUpTo || ch === ' ') return ch;
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }).join('');
      setScrambledText(result);
      if (frame >= totalFrames) {
        clearInterval(scrambleIv.current);
        setScrambledText(target);
      }
    }, 38);
    return () => clearInterval(scrambleIv.current);
  }, [compIdx, pricingMode]);

  useEffect(() => {
    if (window.location.hash === '#pricing') {
      priceRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    testimonialStartTime.current = Date.now();
    setTestimonialProgress(0);
  }, [testimonialIdx]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() < testimonialPausedUntil.current) return;
      setTestimonialIdx((i) => (i + 1) % TESTIMONIALS.length);
    }, TESTIMONIAL_DURATION);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const elapsed = Date.now() - testimonialStartTime.current;
      const p = Math.min(1, elapsed / TESTIMONIAL_DURATION);
      setTestimonialProgress(p);
    }, 50);
    return () => clearInterval(iv);
  }, []);

  const PROCESS_STEP_DURATION = 4500;

  useEffect(() => {
    processStepStartTime.current = Date.now();
    setProcessStepProgress(0);
  }, [processStepIdx]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() < processStepPausedUntil.current) return;
      setProcessStepIdx((i) => (i + 1) % HOW_IT_WORKS.length);
    }, PROCESS_STEP_DURATION);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const elapsed = Date.now() - processStepStartTime.current;
      const p = Math.min(1, elapsed / PROCESS_STEP_DURATION);
      setProcessStepProgress(p);
    }, 50);
    return () => clearInterval(iv);
  }, []);

  const heroLines = HERO.headline;

  return (
    <div className="relative overflow-x-hidden">
      {/* HERO */}
      <section className="relative min-h-[100dvh] flex flex-col items-center justify-center px-5 pt-20 pb-16 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-white/[0.06] border border-[#C9A962]/30 text-white/90 mb-6">
          <span className="w-2 h-2 rounded-full bg-[#C9A962] animate-pulse" />
          {HERO.badge}
        </span>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-4 leading-[1.25]">
          {heroLines[0]}
          <br />
          <span
            className="hero-accent-text"
            style={{ textShadow: '0 0 20px rgba(255,215,0,0.5), 0 0 40px rgba(255,167,0,0.25), 0 1px 0 rgba(255,255,255,0.4)' }}
          >
            {heroLines[1]}
          </span>
          <br />
          {heroLines[2]}
        </h1>

        <p className="text-white text-sm font-normal mb-1 max-w-sm">{HERO.tagline}</p>
        <p className="text-white/80 text-xs leading-relaxed mb-8 max-w-xs">{HERO.subheadline}</p>

        <div className="flex flex-col w-full max-w-[280px] gap-3">
          <Link
            to="/upload"
            className="btn-accent inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-full text-base font-semibold touch-manipulation"
          >
            {HERO.ctaPrimary}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
          <button
            type="button"
            onClick={() => priceRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="min-h-[48px] px-6 py-3 rounded-full font-medium text-muted border border-white/10 active:bg-white/5 transition-colors touch-manipulation"
          >
            {HERO.ctaSecondary}
          </button>
        </div>

        <div className="mt-8 flex items-center gap-2 text-muted text-xs">
          <div className="flex -space-x-2">
            {['M','S','J','P','A'].map((l, i) => (
              <div key={i} className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[9px] font-semibold text-white/60">
                {l}
              </div>
            ))}
          </div>
          <span>
            {HERO.socialProof} <strong className="text-white/70">{HERO.socialProofCount}</strong> {HERO.socialProofSuffix}
          </span>
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative py-16 px-5">
        <p className="text-muted text-xs font-medium uppercase tracking-widest mb-3 text-center">{SECTIONS.features.label}</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-8">{SECTIONS.features.title}</h2>

        <div className="space-y-3 mb-10">
          {FEATURE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left rounded-2xl p-5 border transition-all touch-manipulation min-h-[56px] flex items-center gap-4 ${
                activeTab === tab.id
                  ? 'bg-transparent border-[#C9A962]/50'
                  : 'bg-transparent border-white/[0.1]'
              }`}
              style={{
                boxShadow: activeTab === tab.id ? '0 0 20px rgba(201,169,98,0.15)' : 'none',
              }}
            >
              <span className="text-2xl">{tab.icon}</span>
              <span className="font-semibold text-white">{tab.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <M.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl p-6 border"
            style={{
              background: 'transparent',
              borderColor: 'rgba(201,169,98,0.3)',
              boxShadow: '0 0 20px rgba(201,169,98,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="text-4xl mb-3">{FEATURE_TABS.find((t) => t.id === activeTab)?.icon}</div>
            <h3 className="text-white font-bold text-lg mb-2">{FEATURE_TABS.find((t) => t.id === activeTab)?.label}</h3>
            <p className="text-muted text-sm leading-relaxed">{FEATURE_TABS.find((t) => t.id === activeTab)?.desc}</p>
          </M.div>
        </AnimatePresence>
      </section>

      {/* HOW IT WORKS — carousel with 1, 2, 3 tabs, auto-rotates every 4.5s */}
      <section className="relative py-16 px-5">
        <p className="text-muted text-xs font-medium uppercase tracking-widest mb-3 text-center">{SECTIONS.howItWorks.label}</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-10">{SECTIONS.howItWorks.title}</h2>

        <AnimatePresence mode="wait">
          <M.div
            key={processStepIdx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl p-6 border"
            style={{
              background: 'transparent',
              borderColor: 'rgba(201,169,98,0.3)',
              boxShadow: '0 0 20px rgba(201,169,98,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <span
                className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                style={{
                  background: 'linear-gradient(135deg, rgba(201,169,98,0.2) 0%, rgba(201,169,98,0.1) 100%)',
                  border: '2px solid rgba(201,169,98,0.5)',
                  boxShadow: '0 0 20px rgba(201,169,98,0.3), 0 8px 24px rgba(201,169,98,0.2)',
                  color: '#C9A962',
                }}
              >
                {HOW_IT_WORKS[processStepIdx]?.step}
              </span>
            </div>
            <h3 className="text-white font-bold mb-2">{HOW_IT_WORKS[processStepIdx]?.title}</h3>
            <p className="text-muted text-sm leading-relaxed">{HOW_IT_WORKS[processStepIdx]?.desc}</p>
          </M.div>
        </AnimatePresence>

        <div className="flex justify-center gap-2 mt-6">
          {HOW_IT_WORKS.map((_, i) => {
            const isActive = processStepIdx === i;
            const progress = isActive ? processStepProgress : 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  processStepPausedUntil.current = Date.now() + PROCESS_STEP_DURATION;
                  processStepStartTime.current = Date.now();
                  setProcessStepProgress(0);
                  setProcessStepIdx(i);
                }}
                className="relative min-w-[36px] h-9 px-3 rounded-full text-sm font-semibold touch-manipulation transition-colors overflow-hidden"
                style={{
                  background: isActive ? '#C9A962' : 'rgba(255,255,255,0.06)',
                  color: isActive ? '#0A0A0C' : 'rgba(255,255,255,0.5)',
                }}
                aria-label={`View step ${i + 1}`}
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-0 bottom-0 rounded-l-full transition-[width] duration-75 ease-linear"
                    style={{
                      width: `${progress * 100}%`,
                      background: 'rgba(10,10,10,0.4)',
                    }}
                  />
                )}
                <span className="relative z-10">{i + 1}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="relative py-16 px-5">
        <p className="text-muted text-xs font-medium uppercase tracking-widest mb-3 text-center">{SECTIONS.testimonials.label}</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-8">What people say</h2>

        <AnimatePresence mode="wait">
          <M.div
            key={testimonialIdx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl p-6 border"
            style={{
              background: 'transparent',
              borderColor: 'rgba(201,169,98,0.3)',
              boxShadow: '0 0 20px rgba(201,169,98,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="flex gap-1 mb-3">
              {[0,1,2,3,4].map((j) => (
                <svg key={j} className="w-4 h-4 text-[#C9A962]" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <p className="text-white/90 text-sm leading-relaxed mb-5">&ldquo;{TESTIMONIALS[testimonialIdx]?.quote}&rdquo;</p>
            <div className="flex items-center gap-3 pt-4 border-t border-white/[0.06]">
              <div className="w-10 h-10 rounded-full bg-[#C9A962]/20 flex items-center justify-center font-semibold text-sm text-[#C9A962]">
                {TESTIMONIALS[testimonialIdx]?.initials}
              </div>
              <div>
                <p className="font-semibold text-white text-sm">{TESTIMONIALS[testimonialIdx]?.author}</p>
                <p className="text-xs text-white/50">{TESTIMONIALS[testimonialIdx]?.role}</p>
              </div>
            </div>
          </M.div>
        </AnimatePresence>

        <div className="relative h-px mt-10 mb-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75 ease-linear"
            style={{
              width: `${testimonialProgress * 100}%`,
              background: 'linear-gradient(90deg, #B8A988, #C9A962, #D4AF37)',
            }}
          />
        </div>

        <div className="flex justify-center gap-3 flex-wrap">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                testimonialPausedUntil.current = Date.now() + TESTIMONIAL_DURATION;
                testimonialStartTime.current = Date.now();
                setTestimonialProgress(0);
                setTestimonialIdx(i);
              }}
              className="w-2 h-2 rounded-full touch-manipulation p-1 -m-1"
              style={{
                background: testimonialIdx === i ? '#C9A962' : 'rgba(255,255,255,0.12)',
              }}
              aria-label={`View testimonial ${i + 1}`}
            />
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" ref={priceRef} className="relative py-16 px-5">
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[400px] h-[300px] rounded-full bg-accent-start/[0.04] blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-sm mx-auto">
          <p className="text-muted text-xs font-medium uppercase tracking-widest mb-3 text-center">Pricing</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-8">Transparent Pricing</h2>

          <div className="flex p-1 rounded-full bg-white/[0.02] border border-white/[0.08] mb-8">
            {['single', 'saver'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPricingMode(mode)}
                className={`flex-1 min-h-[44px] rounded-full text-sm font-semibold touch-manipulation transition-colors ${
                  pricingMode === mode ? 'bg-gradient-accent text-[#0A0A0C]' : 'text-white/50'
                }`}
              >
                {mode === 'single' ? 'Single' : 'Saver'}
              </button>
            ))}
          </div>

          <div className="text-center mb-6">
            <span className="gradient-accent-text font-black text-6xl sm:text-7xl tracking-tighter leading-none">
              {scrambledPrice}
            </span>
            <p className="text-white/40 text-sm mt-2">{PRICE_PLANS[pricingMode].label}</p>
            {PRICE_PLANS[pricingMode].detail && (
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {PRICE_PLANS[pricingMode].detail.map((d) => (
                  <span
                    key={d.text}
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={d.gold
                      ? { background: 'rgba(201,169,98,0.15)', color: '#D4AF37' }
                      : { background: 'rgba(74,222,128,0.08)', color: '#4ade80' }
                    }
                  >
                    {d.text}
                  </span>
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-white/40 text-sm mb-6">
            Cheaper than <span className="gradient-accent-text font-medium">{scrambledText}</span>
          </p>

          <div className="flex justify-center">
            <Link
              to="/upload"
              className="btn-accent inline-flex items-center justify-center gap-2 min-h-[38px] py-2 px-5 rounded-full text-xs font-semibold touch-manipulation"
            >
              {PRICING.cta}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>

          <p className="text-center text-white/20 text-xs mt-5">Credits never expire · Secure payments via Razorpay</p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 px-5">
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[400px] h-[200px] rounded-full bg-accent-start/[0.03] blur-[80px]" />
        </div>

        <div className="relative z-10 text-center max-w-sm mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">
            {SECTIONS.cta.headline[0]}{' '}
            <span className="gradient-accent-text">{SECTIONS.cta.headline[1]}</span>
          </h2>
          <p className="text-muted text-sm leading-relaxed mb-8 whitespace-pre-line">{SECTIONS.cta.subheadline}</p>
          <div className="flex flex-col gap-2.5">
            <Link
              to="/upload"
              className="btn-accent flex items-center justify-center gap-2 min-h-[44px] py-2.5 rounded-full text-sm font-semibold touch-manipulation"
            >
              {SECTIONS.cta.primary}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <button
              type="button"
              onClick={() => priceRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="min-h-[44px] py-2.5 rounded-full text-sm font-medium text-muted border border-white/10 touch-manipulation"
            >
              {SECTIONS.cta.secondary}
            </button>
            <Link
              to="/contact"
              className="min-h-[44px] py-2.5 rounded-full text-sm font-medium text-muted border border-white/10 flex items-center justify-center touch-manipulation"
            >
              {SECTIONS.cta.tertiary}
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER — extra bottom padding for EasterEgg tooltip */}
      <footer className="pt-10 pb-14 px-5 overflow-visible">
        <div className="flex flex-col items-center gap-6 text-center">
          <ObulaLogo size="sm" />
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted overflow-visible -translate-x-2">
            <button
              type="button"
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="touch-manipulation"
            >
              Pricing
            </button>
            <Link to="/contact">Contact</Link>
            <Link to="/signin">Sign in</Link>
            <span className="text-white/20">·</span>
            <span>© 2025 Obula</span>
            <EasterEgg />
          </div>
        </div>
      </footer>
    </div>
  );
}
