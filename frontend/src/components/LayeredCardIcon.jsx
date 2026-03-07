/** Layered graphic – multiple translucent shapes stacked for depth */

const ICONS = {
  megaphone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 sm:w-12 sm:h-12">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 sm:w-12 sm:h-12">
      <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 sm:w-12 sm:h-12">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  ),
  books: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 sm:w-12 sm:h-12">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
};

const LAYER_STYLES = {
  1: {
    layers: [
      { inset: 'inset-0', rounded: 'rounded-[28px]', bg: 'bg-orange-300/15', offset: 'translate(24px,24px)', z: 'z-0' },
      { inset: 'inset-1', rounded: 'rounded-[24px]', bg: 'bg-orange-400/25', offset: 'translate(16px,16px)', z: 'z-[1]' },
      { inset: 'inset-3', rounded: 'rounded-[20px]', bg: 'bg-rose-500/40', offset: 'translate(8px,8px)', z: 'z-[2]' },
    ],
    front: 'from-orange-400 via-rose-400 to-rose-500',
  },
  2: {
    layers: [
      { inset: 'inset-0', rounded: 'rounded-[28px]', bg: 'bg-pink-300/18', offset: 'translate(24px,24px)', z: 'z-0' },
      { inset: 'inset-1', rounded: 'rounded-[24px]', bg: 'bg-pink-400/30', offset: 'translate(16px,16px)', z: 'z-[1]' },
      { inset: 'inset-3', rounded: 'rounded-[20px]', bg: 'bg-orange-400/50', offset: 'translate(8px,8px)', z: 'z-[2]' },
    ],
    front: 'from-pink-400 via-orange-400 to-pink-500',
  },
  3: {
    layers: [
      { inset: 'inset-0', rounded: 'rounded-[28px]', bg: 'bg-purple-300/20', offset: 'translate(24px,24px)', z: 'z-0' },
      { inset: 'inset-1', rounded: 'rounded-[24px]', bg: 'bg-purple-500/35', offset: 'translate(16px,16px)', z: 'z-[1]' },
      { inset: 'inset-3', rounded: 'rounded-[20px]', bg: 'bg-fuchsia-400/50', offset: 'translate(8px,8px)', z: 'z-[2]' },
    ],
    front: 'from-purple-400 via-pink-500 to-fuchsia-500',
  },
  4: {
    layers: [
      { inset: 'inset-0', rounded: 'rounded-[28px]', bg: 'bg-rose-300/18', offset: 'translate(24px,24px)', z: 'z-0' },
      { inset: 'inset-1', rounded: 'rounded-[24px]', bg: 'bg-rose-500/35', offset: 'translate(16px,16px)', z: 'z-[1]' },
      { inset: 'inset-3', rounded: 'rounded-[20px]', bg: 'bg-red-500/50', offset: 'translate(8px,8px)', z: 'z-[2]' },
    ],
    front: 'from-rose-400 via-red-500 to-rose-500',
  },
};

export default function LayeredCardIcon({ type, variant }) {
  const Icon = ICONS[type] || ICONS.video;
  const style = LAYER_STYLES[variant] || LAYER_STYLES[1];

  return (
    <div className="relative shrink-0 w-36 h-36 sm:w-40 sm:h-40 overflow-visible">
      {/* Back layers – translucent, progressively offset */}
      {style.layers.map((layer, i) => (
        <div
          key={i}
          className={`absolute ${layer.inset} ${layer.rounded} ${layer.bg} ${layer.z} transition-transform duration-300`}
          style={{
            transform: layer.offset,
            boxShadow: i === 0 ? '0 16px 40px -12px rgba(0,0,0,0.25)' : i === 1 ? '0 12px 28px -8px rgba(0,0,0,0.2)' : '0 8px 20px -6px rgba(0,0,0,0.18)',
          }}
        />
      ))}
      {/* Front – solid gradient, glossy, icon */}
      <div
        className={`layered-icon-front absolute bottom-0 right-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br ${style.front} flex items-center justify-center text-white layer-icon-float`}
        style={{ animationDelay: `${(variant - 1) * 0.5}s` }}
      >
        <span className="inline-flex drop-shadow-md">{Icon}</span>
      </div>
    </div>
  );
}
