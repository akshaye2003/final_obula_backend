/**
 * StarfieldBackground – warm particle field on pure black.
 * Canvas-based, performant, warm-toned (#D4AF37 / #C9A962).
 * Particles drift, twinkle, with depth-based parallax on scroll.
 */
import { useRef, useEffect, useCallback } from 'react';
import { useScrollContext } from '../context/ScrollContext.jsx';

const PARTICLE_COUNT = 500;
const GOLD = '#D4AF37';
const WARM_WHITE = '#FFF8E7';
const SOFT_GOLD = '#E8D4A0';
const FAINT_GOLD = '#C9A962';

function random(min, max) {
  return min + Math.random() * (max - min);
}

function pick(...arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hexToRgba(hex, a) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return `rgba(255,248,231,${a})`;
  return `rgba(${parseInt(m[0], 16)}, ${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${a})`;
}

export default function StarfieldBackground({ className = '' }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const particlesRef = useRef([]);
  const fallbackScrollRef = useRef(0);
  const timeRef = useRef(0);
  const scrollCtx = useScrollContext();
  const scrollYRef = scrollCtx?.scrollYRef ?? fallbackScrollRef;

  const initParticles = useCallback((width, height) => {
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const sizeRand = Math.random();
      let size;
      let glowSize;
      if (sizeRand < 0.6) {
        size = random(1, 2);
        glowSize = 0;
      } else if (sizeRand < 0.9) {
        size = random(2.5, 4);
        glowSize = size * 1.2;
      } else {
        size = random(5, 8);
        glowSize = size * 2.2;
      }
      const depth = random(0.2, 1);
      particles.push({
        x: random(0, width),
        y: random(0, height),
        vx: random(-0.12, 0.12),
        vy: random(-0.12, 0.12),
        size,
        glowSize,
        baseAlpha: depth > 0.7 ? random(0.45, 0.7) : depth > 0.4 ? random(0.3, 0.55) : random(0.1, 0.35),
        twinkleSpeed: Math.random() < 0.25 ? random(0.003, 0.008) : 0,
        twinklePhase: random(0, Math.PI * 2),
        color: pick(WARM_WHITE, WARM_WHITE, SOFT_GOLD, FAINT_GOLD, GOLD),
        depth,
      });
    }
    return particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReducedMotion) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    let width = window.innerWidth;
    let height = window.innerHeight;

    const setSize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
      particlesRef.current = initParticles(width, height);
    };

    setSize();
    window.addEventListener('resize', setSize);

    const handleWindowScroll = () => {
      const el = document.scrollingElement || document.documentElement;
      fallbackScrollRef.current = el.scrollTop;
    };
    window.addEventListener('scroll', handleWindowScroll, { passive: true });

    const draw = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;
      const scrollY = scrollCtx?.scrollYRef ? scrollYRef.current : fallbackScrollRef.current;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.y += p.depth * 0.02;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        let alpha = p.baseAlpha;
        if (p.twinkleSpeed > 0) {
          alpha *= 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * p.twinkleSpeed + p.twinklePhase));
        }

        const parallaxOffset = scrollY * p.depth * 0.12;
        let drawY = p.y - (parallaxOffset % height);
        const drawY2 = drawY < 0 ? drawY + height : drawY - height;
        const ys = [];
        if (drawY >= -20 && drawY <= height + 20) ys.push(drawY);
        if (drawY2 >= -20 && drawY2 <= height + 20) ys.push(drawY2);

        for (const y of ys) {
          if (y < -20 || y > height + 20) continue;

          if (p.glowSize > 0) {
            const gradient = ctx.createRadialGradient(
              p.x, y, 0,
              p.x, y, p.glowSize
            );
            gradient.addColorStop(0, hexToRgba(p.color, alpha * 0.5));
            gradient.addColorStop(0.35, hexToRgba(p.color, alpha * 0.08));
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(p.x, y, p.glowSize, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.fillStyle = hexToRgba(p.color, alpha);
          ctx.beginPath();
          ctx.arc(p.x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', setSize);
      window.removeEventListener('scroll', handleWindowScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [initParticles, scrollCtx]);

  return (
    <canvas
      ref={canvasRef}
      className={`starfield-background ${className}`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}
