import { useEffect, useState } from 'react';
import { m } from 'framer-motion';

/**
 * Premium "Scroll Down" cue: text, mouse icon with scroll wheel, animated arrows.
 * Matches the wireframe/3D background aesthetic.
 */
export default function ScrollDownIndicator({ visible = true, className = '' }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq?.matches ?? false);
  }, []);

  const wheelAnim = reduceMotion ? { y: 0, opacity: 1 } : {
    y: [0, 5, 0],
    opacity: [0.7, 1, 0.7],
  };
  const wheelTrans = reduceMotion ? {} : {
    duration: 2.2,
    repeat: Infinity,
    ease: [0.4, 0, 0.2, 1],
  };
  const arrowAnim = reduceMotion ? { y: 0, opacity: 0.8 } : {
    y: [0, 5, 0],
    opacity: [0.6, 1, 0.6],
  };
  const arrowTrans = reduceMotion ? {} : {
    duration: 1.6,
    repeat: Infinity,
    ease: [0.4, 0, 0.2, 1],
  };

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={visible ? { opacity: 1 } : { opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.8, duration: 0.4 }}
      className={`flex flex-col items-center gap-1.5 ${className}`}
    >
      <span className="text-[10px] sm:text-xs font-medium uppercase tracking-[0.35em] text-white/50">
        Scroll Down
      </span>

      {/* Mouse icon – vertical oval outline with animated scroll wheel */}
      <div className="relative w-7 h-11 rounded-full border-2 border-white/25">
        <m.div
          className="absolute left-1/2 w-0.5 h-2 -ml-px rounded-full bg-white/45"
          style={{ top: 10 }}
          animate={wheelAnim}
          transition={wheelTrans}
        />
      </div>

      {/* Animated downward chevrons – sequential bounce */}
      <div className="flex flex-col items-center -mt-1">
        <m.svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-white/45"
          animate={arrowAnim}
          transition={{ ...arrowTrans, delay: 0 }}
        >
          <path
            d="M4 6L7 9L10 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.svg>
        <m.svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="text-white/35 -mt-2"
          animate={arrowAnim}
          transition={{ ...arrowTrans, delay: reduceMotion ? 0 : 0.25 }}
        >
          <path
            d="M4 6L7 9L10 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.svg>
      </div>
    </m.div>
  );
}
