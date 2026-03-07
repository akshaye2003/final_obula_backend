import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { m as M, AnimatePresence } from 'framer-motion';
import { useInView } from '../hooks/useInView.js';
import { useScrollContext } from '../context/ScrollContext.jsx';
import GlassCard from '../components/GlassCard.jsx';
import ObulaLogo from '../components/ObulaLogo.jsx';
import ScrollDownIndicator from '../components/ScrollDownIndicator.jsx';
import MagneticButton from '../components/MagneticButton.jsx';
import SplitTextHero from '../components/SplitTextHero.jsx';
import { BlurReveal } from '../components/ScrollReveal.jsx';
import { spring, viewportOnce } from '../lib/motion.js';
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

const heroLines = HERO.headline;

// Easter Egg Component
function EasterEgg() {
  const [showMessage, setShowMessage] = useState(false);
  const [particles, setParticles] = useState([]);

  const handleClick = () => {
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 60,
      y: -Math.random() * 40 - 20,
      rotation: Math.random() * 360,
      color: ['#C9A962', '#D4AF37', '#B8A988', '#FFD700'][Math.floor(Math.random() * 4)],
    }));
    setParticles(newParticles);
    setShowMessage(true);
    setTimeout(() => setParticles([]), 1000);
    setTimeout(() => setShowMessage(false), 3000);
  };

  return (
    <div className="relative ml-2">
      <M.button
        onClick={handleClick}
        className="text-xs opacity-60 hover:opacity-100 transition-all cursor-pointer hover:drop-shadow-[0_0_8px_rgba(201,169,98,0.6)]"
        whileHover={{ scale: 1.3 }}
        whileTap={{ scale: 0.9 }}
        title="Click me!"
      >
        📟
      </M.button>
      {particles.map((p) => (
        <M.div
          key={p.id}
          className="absolute top-0 left-1/2 w-1 h-1 rounded-full pointer-events-none"
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
      {showMessage && (
        <M.div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap"
          initial={{ opacity: 0, y: 5, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <span
            className="text-[9px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #C9A96220 0%, #D4AF3720 100%)',
              border: '1px solid rgba(201,169,98,0.3)',
              color: '#C9A962',
            }}
          >
            Made with love by AAE
          </span>
        </M.div>
      )}
    </div>
  );
}

/**
 * Desktop-only landing layout (locked).
 * Viewport > 768px. Safe to edit LandingMobile without affecting this.
 */
export default function LandingDesktop() {
  const [activeTab, setActiveTab] = useState('captions');
  const [fillStep, setFillStep] = useState(1);
  const [testimonialGroup, setTestimonialGroup] = useState(0);
  const [scrollIndicatorVisible, setScrollIndicatorVisible] = useState(true);
  const [pricingMode, setPricingMode] = useState('single');
  const [compIdx, setCompIdx] = useState(0);
  const [scrambledText, setScrambledText] = useState(CHEAPER_THAN.single[0]);
  const [scrambledPrice, setScrambledPrice] = useState(PRICE_PLANS.single.price);
  const scrambleIv = useRef(null);
  const priceScrambleIv = useRef(null);

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

  const lastScrollY = useRef(0);
  const scrollIndicatorReady = useRef(false);
  const featureTabPausedUntil = useRef(0);
  const testimonialPausedUntil = useRef(0);

  const scrollCtx = useScrollContext();
  const priceRef = useRef(null);
  const [heroRef, heroInView] = useInView({ threshold: 0.05, initialInView: true });
  const [walkRef, walkInView] = useInView({ threshold: 0.1 });
  const [featureRef, featureInView] = useInView({ threshold: 0.1 });
  const [ctaRef, ctaInView] = useInView({ threshold: 0.2 });

  useEffect(() => {
    if (window.location.hash === '#pricing') {
      priceRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      if (Date.now() < testimonialPausedUntil.current) return;
      setTestimonialGroup((g) => (g + 1) % 3);
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => setFillStep(1), [activeTab]);

  useEffect(() => {
    if (!featureInView) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) return;
    const ids = FEATURE_TABS.map((t) => t.id);
    const id = setInterval(() => {
      if (Date.now() < featureTabPausedUntil.current) return;
      setActiveTab((prev) => ids[(ids.indexOf(prev) + 1) % ids.length]);
    }, 6000);
    return () => clearInterval(id);
  }, [featureInView]);

  useEffect(() => {
    if (!featureInView) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) return;
    const id = setInterval(() => setFillStep((s) => (s >= 3 ? 1 : s + 1)), 2000);
    return () => clearInterval(id);
  }, [featureInView]);

  useEffect(() => {
    const t = setTimeout(() => { scrollIndicatorReady.current = true; }, 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = scrollCtx?.scrollContainer;
    if (!el) return;
    const handleScroll = () => {
      const y = el.scrollTop;
      const diff = y - lastScrollY.current;
      lastScrollY.current = y;
      if (scrollIndicatorReady.current && diff > 0) setScrollIndicatorVisible(false);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [scrollCtx?.scrollContainer]);

  return (
    <div className="relative overflow-x-hidden">
      <section className="relative min-h-screen flex flex-col">
        <M.div
          ref={heroRef}
          className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-24 pb-24 text-center min-h-[calc(100vh-5rem)]"
        >
          <M.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={heroInView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ ...spring.bouncy, delay: 0.06 }}
            className="mb-6"
          >
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-white/[0.06] border border-[#C9A962]/30 text-white/90 backdrop-blur-md shadow-[0_0_20px_-5px_rgba(201,169,98,0.15)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C9A962] animate-pulse shadow-[0_0_12px_rgba(201,169,98,0.4)]" />
              {HERO.badge}
            </span>
          </M.div>

          <div className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight mb-8 max-w-3xl leading-[1.2] mx-auto">
            <SplitTextHero lines={heroLines} gradientLineIndex={1} inView={heroInView} />
          </div>

          <M.p
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ ...spring.smooth, delay: 0.4 }}
            className="text-white text-base sm:text-lg font-normal tracking-tight mb-1 max-w-2xl mx-auto"
          >
            {HERO.tagline}
          </M.p>

          <M.p
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ ...spring.smooth, delay: 0.48 }}
            className="text-white/90 text-sm sm:text-base font-normal leading-relaxed mb-10 max-w-xl mx-auto"
          >
            {HERO.subheadline}
          </M.p>

          <M.div
            initial={{ opacity: 0, y: 20 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ ...spring.bouncy, delay: 0.6 }}
            className="flex flex-col sm:flex-row items-center gap-4"
          >
            <MagneticButton strength={0.3}>
              <Link to="/upload" className="btn-accent inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base">
                {HERO.ctaPrimary}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </MagneticButton>
            <MagneticButton strength={0.2}>
              <button
                type="button"
                onClick={() => priceRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="px-6 py-3.5 rounded-xl font-medium text-muted hover:text-white border border-white/10 hover:border-white/20 transition-all duration-300"
              >
                {HERO.ctaSecondary}
              </button>
            </MagneticButton>
          </M.div>

          <M.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={heroInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ ...spring.snappy, delay: 0.75 }}
            className="mt-8 flex items-center gap-3 text-muted text-sm"
          >
            <div className="flex -space-x-2">
              {['M','S','J','P','A'].map((l, i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-white/60">
                  {l}
                </div>
              ))}
            </div>
            <span>
              {HERO.socialProof} <strong className="text-white/70 font-semibold">{HERO.socialProofCount}</strong> {HERO.socialProofSuffix}
            </span>
          </M.div>
        </M.div>

        <AnimatePresence>
          {scrollIndicatorVisible && (
            <M.div
              key="scroll"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] flex justify-center pointer-events-none"
            >
              <ScrollDownIndicator visible={heroInView} />
            </M.div>
          )}
        </AnimatePresence>
      </section>

      <section ref={featureRef} className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
        <div className="absolute top-20 left-10 w-96 h-96 rounded-full bg-accent-start/[0.02] blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <BlurReveal y={40} className="text-center mb-14">
            <p className="text-muted text-sm font-medium uppercase tracking-[0.2em] mb-4">{SECTIONS.features.label}</p>
            <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{SECTIONS.features.title}</h2>
          </BlurReveal>

          <M.div
            initial={{ opacity: 0 }}
            animate={featureInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.15 }}
            className="flex flex-wrap justify-center gap-3 mb-12"
          >
            {FEATURE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  featureTabPausedUntil.current = Date.now() + 12000;
                  setActiveTab(tab.id);
                }}
                className="relative px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
              >
                {activeTab === tab.id && (
                  <M.span
                    layoutId="featureTab"
                    className="absolute inset-0 bg-gradient-accent rounded-xl"
                    style={{ zIndex: -1, boxShadow: '0 4px 24px -4px rgba(201, 169, 98, 0.35)' }}
                    transition={spring.bouncy}
                  />
                )}
                <span className={`relative z-10 flex items-center gap-2 ${activeTab === tab.id ? 'text-white' : 'text-muted hover:text-white/80'}`}>
                  <span className="text-lg">{tab.icon}</span>
                  {tab.label}
                </span>
              </button>
            ))}
          </M.div>

          <AnimatePresence mode="wait">
            <M.div
              key={activeTab}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={spring.snappy}
            >
              <GlassCard glow className="overflow-hidden">
                <div className="absolute top-0 left-0 h-0.5 bg-gradient-accent" style={{ width: '100%' }} />
                <div className="flex flex-col sm:flex-row items-stretch min-h-[280px]">
                  <div className="w-full sm:w-2/5 p-8 sm:p-10 flex flex-col justify-center gap-5 sm:border-r border-white/5">
                    <div className="space-y-2">
                      <div className="h-2 w-24 rounded-full bg-white/10" />
                      <div className="h-1.5 w-32 rounded-full bg-white/5" />
                    </div>
                    <div className="flex flex-col gap-4">
                      {[1, 2, 3].map((n) => {
                        const isCompleted = fillStep > n;
                        const isActive = fillStep === n;
                        return (
                          <div
                            key={n}
                            className={`h-10 rounded-lg flex items-center px-4 gap-3 overflow-hidden transition-all ${
                              isCompleted ? 'bg-accent-start/10 border border-accent-start/20' : 'bg-white/5 border border-white/5'
                            } ${isActive ? 'ring-1 ring-accent-start/30' : ''}`}
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isCompleted || isActive ? 'bg-accent-start' : 'bg-white/20'}`} />
                            <div className="h-2 rounded-full flex-1 bg-white/5 overflow-hidden">
                              {isCompleted ? (
                                <div className="h-full w-full rounded-full bg-accent-start/50" />
                              ) : isActive ? (
                                <M.div
                                  key={`fill-${activeTab}-${n}`}
                                  className="h-full rounded-full bg-gradient-accent"
                                  initial={{ width: 0 }}
                                  animate={{ width: '100%' }}
                                  transition={{ duration: 2, ease: [0.4, 0, 0.2, 1] }}
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 sm:p-12">
                    <div className="text-5xl sm:text-6xl">{FEATURE_TABS.find((t) => t.id === activeTab)?.icon}</div>
                    <div className="text-center max-w-sm">
                      <h3 className="text-white font-bold text-xl mb-2">{FEATURE_TABS.find((t) => t.id === activeTab)?.label}</h3>
                      <p className="text-muted text-sm leading-relaxed">{FEATURE_TABS.find((t) => t.id === activeTab)?.desc}</p>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </M.div>
          </AnimatePresence>
        </div>
      </section>

      <section ref={walkRef} className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 overflow-visible">
        <div className="max-w-6xl mx-auto relative z-10">
          <BlurReveal y={40} className="text-center mb-20">
            <p className="text-muted text-sm font-medium uppercase tracking-[0.2em] mb-4">{SECTIONS.howItWorks.label}</p>
            <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{SECTIONS.howItWorks.title}</h2>
          </BlurReveal>

          <div className="relative" style={{ perspective: '1500px' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
              {HOW_IT_WORKS.map((step, i) => (
                <M.div
                  key={step.step}
                  initial={{ opacity: 0, y: 40 }}
                  animate={walkInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div
                    className="relative rounded-3xl p-8 h-full group cursor-pointer overflow-visible"
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(201,169,98,0.3)',
                      boxShadow: '0 0 20px rgba(201,169,98,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
                      transition: 'transform 0.25s ease-out, border-color 0.25s ease-out, box-shadow 0.25s ease-out',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-16px)';
                      e.currentTarget.style.borderColor = 'rgba(201,169,98,0.6)';
                      e.currentTarget.style.boxShadow = '0 0 40px rgba(201,169,98,0.25), 0 0 80px rgba(201,169,98,0.1), inset 0 1px 0 rgba(255,255,255,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = 'rgba(201,169,98,0.3)';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(201,169,98,0.1), inset 0 1px 0 rgba(255,255,255,0.05)';
                    }}
                  >
                    <div
                      className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: `linear-gradient(135deg, ${step.color}20 0%, transparent 50%, ${step.color}10 100%)` }}
                    />
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold mb-6 mt-4 transition-all duration-300 group-hover:scale-110"
                      style={{
                        background: 'linear-gradient(135deg, rgba(201,169,98,0.2) 0%, rgba(201,169,98,0.1) 100%)',
                        border: '2px solid rgba(201,169,98,0.5)',
                        boxShadow: '0 0 20px rgba(201,169,98,0.3), 0 8px 24px rgba(201,169,98,0.2)',
                        color: '#C9A962',
                      }}
                    >
                      {step.step}
                    </div>
                    <h3 className="text-white font-bold text-xl mb-3">{step.title}</h3>
                    <p className="text-muted text-sm leading-relaxed">{step.desc}</p>
                    <div className="absolute bottom-0 left-8 right-8 h-[2px] overflow-hidden rounded-full">
                      <div
                        className="h-full w-0 group-hover:w-full transition-all duration-700 ease-out"
                        style={{ background: `linear-gradient(90deg, transparent, ${step.color}, transparent)` }}
                      />
                    </div>
                  </div>
                </M.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto relative z-10">
          <BlurReveal y={40} className="text-center mb-14">
            <p className="text-muted text-sm font-medium uppercase tracking-[0.2em] mb-3">{SECTIONS.testimonials.label}</p>
            <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">What people say</h2>
          </BlurReveal>

          <div className="relative">
            <AnimatePresence mode="wait">
              <M.div
                key={testimonialGroup}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8"
              >
                {TESTIMONIALS.slice(testimonialGroup * 3, testimonialGroup * 3 + 3).map((t, i) => (
                  <div
                    key={`${testimonialGroup}-${i}`}
                    className="rounded-2xl p-6 sm:p-8 flex flex-col gap-5 bg-transparent border border-[#C9A962]/30 hover:border-[#C9A962]/60 transition-all duration-300"
                    style={{
                      boxShadow: '0 0 20px rgba(201,169,98,0.08)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 0 40px rgba(201,169,98,0.2), 0 0 60px rgba(201,169,98,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(201,169,98,0.08)';
                    }}
                  >
                    <div className="flex gap-1">
                      {[0,1,2,3,4].map((j) => (
                        <svg key={j} className="w-4 h-4 text-[#C9A962]" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <p className="text-white/90 text-[15px] sm:text-base leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center gap-4 pt-4 mt-auto border-t border-white/[0.06]">
                      <div className="w-10 h-10 rounded-full bg-[#C9A962]/20 flex items-center justify-center font-semibold text-sm text-[#C9A962] shrink-0">
                        {t.initials}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{t.author}</p>
                        <p className="text-sm text-white/50">{t.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </M.div>
            </AnimatePresence>
          </div>

          <div className="relative h-px mt-10 mb-6 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <M.div
              key={testimonialGroup}
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: 'linear-gradient(90deg, #B8A988, #C9A962, #D4AF37)' }}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 7.6, ease: 'linear' }}
            />
          </div>

          <div className="flex justify-center items-center gap-5">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  testimonialPausedUntil.current = Date.now() + 8000;
                  setTestimonialGroup(i);
                }}
                className="rounded-full transition-all duration-300 p-2 -m-2 touch-manipulation"
                style={{
                  width: 4,
                  height: 4,
                  background: testimonialGroup === i ? 'linear-gradient(135deg, #B8A988, #D4AF37)' : 'rgba(255,255,255,0.2)',
                }}
                aria-label={`View testimonial set ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" ref={priceRef} className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[700px] h-[500px] rounded-full bg-accent-start/[0.03] blur-[140px]" />
        </div>

        <div className="max-w-lg mx-auto relative z-10">
          <BlurReveal y={32} className="text-center mb-10">
            <p className="text-muted text-sm font-medium uppercase tracking-[0.2em] mb-4">Pricing</p>
            <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">Transparent Pricing</h2>
          </BlurReveal>

          <M.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex justify-center mb-10">
              <div
                className="relative flex p-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {['single', 'saver'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPricingMode(mode)}
                    className="relative px-6 py-2 rounded-full text-sm font-semibold transition-colors duration-200 z-10"
                    style={{ color: pricingMode === mode ? '#0A0A0C' : 'rgba(255,255,255,0.45)' }}
                  >
                    {pricingMode === mode && (
                      <M.span
                        layoutId="pricingPill"
                        className="absolute inset-0 rounded-full"
                        style={{ background: 'linear-gradient(135deg, #B8A988 0%, #C9A962 50%, #D4AF37 100%)', boxShadow: '0 2px 16px -4px rgba(201,169,98,0.5)' }}
                        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                      />
                    )}
                    <span className="relative z-10">{mode === 'single' ? 'Single' : 'Saver'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center mb-8" style={{ minHeight: 160 }}>
              <AnimatePresence mode="wait">
                <M.div
                  key={pricingMode}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center"
                >
                  <span className="gradient-accent-text font-black tracking-tighter leading-none" style={{ fontSize: 'clamp(80px, 14vw, 112px)' }}>
                    {scrambledPrice}
                  </span>
                  <p className="text-white/40 text-sm mt-3 font-medium">{PRICE_PLANS[pricingMode].label}</p>
                  {PRICE_PLANS[pricingMode].detail && (
                    <M.div
                      className="flex items-center gap-2 mt-5"
                      initial="hidden"
                      animate="show"
                      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}
                    >
                      {PRICE_PLANS[pricingMode].detail.map((d) => (
                        <M.span
                          key={d.text}
                          variants={{
                            hidden: { opacity: 0, scale: 0.75, y: 8 },
                            show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 22 } },
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold"
                          style={d.gold
                            ? { background: 'rgba(201,169,98,0.15)', color: '#D4AF37', border: '1px solid rgba(201,169,98,0.25)' }
                            : { background: 'rgba(74,222,128,0.08)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }
                          }
                        >
                          {d.text}
                        </M.span>
                      ))}
                    </M.div>
                  )}
                </M.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-center mb-10">
              <span className="shrink-0 font-mono font-medium tracking-[-0.01em] text-white/35" style={{ fontSize: 'clamp(16px, 2.2vw, 22px)' }}>
                Cheaper than&nbsp;
              </span>
              <span className="font-mono font-medium tracking-[-0.01em] gradient-accent-text whitespace-nowrap" style={{ fontSize: 'clamp(16px, 2.2vw, 22px)' }}>
                {scrambledText}
              </span>
            </div>

            <div className="flex justify-center">
              <MagneticButton strength={0.25}>
                <Link to="/upload" className="btn-accent inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-semibold">
                  {PRICING.cta}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </MagneticButton>
            </div>
          </M.div>

          <p className="text-center text-white/20 text-xs mt-6">Credits never expire · Secure payments via Razorpay</p>
        </div>
      </section>

      <section ref={ctaRef} className="relative py-28 sm:py-36 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-[700px] h-[300px] rounded-full bg-accent-start/[0.025] blur-[120px]" />
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <M.div
            initial={{ opacity: 0, y: 48, scale: 0.95 }}
            animate={ctaInView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={spring.wobble}
          >
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6 leading-[1.05]">
              {SECTIONS.cta.headline[0]}{' '}
              <span className="gradient-accent-text">{SECTIONS.cta.headline[1]}</span>
            </h2>
            <p className="text-muted text-base leading-relaxed mb-12 whitespace-pre-line">{SECTIONS.cta.subheadline}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 flex-wrap">
              <MagneticButton strength={0.3}>
                <Link to="/upload" className="btn-accent inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base">
                  {SECTIONS.cta.primary}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </Link>
              </MagneticButton>
              <MagneticButton strength={0.2}>
                <button
                  type="button"
                  onClick={() => priceRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-6 py-4 rounded-xl font-medium text-muted hover:text-white border border-white/10 hover:border-white/20 transition-all"
                >
                  {SECTIONS.cta.secondary}
                </button>
              </MagneticButton>
              <MagneticButton strength={0.2}>
                <Link to="/contact" className="px-6 py-4 rounded-xl font-medium text-muted hover:text-white border border-white/10 hover:border-white/20 transition-all">
                  {SECTIONS.cta.tertiary}
                </Link>
              </MagneticButton>
            </div>
          </M.div>
        </div>
      </section>

      <footer className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <ObulaLogo size="sm" />
          <div className="flex items-center gap-8 text-sm text-muted">
            <button
              type="button"
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-white transition-colors"
            >
              Pricing
            </button>
            <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
            <Link to="/signin" className="hover:text-white transition-colors">Sign in</Link>
            <span className="text-white/20">·</span>
            <span>© 2025 Obula</span>
            <EasterEgg />
          </div>
        </div>
      </footer>
    </div>
  );
}
