const INSTAGRAM_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const YOUTUBE_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const OPTIONS = [
  { platform: 'instagram', icon: INSTAGRAM_ICON, label: 'Reels', ratio: '9:16', value: 'instagram-reels' },
  { platform: 'instagram', icon: INSTAGRAM_ICON, label: 'Story', ratio: '9:16', value: 'instagram-story' },
  { platform: 'instagram', icon: INSTAGRAM_ICON, label: 'Post', ratio: '1:1', value: 'instagram-post' },
  { platform: 'youtube', icon: YOUTUBE_ICON, label: 'Video', ratio: '16:9', value: 'youtube-video' },
  { platform: 'youtube', icon: YOUTUBE_ICON, label: 'Shorts', ratio: '9:16', value: 'youtube-shorts' },
];

export default function AspectRatioSelector({ value, onChange, compact }) {
  const selected = Array.isArray(value) ? value : value ? [value] : ['instagram-reels'];

  const handleToggle = (opt) => {
    const isSelected = selected.includes(opt.value);
    let next;
    if (isSelected) {
      next = selected.filter((v) => v !== opt.value);
      if (next.length === 0) next = ['instagram-reels'];
    } else {
      next = [...selected, opt.value];
    }
    onChange?.(next);
  };

  if (compact) {
    return (
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-white/60 mb-2 uppercase tracking-wider">Aspect ratio</label>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleToggle(opt)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition border ${
                  isSelected ? 'bg-primary text-white border-primary' : 'bg-zinc-100 dark:bg-black/80 border-zinc-300 dark:border-white/20 text-zinc-700 dark:text-white/80 hover:border-primary/50'
                }`}
              >
                {opt.icon}
                <span>{opt.label}</span>
                {isSelected && <span>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 dark:text-white/70 mb-3">Aspect Ratio</label>
      <p className="text-zinc-500 dark:text-white/50 text-xs mb-2">Select multiple to export for different platforms</p>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-zinc-500 dark:text-white/50 text-xs font-medium uppercase tracking-wider">Instagram</span>
            <span className="text-pink-500">{INSTAGRAM_ICON}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.filter((o) => o.platform === 'instagram').map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleToggle(opt)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition border ${
                    isSelected
                      ? 'bg-primary text-white border-primary'
                      : 'bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-white/80 border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-white/10 hover:border-primary/50'
                  }`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                  <span className="text-zinc-500 dark:text-white/60 text-xs">({opt.ratio})</span>
                  {isSelected && <span className="ml-0.5">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-zinc-500 dark:text-white/50 text-xs font-medium uppercase tracking-wider">YouTube</span>
            <span className="text-red-500">{YOUTUBE_ICON}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.filter((o) => o.platform === 'youtube').map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleToggle(opt)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition border ${
                    isSelected
                      ? 'bg-primary text-white border-primary'
                      : 'bg-zinc-100 dark:bg-white/5 text-zinc-700 dark:text-white/80 border-zinc-200 dark:border-white/10 hover:bg-zinc-200 dark:hover:bg-white/10 hover:border-primary/50'
                  }`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                  <span className="text-zinc-500 dark:text-white/60 text-xs">({opt.ratio})</span>
                  {isSelected && <span className="ml-0.5">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
