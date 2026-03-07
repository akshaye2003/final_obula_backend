import { useState } from 'react';

const PRESETS = {
  Classic: { text_color: '#ffffff', bg_color: 'transparent', font_size: 58, border_width: 4 },
  Vibrant: { text_color: '#fbbf24', bg_color: 'transparent', font_size: 56, border_width: 4 },
  Ocean: { text_color: '#22d3ee', bg_color: 'transparent', font_size: 54, border_width: 4 },
  Sunset: { text_color: '#fb923c', bg_color: 'transparent', font_size: 56, border_width: 4 },
  Forest: { text_color: '#4ade80', bg_color: 'transparent', font_size: 54, border_width: 4 },
  Neon: { text_color: '#a78bfa', bg_color: 'transparent', font_size: 56, border_width: 5 },
  Coral: { text_color: '#f472b6', bg_color: 'transparent', font_size: 54, border_width: 4 },
  Mint: { text_color: '#34d399', bg_color: 'transparent', font_size: 54, border_width: 4 },
};

function findPresetName(style) {
  if (!style) return 'Classic';
  const h = toHex(style.text_color);
  return Object.keys(PRESETS).find(
    (name) => toHex(PRESETS[name].text_color) === h && PRESETS[name].bg_color === (style.bg_color || 'transparent')
  ) || null;
}

function toHex(c) {
  if (!c || (typeof c === 'string' && c.startsWith('#'))) return c || '#ffffff';
  const names = { white: '#ffffff', yellow: '#eab308', black: '#000000', transparent: 'transparent' };
  return names[c?.toLowerCase()] || c;
}

export default function CaptionStyleForm({ value, onChange, previewFrameUrl }) {
  const style = value || PRESETS.Classic;
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [sampleText, setSampleText] = useState('Your caption will look like this');
  const effectivePreset = selectedPreset || findPresetName(style) || 'Classic';

  const applyPreset = (name) => {
    setSelectedPreset(name);
    onChange?.(PRESETS[name]);
  };

  const updateStyle = (key, val) => {
    setSelectedPreset(null);
    const next = { ...style, [key]: val };
    onChange?.(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-widest">Caption style</label>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => applyPreset(name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                effectivePreset === name
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-zinc-600 dark:text-white/70 mb-2">Font size (30–80)</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={30}
              max={80}
              value={style.font_size ?? 56}
              onChange={(e) => updateStyle('font_size', Number(e.target.value))}
              className="flex-1 h-2 bg-zinc-200 dark:bg-white/10 appearance-none cursor-pointer accent-primary"
            />
            <span className="text-zinc-900 dark:text-white font-medium w-8 text-right">{style.font_size ?? 56}</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-600 dark:text-white/70 mb-2">Text color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={toHex(style.text_color)}
              onChange={(e) => updateStyle('text_color', e.target.value)}
              className="w-10 h-10 rounded-lg border-2 border-zinc-300 dark:border-white/20 cursor-pointer bg-transparent"
            />
            <span className="text-zinc-500 dark:text-white/50 text-sm">{style.text_color || 'Custom'}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-widest">
          {previewFrameUrl ? 'Live preview on your video' : 'Sample caption'}
        </label>
        <div
          className="w-full rounded-lg overflow-hidden flex items-end justify-center min-h-[140px] aspect-[9/16] max-h-[200px] bg-black"
          style={{
            backgroundImage: previewFrameUrl ? `url(${previewFrameUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: previewFrameUrl ? 'transparent' : (style.bg_color === 'transparent' ? 'rgba(30,30,35,0.9)' : style.bg_color),
          }}
        >
          <span
            className="font-bold text-center max-w-full truncate px-3 pb-4 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
            style={{
              color: toHex(style.text_color),
              fontSize: Math.min(Math.max((style.font_size ?? 56) * 0.35, 12), 28),
              WebkitTextStroke: `${Math.max(1, (style.border_width || 2) * 0.4)}px rgba(0,0,0,0.9)`,
              textShadow: '0 1px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)',
            }}
          >
            {sampleText}
          </span>
        </div>
        <input
          type="text"
          value={sampleText}
          onChange={(e) => setSampleText(e.target.value.slice(0, 50))}
          placeholder="Type to preview on your video..."
          className="mt-2 w-full px-3 py-2 bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:border-primary/50 focus:outline-none rounded-lg"
        />
      </div>
    </div>
  );
}
