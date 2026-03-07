import { useState, useEffect, useRef } from 'react';

export function useInView({ threshold = 0.1, rootMargin, initialInView = false } = {}) {
  const [isInView, setIsInView] = useState(initialInView);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Immediate check for above-fold content (avoids flash of invisible content)
    const rect = el.getBoundingClientRect();
    const winH = window.innerHeight;
    if (rect.top < winH * 0.9 && rect.bottom > 0) {
      setIsInView(true);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { threshold, rootMargin: rootMargin ?? '0px 0px -50px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, initialInView]);

  return [ref, isInView];
}
