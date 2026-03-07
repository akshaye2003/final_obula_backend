/** Simple icon box – semi-transparent colored background, white icon */

const ICONS = {
  megaphone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 sm:w-11 sm:h-11">
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 sm:w-11 sm:h-11">
      <path d="m16 10 4.553-2.276A1 1 0 0 1 22 8.618v6.764a1 1 0 0 1-1.447.894L16 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 sm:w-11 sm:h-11">
      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
    </svg>
  ),
  books: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 sm:w-11 sm:h-11">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
    </svg>
  ),
};

export default function CardIcon({ type, bg }) {
  const Icon = ICONS[type] || ICONS.video;
  return (
    <div
      className={`shrink-0 w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-xl ${bg} flex items-center justify-center text-white shadow-[0_8px_24px_-4px_rgba(0,0,0,0.3)]`}
      style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.15) inset' }}
    >
      <span className="inline-flex">{Icon}</span>
    </div>
  );
}
