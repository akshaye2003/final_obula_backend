import { m } from 'framer-motion';
import { fadeUpSpring, slideInLeft, slideInRight, scaleIn, stagger, viewportOnce, spring, dramaticReveal } from '../lib/motion.js';

/**
 * Scroll-triggered reveal with crazy mad animations.
 */
export function FadeUpReveal({ children, delay = 0, y = 32, className = '' }) {
  return (
    <m.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewportOnce}
      transition={{ ...spring.bouncy, delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}

export function ScaleReveal({ children, delay = 0, className = '' }) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={viewportOnce}
      transition={{ ...spring.snappy, delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}

export function SlideReveal({ children, direction = 'left', delay = 0, className = '' }) {
  const x = direction === 'left' ? -48 : 48;
  return (
    <m.div
      initial={{ opacity: 0, x }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={viewportOnce}
      transition={{ ...spring.snappy, delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}

export function StaggerParent({ children, staggerDelay = 0.08, className = '' }) {
  return (
    <m.div
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: staggerDelay, staggerDirection: 1 },
        },
      }}
      className={className}
    >
      {children}
    </m.div>
  );
}

export function StaggerChild({ children, y = 24, className = '' }) {
  return (
    <m.div
      variants={{
        hidden: { opacity: 0, y },
        visible: {
          opacity: 1,
          y: 0,
          transition: spring.bouncy,
        },
      }}
      className={className}
    >
      {children}
    </m.div>
  );
}

/** Section header reveal – dramatic entrance */
export function BlurReveal({ children, delay = 0, y = 40, className = '' }) {
  return (
    <m.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ ...viewportOnce, amount: 0.15 }}
      transition={{ ...spring.bouncy, delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}

/** Dramatic scale + blur entrance */
export function DramaticReveal({ children, delay = 0, className = '' }) {
  return (
    <m.div
      initial={dramaticReveal.initial}
      whileInView={dramaticReveal.animate}
      viewport={viewportOnce}
      transition={{ ...dramaticReveal.transition, delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}
