import { useState, useEffect } from 'react';

/**
 * Returns scroll progress 0..1 based on document height.
 * Powers scroll-linked animations like melboucierayane.
 */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(Math.max(window.scrollY / h, 0), 1));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return progress;
}
