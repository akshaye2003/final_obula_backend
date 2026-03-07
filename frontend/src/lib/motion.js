/**
 * Crazy mad animation variants – inspired by melboucierayane.com & premium video-creator UX.
 * Spring physics, stagger cascades, scroll-triggered drama.
 */

export const spring = {
  snappy: { type: 'spring', stiffness: 400, damping: 25 },
  bouncy: { type: 'spring', stiffness: 300, damping: 20 },
  wobble: { type: 'spring', stiffness: 180, damping: 12 },
  smooth: { type: 'spring', stiffness: 120, damping: 24 },
};

export const stagger = (delay = 0.08) => ({
  animate: {
    transition: {
      staggerChildren: delay,
      staggerDirection: 1,
    },
  },
});

export const fadeUp = (y = 24) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
});

export const fadeUpSpring = (y = 32) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: spring.bouncy,
});

export const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: spring.snappy,
};

export const slideInLeft = {
  initial: { opacity: 0, x: -48 },
  animate: { opacity: 1, x: 0 },
  transition: spring.snappy,
};

export const slideInRight = {
  initial: { opacity: 0, x: 48 },
  animate: { opacity: 1, x: 0 },
  transition: spring.snappy,
};

export const heroLine = (i) => ({
  initial: { opacity: 0, y: 40, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
  },
  transition: {
    ...spring.bouncy,
    delay: 0.1 + i * 0.12,
  },
});

export const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.02,
    y: -8,
    transition: spring.snappy,
  },
};

export const btnHover = {
  scale: 1.03,
  transition: { duration: 0.2 },
};

export const viewportOnce = { once: true, amount: 0.2, margin: '-50px' };

/** Blur-in reveal – melboucierayane living sections */
export const blurIn = (blurPx = 16, y = 32) => ({
  initial: { opacity: 0, y, filter: `blur(${blurPx}px)` },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: spring.bouncy,
});

/** Scale + blur for dramatic section entrance */
export const dramaticReveal = {
  initial: { opacity: 0, scale: 0.92, filter: 'blur(12px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  transition: spring.wobble,
};
