import { lazy, Suspense, useRef, useState, useCallback, useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { AnimatePresence, m } from 'framer-motion';
import StableOutlet from './StableOutlet.jsx';
import LandingNav from './LandingNav.jsx';
import { useScrollNav } from '../hooks/useScrollNav.js';
import { useScrollContext } from '../context/ScrollContext.jsx';
import { useMobile } from '../hooks/useMobile.js';

const Global3DBackground = lazy(() => import('./Global3DBackground.jsx'));

// Direction-aware: forward = slide from right, back = slide from left
// Only transform + opacity for GPU acceleration (no filter = no repaint jank)
const slideDistance = 24;

const pageTransition = {
  initial: (direction) => ({
    opacity: 0,
    x: direction >= 0 ? slideDistance : -slideDistance,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.45,
      ease: [0.25, 0.46, 0.45, 0.94], // smooth deceleration
    },
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction >= 0 ? -slideDistance : slideDistance,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  }),
};

export default function PageTransitionLayout() {
  const location = useLocation();
  const navType = useNavigationType();
  const direction = navType === 'POP' ? -1 : 1;
  const scrollCtx = useScrollContext();
  const scrollContainerRef = useRef(null);
  const [, setContainerReady] = useState(0);
  const setScrollEl = scrollCtx?.setScrollContainerElement;
  const mergeScrollRef = useCallback(
    (el) => {
      scrollContainerRef.current = el;
      setScrollEl?.(el);
      if (el) setContainerReady((n) => n + 1);
    },
    [setScrollEl]
  );
  const scrollEl = scrollContainerRef.current;
  const { visible: navVisible } = useScrollNav(scrollEl);
  const isLanding = location.pathname === '/';
  const isMobile = useMobile();

  const syncScroll = useCallback(
    (el) => {
      if (!el || !scrollCtx) return;
      if (scrollCtx.scrollYRef) scrollCtx.scrollYRef.current = el.scrollTop;
      if (scrollCtx.scrollHeightRef) scrollCtx.scrollHeightRef.current = el.scrollHeight;
      if (scrollCtx.scrollClientHeightRef) scrollCtx.scrollClientHeightRef.current = el.clientHeight;
    },
    [scrollCtx]
  );

  const handleScroll = (e) => syncScroll(e.target);

  const handleTouchMove = useCallback(
    () => {
      const el = scrollContainerRef.current;
      if (el) syncScroll(el);
    },
    [syncScroll]
  );

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !scrollCtx?.scrollHeightRef) return;
    const update = () => {
      scrollCtx.scrollHeightRef.current = el.scrollHeight;
      scrollCtx.scrollClientHeightRef.current = el.clientHeight;
      scrollCtx.scrollYRef.current = el.scrollTop;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollCtx, scrollEl]);

  return (
    <div className="h-screen overflow-hidden bg-black text-white selection:bg-accent-start/20 selection:text-white [perspective:1200px] relative">
      <Suspense fallback={null}>
        <Global3DBackground isMobile={isMobile} />
      </Suspense>
      <div className="premium-gradient-mesh" aria-hidden="true" />
      <div className="vignette-overlay" aria-hidden="true" />
      {isLanding && <LandingNav visible={navVisible} />}
      <div
        ref={mergeScrollRef}
        data-scroll-container
        onScroll={handleScroll}
        onTouchMove={handleTouchMove}
        className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[10] overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y"
        style={{ background: 'transparent', transformStyle: 'preserve-3d', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="min-h-screen flex flex-col bg-transparent w-full">
          <AnimatePresence mode="wait" custom={direction}>
            <m.div
              key={location.pathname}
              custom={direction}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageTransition}
              className="min-h-screen flex flex-col flex-1"
            >
              <StableOutlet />
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
