import { useEffect, useState } from 'react';
import { AnimatePresence, motion as M } from 'framer-motion';

const PARTICLES = [
  { id:0,  cx:12,  cy:18, r:1.2, delay:0.3, dur:3.4 },
  { id:1,  cx:85,  cy:12, r:0.9, delay:0.8, dur:2.8 },
  { id:2,  cx:52,  cy:6,  r:1.5, delay:0.1, dur:3.2 },
  { id:3,  cx:92,  cy:42, r:1.0, delay:1.1, dur:2.6 },
  { id:4,  cx:8,   cy:58, r:1.3, delay:0.5, dur:3.5 },
  { id:5,  cx:70,  cy:80, r:0.9, delay:1.3, dur:2.9 },
  { id:6,  cx:28,  cy:88, r:1.4, delay:0.7, dur:3.1 },
  { id:7,  cx:63,  cy:93, r:1.0, delay:0.4, dur:2.7 },
  { id:8,  cx:4,   cy:34, r:1.1, delay:1.5, dur:3.6 },
  { id:9,  cx:96,  cy:68, r:0.8, delay:0.9, dur:2.5 },
  { id:10, cx:40,  cy:4,  r:1.6, delay:0.6, dur:3.3 },
  { id:11, cx:77,  cy:52, r:1.0, delay:1.0, dur:2.4 },
  { id:12, cx:20,  cy:46, r:0.9, delay:1.4, dur:3.0 },
  { id:13, cx:87,  cy:28, r:1.3, delay:0.2, dur:2.9 },
  { id:14, cx:46,  cy:97, r:1.0, delay:0.7, dur:3.7 },
];

export default function SplashScreen({ onComplete }) {
  const [exiting,  setExiting]  = useState(false);
  const [showRays, setShowRays] = useState(false);

  useEffect(() => {
    // Light-ray burst at logo entrance
    const raysT = setTimeout(() => setShowRays(true), 300);

    const exitT = setTimeout(() => setExiting(true), 3200);
    return () => { clearTimeout(raysT); clearTimeout(exitT); };
  }, []);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {!exiting && (
        <M.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.06, filter: 'brightness(2)' }}
          transition={{
            opacity: { duration: 0.25 },
            exit:    { duration: 0.55, ease: [0.4, 0, 0.2, 1] },
          }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none"
          style={{ background: '#07070A' }}
        >
          {/* ─── keyframes ─── */}
          <style>{`
            @keyframes radar {
              from { transform: translate(-50%,-50%) rotate(0deg); }
              to   { transform: translate(-50%,-50%) rotate(360deg); }
            }
            @keyframes radar-rev {
              from { transform: translate(-50%,-50%) rotate(0deg); }
              to   { transform: translate(-50%,-50%) rotate(-360deg); }
            }
            @keyframes ripple {
              0%   { transform: translate(-50%,-50%) scale(.55); opacity: .9; }
              100% { transform: translate(-50%,-50%) scale(2.6);  opacity: 0; }
            }
            @keyframes logo-bloom {
              0%   { transform: scale(.15);  opacity: 0; filter: brightness(12) blur(18px) saturate(2); }
              35%  {                                      filter: brightness(3)  blur(2px);  }
              65%  { transform: scale(1.06);              filter: brightness(1.3) blur(0); }
              100% { transform: scale(1);   opacity: 1;  filter: brightness(1)  blur(0) drop-shadow(0 0 28px rgba(212,175,55,.55)) drop-shadow(0 0 6px rgba(212,175,55,.3)); }
            }
            @keyframes ray-burst {
              0%   { opacity: 0; transform: translate(-50%,-50%) scale(.3) rotate(0deg); }
              20%  { opacity: .22; }
              100% { opacity: 0;  transform: translate(-50%,-50%) scale(1.8) rotate(15deg); }
            }
            @keyframes orbit-a {
              from { transform: rotate(0deg)   translateX(94px) rotate(0deg); }
              to   { transform: rotate(360deg) translateX(94px) rotate(-360deg); }
            }
            @keyframes orbit-b {
              from { transform: rotate(120deg)  translateX(94px) rotate(-120deg); }
              to   { transform: rotate(480deg)  translateX(94px) rotate(-480deg); }
            }
            @keyframes orbit-c {
              from { transform: rotate(240deg)  translateX(94px) rotate(-240deg); }
              to   { transform: rotate(600deg)  translateX(94px) rotate(-600deg); }
            }
            @keyframes dot-glow {
              0%,100% { box-shadow: 0 0 5px 1px rgba(212,175,55,.7); }
              50%     { box-shadow: 0 0 10px 3px rgba(212,175,55,1); }
            }
            @keyframes float-up {
              0%,100% { opacity: 0; transform: translateY(0) scale(1); }
              20%     { opacity: .8; }
              80%     { opacity: .4; }
              100%    { opacity: 0; transform: translateY(-32px) scale(.3); }
            }
            @keyframes glow-breathe {
              0%,100% { opacity: .45; transform: translate(-50%,-50%) scale(1); }
              50%     { opacity: .85; transform: translate(-50%,-50%) scale(1.14); }
            }
            @keyframes shimmer {
              from { transform: translateX(-200%) skewX(-18deg); }
              to   { transform: translateX(200%)  skewX(-18deg); }
            }
            @keyframes bar-fill {
              from { width: 0%; }
              to   { width: 100%; }
            }
          `}</style>

          {/* ─── star/particle field ─── */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid slice"
          >
            {PARTICLES.map(p => (
              <circle
                key={p.id} cx={p.cx} cy={p.cy} r={p.r}
                fill="rgba(212,175,55,.6)"
                style={{ animation: `float-up ${p.dur}s ${p.delay}s ease-in-out infinite`, opacity: 0 }}
              />
            ))}
          </svg>

          {/* ─── ambient bloom ─── */}
          <div style={{
            position: 'absolute', width: 560, height: 560,
            top: '50%', left: '50%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(201,169,98,.07) 0%, transparent 65%)',
            animation: 'glow-breathe 3.5s ease-in-out infinite',
          }} />

          {/* ─── light rays (burst on logo entrance) ─── */}
          {showRays && (
            <div style={{
              position: 'absolute', width: 500, height: 500,
              top: '50%', left: '50%',
              background: `conic-gradient(
                transparent 0deg, transparent 18deg,
                rgba(212,175,55,.08) 20deg, transparent 24deg,
                transparent 44deg,
                rgba(212,175,55,.12) 46deg, transparent 50deg,
                transparent 70deg,
                rgba(212,175,55,.06) 72deg, transparent 76deg,
                transparent 118deg,
                rgba(212,175,55,.10) 120deg, transparent 124deg,
                transparent 160deg,
                rgba(212,175,55,.08) 162deg, transparent 166deg,
                transparent 195deg,
                rgba(212,175,55,.12) 197deg, transparent 201deg,
                transparent 240deg,
                rgba(212,175,55,.07) 242deg, transparent 246deg,
                transparent 280deg,
                rgba(212,175,55,.09) 282deg, transparent 286deg,
                transparent 310deg,
                rgba(212,175,55,.11) 312deg, transparent 316deg,
                transparent 360deg
              )`,
              animation: 'ray-burst 1.8s ease-out forwards',
              pointerEvents: 'none',
            }} />
          )}

          {/* ─── radar sweep (conic gradient donut) ─── */}
          <div style={{
            position: 'absolute', width: 280, height: 280,
            top: '50%', left: '50%',
            borderRadius: '50%',
            background: `conic-gradient(
              transparent 0deg,
              transparent 255deg,
              rgba(201,169,98,.04) 270deg,
              rgba(201,169,98,.25) 315deg,
              rgba(255,235,160,.65) 355deg,
              rgba(201,169,98,.2) 360deg
            )`,
            WebkitMaskImage: 'radial-gradient(circle, transparent 56px, black 58px, black 138px, transparent 140px)',
            maskImage:       'radial-gradient(circle, transparent 56px, black 58px, black 138px, transparent 140px)',
            animation: 'radar 2.4s linear infinite',
            pointerEvents: 'none',
          }} />

          {/* ─── reverse radar (dimmer, slower) ─── */}
          <div style={{
            position: 'absolute', width: 340, height: 340,
            top: '50%', left: '50%',
            borderRadius: '50%',
            background: `conic-gradient(
              transparent 0deg,
              transparent 300deg,
              rgba(201,169,98,.06) 330deg,
              rgba(201,169,98,.15) 355deg,
              transparent 360deg
            )`,
            WebkitMaskImage: 'radial-gradient(circle, transparent 68px, black 70px, black 168px, transparent 170px)',
            maskImage:       'radial-gradient(circle, transparent 68px, black 70px, black 168px, transparent 170px)',
            animation: 'radar-rev 5s linear infinite',
            pointerEvents: 'none',
          }} />

          {/* ─── ripple rings ─── */}
          {[0, 0.8, 1.6].map((delay, i) => (
            <div key={i} style={{
              position: 'absolute', width: 160, height: 160,
              top: '50%', left: '50%', borderRadius: '50%',
              border: `${i === 0 ? 1.5 : 1}px solid rgba(201,169,98,${i === 0 ? .55 : .35})`,
              animation: `ripple 2.4s ${delay}s ease-out infinite`,
              pointerEvents: 'none',
            }} />
          ))}

          {/* ─── orbiting dots ─── */}
          {['orbit-a', 'orbit-b', 'orbit-c'].map((anim, i) => (
            <div key={i} style={{
              position: 'absolute', top: '50%', left: '50%',
              width: 7, height: 7, marginTop: -3.5, marginLeft: -3.5,
              borderRadius: '50%',
              background: i === 1 ? '#E8DCC4' : '#C9A962',
              animation: `${anim} ${2.6 + i * 0.4}s linear infinite, dot-glow 1.8s ease-in-out infinite`,
              pointerEvents: 'none',
            }} />
          ))}

          {/* ─── logo bloom with text ─── */}
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 140 }}>
            {/* halo */}
            <div style={{
              position: 'absolute', width: 220, height: 220,
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(212,175,55,.35) 0%, transparent 70%)',
              filter: 'blur(28px)',
              animation: 'glow-breathe 2.2s ease-in-out infinite',
              pointerEvents: 'none',
            }} />

            {/* logo + shimmer */}
            <div style={{
              position: 'relative', width: 140, height: 140, overflow: 'hidden',
              animation: 'logo-bloom .9s .15s cubic-bezier(.16,1,.3,1) both',
            }}>
              <img
                src="/logo.png"
                alt="Obula"
                draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', position: 'relative', zIndex: 1 }}
              />
              {/* shimmer sweep — fires once at ~1.2s */}
              <div style={{
                position: 'absolute', inset: 0, zIndex: 2,
                overflow: 'hidden', mixBlendMode: 'screen', pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, width: '55%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,240,170,.65), transparent)',
                  animation: 'shimmer .8s 1.1s ease-in-out forwards',
                  transform: 'translateX(-200%) skewX(-18deg)',
                }} />
              </div>
            </div>
            
            {/* OBULA text below logo - positioned lower */}
            <div style={{
              marginTop: 32,
              fontSize: 42,
              fontWeight: 800,
              letterSpacing: '0.15em',
              fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
              background: 'linear-gradient(135deg, #F0E6C8 0%, #C9A962 45%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'logo-bloom .9s .25s cubic-bezier(.16,1,.3,1) both',
            }}>
              OBULA
            </div>
          </div>



          {/* ─── tagline ─── */}
          <M.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.6 }}
            style={{
              position: 'relative', zIndex: 10,
              marginTop: 8,
              fontSize: 10, letterSpacing: '0.38em',
              textTransform: 'uppercase',
              color: 'rgba(201,169,98,.42)',
              fontFamily: "'Plus Jakarta Sans', ui-sans-serif",
            }}
          >
            AI Video Generator
          </M.p>

          {/* ─── bottom progress bar ─── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, height: 2,
            background: 'linear-gradient(90deg, transparent, #C9A962, #F0E6C8, #D4AF37, transparent)',
            animation: 'bar-fill 3s .25s cubic-bezier(.4,0,.2,1) forwards',
            width: 0,
            pointerEvents: 'none',
          }} />
        </M.div>
      )}
    </AnimatePresence>
  );
}
