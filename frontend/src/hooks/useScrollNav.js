import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Smart navbar visibility hook:
 * - Hide when scrolling down
 * - Show when scrolling up
 * - Show after 2s when scroll stops
 * - Always visible when near top
 * Accepts optional scrollContainer (DOM element) - when provided, listens to it instead of window.
 */
export function useScrollNav(scrollContainer) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  const scrollTimeoutRef = useRef(null);

  const SHOW_AFTER_IDLE_MS = 2000;
  const SCROLL_THRESHOLD = 5;
  const TOP_OFFSET = 80;

  const clearAllTimeouts = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
  }, []);

  const showNav = useCallback(() => {
    clearAllTimeouts();
    setVisible(true);
  }, [clearAllTimeouts]);

  const hideNav = useCallback(() => {
    clearAllTimeouts();
    setVisible(false);
    scrollTimeoutRef.current = setTimeout(() => setVisible(true), SHOW_AFTER_IDLE_MS);
  }, [clearAllTimeouts]);

  useEffect(() => {
    const getScrollY = () => {
      if (scrollContainer) return scrollContainer.scrollTop;
      return window.scrollY ?? document.documentElement?.scrollTop ?? 0;
    };

    const handleScroll = () => {
      const currentY = getScrollY();
      const deltaY = currentY - lastY.current;

      if (currentY < TOP_OFFSET) {
        showNav();
        lastY.current = currentY;
        return;
      }

      if (deltaY > SCROLL_THRESHOLD) {
        hideNav();
      } else if (deltaY < -SCROLL_THRESHOLD) {
        clearAllTimeouts();
        setVisible(true);
      }

      lastY.current = currentY;
    };

    const onWheel = (e) => {
      const y = getScrollY();
      if (scrollContainer && y < TOP_OFFSET) {
        showNav();
        return;
      }
      if (e.deltaY > 8) hideNav();
      else if (e.deltaY < -8) {
        clearAllTimeouts();
        setVisible(true);
      }
    };

    lastY.current = getScrollY();

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      scrollContainer.addEventListener('wheel', onWheel, { passive: true });
      return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
        scrollContainer.removeEventListener('wheel', onWheel);
        clearAllTimeouts();
      };
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wheel', onWheel);
      clearAllTimeouts();
    };
  }, [showNav, hideNav, clearAllTimeouts, scrollContainer]);

  return { visible };
}
