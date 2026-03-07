import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import LandingNav from '../components/LandingNav.jsx';
import { useMobile } from '../hooks/useMobile.js';
import { getPrepData, startJob, updatePrepData, generateBrollSuggestions, regeneratePlacementClips, getColorGradePreviews, getBrollClips } from '../api/upload.js';
import { incrementRetry, getLockStatus } from '../api/credits';
import { getAuthHeader, getApiBaseURL, getRawToken } from '../api/client.js';

const GOLD = '#C9A84C';

const CAPTION_PRESETS = [
  { id: 'dynamic_smart', label: 'Dynamic Smart', description: 'Smart vertical captions — finds the best spot so text stays readable.' },
  { id: 'marquee', label: 'Marquee', description: 'Cinematic scrolling text across the screen.' },
  { id: 'split', label: 'Cinematic Captions', description: 'Left/right split captions with word highlighting.' },
  { id: 'viral', label: 'Punchy Captions', description: 'Punchy vertical captions with emphasis on key words.' },
];

const COLOR_GRADES = [
  { value: '', label: 'None', description: 'No color grading' },
  { value: 'vintage', label: 'Vintage', description: 'Warm film emulation' },
  { value: 'cinematic', label: 'Cinematic', description: 'Cinematic film look' },
  { value: 'frosted', label: 'Frosted', description: 'Cool, muted tones' },
  { value: 'foliage', label: 'Foliage', description: 'Rich greens, natural tones' },
  { value: 'cross_process', label: 'Cross Process', description: 'Cross-process film effect' },
  { value: 'bw', label: 'B&W', description: 'Black & white' },
];

const ROUNDED_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];

const ASPECT_RATIOS = [
  { value: '', label: 'Original' },
  { value: '9:16', label: '9:16 Vertical' },
  { value: '1:1', label: '1:1 Square' },
  { value: '4:5', label: '4:5 Portrait' },
];

const STYLE_COLORS = {
  hook: '#ef4444',
  emphasis: GOLD,
  emotional: '#f59e0b',
  regular: '#e2e8f0',
};

const TABS = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'captions',   label: 'Captions' },
  { id: 'broll',      label: 'B-Roll' },
  { id: 'effects',    label: 'Effects' },
  { id: 'export',     label: 'Export' },
];

const CAPTION_POSITIONS = [
  { value: 'bottom', label: 'Bottom', yPosition: 0.85 },
  { value: 'center', label: 'Center', yPosition: 0.50 },
  { value: 'top', label: 'Top', yPosition: 0.15 },
];

const HORIZONTAL_POSITIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const MARQUEE_SPEEDS = [
  { value: 0.5, label: 'Slow' },
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Fast' },
];

const CAPTION_SIZES = [
  { value: 48, label: 'S', tooltip: '48px' },
  { value: 64, label: 'M', tooltip: '64px' },
  { value: 80, label: 'L', tooltip: '80px' },
  { value: 96, label: 'XL', tooltip: '96px' },
];
// Split preset: smaller range so ~3 words fit per side (left/right)
const CAPTION_SIZES_SPLIT = [
  { value: 28, label: 'XS', tooltip: '28px' },
  { value: 36, label: 'S', tooltip: '36px' },
  { value: 44, label: 'M', tooltip: '44px' },
  { value: 52, label: 'L', tooltip: '52px' },
];

const CAPTION_COLORS = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#C9A84C', label: 'Gold' },
  { value: '#00E5FF', label: 'Cyan' },
  { value: '#FF4444', label: 'Red' },
  { value: '#A5FF3C', label: 'Lime' },
  { value: '#FF6BCA', label: 'Pink' },
  { value: '#FFE53B', label: 'Yellow' },
];

const HOOK_SIZES = [
  { value: 0.5, label: 'S' },
  { value: 1, label: 'M' },
  { value: 1.3, label: 'L' },
  { value: 1.6, label: 'XL' },
];

const HOOK_MASK_QUALITY = [
  { value: 'off', label: 'Off', description: 'Use base mask only' },
  { value: 'light', label: 'Light', description: 'Minimal smoothing' },
  { value: 'medium', label: 'Medium', description: 'Balanced' },
  { value: 'strong', label: 'Strong', description: 'Smoother edges' },
  { value: 'maximum', label: 'Maximum', description: 'Sharpest cutout' },
];

const STYLE_CYCLE = ['regular', 'hook', 'emphasis'];

// ---------------------------------------------------------------------------
// ColorGradeButton — button with hover before/after preview
// ---------------------------------------------------------------------------
function ColorGradeButton({ grade, selected, onSelect, previews }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const beforeSrc = previews?.before || '/color-grade-previews/before.png';
  const afterSrc = grade.value ? (previews?.[grade.value] || `/color-grade-previews/${grade.value}.png`) : null;

  const handleMouseEnter = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const popoverWidth = Math.min(300, window.innerWidth - 32);
      const padding = 16;
      let left = r.left + r.width / 2;
      left = Math.max(padding + popoverWidth / 2, Math.min(window.innerWidth - padding - popoverWidth / 2, left));
      setPos({ top: r.bottom + 6, left });
    }
    setHover(true);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHover(false)}
    >
      <button
        ref={btnRef}
        onClick={onSelect}
        className={`px-3 py-1.5 rounded-lg text-xs border transition-all font-semibold ${
          selected ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
        }`}
      >
        {grade.label}
      </button>
      {hover && createPortal(
        <div
          className="fixed z-[9999]"
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translateX(-50%)',
            width: '300px',
            maxWidth: 'calc(100vw - 32px)',
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <div className="bg-[#1a1a1a] border-2 border-[#C9A84C]/50 rounded-xl p-3 shadow-2xl">
            <p className="text-xs font-semibold text-white mb-2">{grade.label} — {grade.description}</p>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-[9px] text-white/60 uppercase tracking-wider block mb-1">Before</span>
                <div className="rounded-lg overflow-hidden border border-white/30 bg-black h-[72px]">
                  <img src={beforeSrc} alt="Original" className="w-full h-full object-cover" />
                </div>
              </div>
              {afterSrc ? (
                <>
                  <div className="flex items-center text-[#C9A84C] text-lg font-bold shrink-0">→</div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] text-[#C9A84C] uppercase tracking-wider block mb-1">After</span>
                    <div className="rounded-lg overflow-hidden border border-[#C9A84C] bg-black h-[72px]">
                      <img src={afterSrc} alt="With grade" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-white/50 self-center">No grading</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TranscriptViewer — editable words + style cycling
// ---------------------------------------------------------------------------
function TranscriptViewer({ styledWords, currentTime, onWordEdit, onStyleChange, onWordDelete, styleColors }) {
  const colors = styleColors || STYLE_COLORS;
  const containerRef = useRef(null);
  const activeRef = useRef(null);
  const menuRef = useRef(null);
  const [editIdx, setEditIdx] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [menuWordIdx, setMenuWordIdx] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const inputRef = useRef(null);

  const isTouchDevice = useMemo(
    () => typeof window !== 'undefined' && ('ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches),
    []
  );

  useEffect(() => {
    // Skip auto-scroll on mobile devices - prevents page jumping when video plays
    if (isTouchDevice) return;
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, isTouchDevice]);

  // Prevent default browser context menu on the transcript container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const preventContextMenu = (e) => {
      // Check if the click is within the transcript container
      if (container.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };
    
    // Add listener to document with capture to catch it early
    document.addEventListener('contextmenu', preventContextMenu, { capture: true });
    return () => document.removeEventListener('contextmenu', preventContextMenu, { capture: true });
  }, []);

  useEffect(() => {
    if (editIdx !== null && inputRef.current) inputRef.current.focus();
  }, [editIdx]);

  useEffect(() => {
    if (menuWordIdx === null) return;
    const close = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (containerRef.current?.contains(e.target)) return;
      setMenuWordIdx(null);
      setMenuAnchor(null);
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', close);
      document.addEventListener('touchstart', close, { passive: true });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menuWordIdx]);

  const commitEdit = useCallback(() => {
    if (editIdx === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      onWordDelete?.(editIdx);
    } else if (trimmed !== styledWords[editIdx]?.word) {
      onWordEdit?.(editIdx, trimmed);
    }
    setEditIdx(null);
  }, [editIdx, editValue, styledWords, onWordEdit, onWordDelete]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') setEditIdx(null);
  }, [commitEdit]);

  const handleContextMenu = useCallback((e, i) => {
    e.preventDefault();
    e.stopPropagation();
    // Force prevent default behavior synchronously
    if (e.nativeEvent) {
      e.nativeEvent.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
    }
    const current = styledWords[i]?.style || 'regular';
    const nextIdx = (STYLE_CYCLE.indexOf(current) + 1) % STYLE_CYCLE.length;
    onStyleChange?.(i, STYLE_CYCLE[nextIdx]);
    return false;
  }, [styledWords, onStyleChange]);

  // Alternative handler using onMouseDown for right-click (fires before contextmenu)
  const handleMouseDown = useCallback((e, i) => {
    if (e.button === 2) { // Right mouse button
      e.preventDefault();
      e.stopPropagation();
      const current = styledWords[i]?.style || 'regular';
      const nextIdx = (STYLE_CYCLE.indexOf(current) + 1) % STYLE_CYCLE.length;
      onStyleChange?.(i, STYLE_CYCLE[nextIdx]);
    }
  }, [styledWords, onStyleChange]);

  const handleWordClick = useCallback((e, i, w) => {
    if (isTouchDevice) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setMenuAnchor(rect);
      setMenuWordIdx(i);
    } else {
      setEditIdx(i);
      setEditValue(w.word);
    }
  }, [isTouchDevice]);

  const applyStyleAndClose = useCallback((style) => {
    if (menuWordIdx !== null) onStyleChange?.(menuWordIdx, style);
    setMenuWordIdx(null);
    setMenuAnchor(null);
  }, [menuWordIdx, onStyleChange]);

  const openEditFromMenu = useCallback(() => {
    if (menuWordIdx !== null) {
      setEditIdx(menuWordIdx);
      setEditValue(styledWords[menuWordIdx]?.word ?? '');
    }
    setMenuWordIdx(null);
    setMenuAnchor(null);
  }, [menuWordIdx, styledWords]);

  if (!styledWords?.length) return null;

  const styleMenu = menuWordIdx !== null && menuAnchor && (() => {
    const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - menuAnchor.bottom : 200;
    const showAbove = spaceBelow < 180;
    return createPortal(
      <div
      ref={menuRef}
      className="fixed z-[9999] flex flex-col gap-0.5 rounded-lg border border-white/20 bg-[#1a1a1a] py-1.5 px-1 shadow-xl"
      style={{
        left: Math.min(menuAnchor.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - 180),
        top: showAbove ? menuAnchor.top - 6 : menuAnchor.bottom + 6,
        transform: showAbove ? 'translateY(-100%)' : undefined,
        minWidth: 140,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {STYLE_CYCLE.map((style) => (
        <button
          key={style}
          type="button"
          onClick={() => applyStyleAndClose(style)}
          className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/10 active:bg-white/15"
        >
          <span
            className="h-3 w-3 shrink-0 rounded-full border border-white/30"
            style={{ backgroundColor: colors[style] || colors.regular }}
          />
          <span className="capitalize">{style}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={openEditFromMenu}
        className="mt-1 flex items-center gap-2 rounded border-t border-white/10 px-3 py-2 text-left text-sm text-[#C9A84C] transition-colors hover:bg-white/10 active:bg-white/15"
      >
        <span className="text-base">✎</span>
        <span>Edit word</span>
      </button>
    </div>,
    document.body
  );
})();

  return (
    <div ref={containerRef} className="max-h-72 overflow-y-auto pr-2 -mr-1 slim-scroll">
      {styleMenu}
      <div className="flex flex-wrap gap-x-1.5 gap-y-2 leading-[1.7] text-[15px]">
        {styledWords.map((w, i) => {
          const isActive = currentTime >= w.start && currentTime <= w.end;
          const color = colors[w.style] || colors.regular;
          const isEditing = editIdx === i;

          if (isEditing) {
            return (
              <input
                key={i}
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKeyDown}
                className="text-[15px] bg-white/[0.08] border border-[#C9A84C]/50 rounded-md px-2 py-0.5 outline-none focus:ring-1 focus:ring-[#C9A84C]/40 text-white min-w-[2ch]"
                style={{ width: `${Math.max(2, editValue.length + 1)}ch`, color }}
              />
            );
          }

          return (
            <span
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={(e) => handleWordClick(e, i, w)}
              onContextMenu={(e) => handleContextMenu(e, i)}
              onMouseDown={(e) => handleMouseDown(e, i)}
              className={`transition-all duration-200 cursor-pointer rounded-md select-none inline-block pointer-events-auto ${
                isActive
                  ? 'font-semibold ring-1 ring-white/20'
                  : 'hover:bg-white/[0.06]'
              }`}
              style={{
                color,
                backgroundColor: isActive ? 'rgba(201,168,76,0.12)' : undefined,
                padding: '2px 6px',
              }}
              title={isTouchDevice ? 'Tap to change style or edit' : 'Click to edit · Right-click to change style'}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HookPreviewOverlay — shows giant hook text on video preview when Hook Text is on
// ---------------------------------------------------------------------------
function HookPreviewOverlay({ redHook, hookYPercent, hookHorizontal, hookSize, hookColor, styledWords, currentTime }) {
  const hookPhrase = useMemo(() => {
    if (!redHook) return null;
    if (!styledWords?.length) return null;
    const hooks = [];
    for (const w of styledWords) {
      if (w.style === 'hook') {
        if (hooks.length && hooks[hooks.length - 1].end >= w.start - 0.5) {
          hooks[hooks.length - 1].words.push(w.word);
          hooks[hooks.length - 1].end = w.end;
        } else {
          hooks.push({ words: [w.word], start: w.start, end: w.end });
        }
      }
    }
    const active = hooks.find((h) => currentTime >= h.start && currentTime <= h.end + 0.8);
    if (!active) return null;
    return active.words.join(' ').toUpperCase();
  }, [redHook, styledWords, currentTime]);

  if (!redHook || !hookPhrase) return null;

  // Calculate font size based on text length to ensure it fits on screen
  // Longer text = smaller base size, shorter text = larger base size
  const textLength = hookPhrase.length;
  const baseSizeVw = textLength > 8 ? 6 : textLength > 4 ? 8 : 10; // Adjust base size by text length
  const sizeMultiplier = Math.max(0.3, Math.min(1.5, hookSize)); // Clamp between 0.3 and 1.5
  const fontSizeVw = baseSizeVw * sizeMultiplier;
  const fontSizeClamp = `clamp(16px, ${fontSizeVw}vw, ${fontSizeVw * 1.2}vw)`;

  const justifyContent = hookHorizontal === 'left' ? 'flex-start' : hookHorizontal === 'right' ? 'flex-end' : 'center';

  return (
    <div
      className="absolute left-0 right-0 flex pointer-events-none"
      style={{
        position: 'absolute',
        top: `${hookYPercent}%`,
        left: 0,
        right: 0,
        transform: 'translateY(-50%)',
        paddingLeft: '5%',
        paddingRight: '5%',
        justifyContent,
      }}
    >
      <span
        className="font-black uppercase tracking-tight text-center leading-tight block px-4"
        style={{
          fontFamily: "'Impact', 'Arial Black', 'Helvetica', sans-serif",
          fontSize: fontSizeClamp,
          color: hookColor || '#ef4444',
          textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 24px rgba(0,0,0,0.6)',
          opacity: 0.88,
          maxWidth: '100%',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {hookPhrase}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CaptionOverlay — always-visible preview that responds to position/size/color
// ---------------------------------------------------------------------------
function CaptionOverlay({ styledWords, timedCaptions, currentTime, preset, position, positionYPercent, positionHorizontal, fontSize, color, marqueeSpeed = 1, videoSize, displaySize, styleColors }) {
  const styleCols = styleColors || STYLE_COLORS;
  const active = useMemo(() => {
    if (!timedCaptions?.length) return null;
    return timedCaptions.find(([s, e]) => currentTime >= s && currentTime <= e) ?? null;
  }, [timedCaptions, currentTime]);

  const sampleText = useMemo(() => {
    if (!timedCaptions?.length) return null;
    const first = timedCaptions[0];
    if (!first) return null;
    const raw = first[2];
    return Array.isArray(raw) ? raw.join(' ') : String(raw);
  }, [timedCaptions]);

  const displayText = active
    ? (Array.isArray(active[2]) ? active[2].join(' ') : String(active[2]))
    : sampleText;

  if (!displayText) return null;

  const start = active ? active[0] : 0;
  const end = active ? active[1] : 0;
  const words = displayText.split(/\s+/);

  const matchedWords = words.map((word) => {
    const sw = styledWords?.find(
      (w) => w.word.toLowerCase().replace(/[^a-z0-9]/g, '') === word.toLowerCase().replace(/[^a-z0-9]/g, '') &&
             (active ? (w.start >= start - 0.5 && w.end <= end + 0.5) : true)
    );
    return { word, style: sw?.style || 'regular' };
  });

  const isMarquee = preset === 'marquee';
  const isSplit = preset === 'split';
  const isDynamicOrViral = preset === 'dynamic_smart' || preset === 'viral';
  
  // Debug: log preset value to console to trace issues
  // eslint-disable-next-line no-console
  if (import.meta.env.DEV) console.log('[CaptionOverlay] preset:', preset, '| isSplit:', isSplit, '| isDynamicOrViral:', isDynamicOrViral);
  const sizeMap = { 20: 6, 24: 7, 28: 8, 34: 10, 70: 10, 100: 15, 130: 20, 160: 26 };
  // Marquee: scale font to match export (backend uses raw fontSize; preview = fontSize * display/video)
  let scaledSize;
  if (isMarquee && videoSize?.height && displaySize?.height && videoSize.height > 0) {
    const scale = displaySize.height / videoSize.height;
    scaledSize = Math.max(8, Math.round(fontSize * scale));
  } else {
    scaledSize = sizeMap[fontSize] || Math.max(8, Math.round(fontSize * 0.16));
  }

  // Split by char count (matches backend _auto_split)
  const splitWords = useMemo(() => {
    if (!isSplit || matchedWords.length <= 1) return { left: matchedWords, right: [] };
    const total = matchedWords.reduce((s, m) => s + m.word.length, 0);
    let best = 1, run = 0, bestDiff = Infinity;
    for (let i = 0; i < matchedWords.length; i++) {
      run += matchedWords[i].word.length;
      const d = Math.abs(run - total / 2);
      if (d < bestDiff) { bestDiff = d; best = i + 1; }
    }
    return { left: matchedWords.slice(0, best), right: matchedWords.slice(best) };
  }, [isSplit, matchedWords]);

  const currentWordIdx = useMemo(() => {
    if (!active || !styledWords?.length) return -1;
    let idx = -1;
    styledWords.forEach((w, i) => {
      if (active[0] <= w.start && w.start <= currentTime) idx = i;
    });
    return idx;
  }, [active, styledWords, currentTime]);

  let posTop, posBottom, posTransform, justifyContent;
  if (positionYPercent != null) {
    posTop = `${positionYPercent}%`; posBottom = 'auto'; posTransform = 'translateY(-50%)';
    justifyContent = positionHorizontal === 'left' ? 'flex-start' : positionHorizontal === 'right' ? 'flex-end' : 'center';
  } else if (position === 'top') {
    posTop = '6%'; posBottom = 'auto'; posTransform = 'none'; justifyContent = 'center';
  } else if (position === 'center') {
    posTop = '50%'; posBottom = 'auto'; posTransform = 'translateY(-50%)'; justifyContent = 'center';
  } else {
    posTop = 'auto'; posBottom = '6%'; posTransform = 'none'; justifyContent = 'center';
  }

  const baseStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    top: posTop,
    bottom: posBottom,
    transform: posTransform,
    pointerEvents: 'none',
    padding: '0 12px',
    zIndex: 20,
    transition: 'top 0.3s ease, bottom 0.3s ease, transform 0.3s ease',
    display: 'flex',
    justifyContent: justifyContent ?? 'center',
  };

  // Split preview: left chunk | [center/person] | right chunk on one horizontal line
  if (isSplit) {
    const wordColor = (mw, globalIdx) => {
      const isCurrent = currentWordIdx >= 0 && styledWords?.[currentWordIdx]?.word?.toLowerCase().replace(/[^a-z0-9]/g, '') === mw.word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (mw.style === 'hook') return STYLE_COLORS.hook;
      if (mw.style === 'emphasis') return STYLE_COLORS.emphasis;
      return isCurrent ? '#C9A84C' : (color || '#ffffff');
    };
    const splitPadding = positionHorizontal === 'left' ? { paddingLeft: 0, paddingRight: '18%' } : positionHorizontal === 'right' ? { paddingLeft: '18%', paddingRight: 0 } : {};
    return (
      <div style={{ ...baseStyle, ...splitPadding, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, textAlign: 'right', maxWidth: '35%', lineHeight: 1.2, opacity: active ? 1 : 0.5 }}>
          {splitWords.left.map((mw, i) => (
            <span key={i} style={{ fontWeight: 700, fontSize: `${scaledSize}px`, textShadow: '0 2px 6px rgba(0,0,0,0.8)', color: wordColor(mw, i) }}>
              {mw.word}{' '}
            </span>
          ))}
        </div>
        <div style={{ flex: '0 0 30%' }} />
        <div style={{ flex: 1, textAlign: 'left', maxWidth: '35%', lineHeight: 1.2, opacity: active ? 1 : 0.5 }}>
          {splitWords.right.map((mw, i) => (
            <span key={i} style={{ fontWeight: 700, fontSize: `${scaledSize}px`, textShadow: '0 2px 6px rgba(0,0,0,0.8)', color: wordColor(mw, splitWords.left.length + i) }}>
              {mw.word}{' '}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Dynamic Smart: 2 words per line, stacked vertically - uses smart position (left/center/right)
  // The position is determined by the smart caption placement analysis
  if (preset === 'dynamic_smart' && matchedWords.length > 0) {
    const wordColor = (mw) => mw.style === 'hook' ? styleCols.hook : mw.style === 'emphasis' ? styleCols.emphasis : (styleCols.regular || color || '#ffffff');
    const wordStyle = { fontWeight: 700, fontSize: `${scaledSize}px`, textShadow: '0 2px 8px rgba(0,0,0,0.8)', lineHeight: 1.3 };
    
    // Group words into pairs (2 per line)
    const lines = [];
    for (let i = 0; i < matchedWords.length; i += 2) {
      lines.push(matchedWords.slice(i, i + 2));
    }
    
    // Use positionHorizontal set by smart caption placement analysis
    const isLeft = positionHorizontal === 'left';
    const isRight = positionHorizontal === 'right';
    const textAlign = isLeft ? 'left' : isRight ? 'right' : 'center';
    
    return (
      <div style={{ 
        ...baseStyle, 
        justifyContent: isLeft ? 'flex-start' : isRight ? 'flex-end' : 'center',
        paddingLeft: isLeft ? '6%' : isRight ? '0' : '6%',
        paddingRight: isRight ? '6%' : isLeft ? '0' : '6%',
      }}>
        <div style={{ textAlign, maxWidth: '45%', opacity: active ? 1 : 0.5 }}>
          {lines.map((lineWords, lineIdx) => (
            <span key={lineIdx} style={{ ...wordStyle, color: wordColor(lineWords[0]), display: 'block' }}>
              {lineWords.map(mw => mw.word).join(' ')}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Viral: 2 words per line, stacked vertically on left/center/right (based on positionHorizontal)
  if (preset === 'viral' && matchedWords.length > 0) {
    const wordColor = (mw) => mw.style === 'hook' ? styleCols.hook : mw.style === 'emphasis' ? styleCols.emphasis : (styleCols.regular || color || '#ffffff');
    const wordStyle = { fontWeight: 700, fontSize: `${scaledSize}px`, textShadow: '0 2px 8px rgba(0,0,0,0.8)', lineHeight: 1.3 };
    
    // Group words into pairs (2 per line)
    const lines = [];
    for (let i = 0; i < matchedWords.length; i += 2) {
      lines.push(matchedWords.slice(i, i + 2));
    }
    
    // Determine horizontal position for Viral
    const isLeft = positionHorizontal === 'left';
    const isRight = positionHorizontal === 'right';
    const textAlign = isLeft ? 'left' : isRight ? 'right' : 'center';
    
    return (
      <div style={{ 
        ...baseStyle, 
        justifyContent: isLeft ? 'flex-start' : isRight ? 'flex-end' : 'center',
        paddingLeft: isLeft ? '6%' : isRight ? '0' : '6%',
        paddingRight: isRight ? '6%' : isLeft ? '0' : '6%',
      }}>
        <div style={{ textAlign, maxWidth: '45%', opacity: active ? 1 : 0.5 }}>
          {lines.map((lineWords, lineIdx) => (
            <span key={lineIdx} style={{ ...wordStyle, color: wordColor(lineWords[0]), display: 'block' }}>
              {lineWords.map(mw => mw.word).join(' ')}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...baseStyle }}>
      <div
        key={active ? `${start}-${displayText}` : 'sample'}
        className={isMarquee ? 'animate-marquee' : (active ? 'animate-fadeSlideUp' : '')}
        style={{
          textAlign: 'center',
          padding: '6px 12px',
          maxWidth: '90%',
          opacity: active ? 1 : 0.5,
          ...(isMarquee && { animation: `marquee ${6 / (marqueeSpeed || 1)}s linear infinite` }),
        }}
      >
        <p style={{ fontWeight: 700, lineHeight: 1.3, fontSize: `${scaledSize}px`, textShadow: '0 2px 8px rgba(0,0,0,0.7)', margin: 0 }}>
          {matchedWords.map((mw, i) => {
            const wordColor = mw.style === 'hook' ? styleCols.hook : mw.style === 'emphasis' ? styleCols.emphasis : (styleCols.regular || color || '#ffffff');
            return <span key={i} style={{ color: wordColor }}>{mw.word} </span>;
          })}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrollThumbnail - shows B-roll clip thumbnail from API
// ---------------------------------------------------------------------------
function BrollThumbnail({ clipId, className, alt }) {
  const base = getApiBaseURL();
  const [imgUrl, setImgUrl] = useState(null);
  const [hasError, setHasError] = useState(false);
  
  useEffect(() => {
    if (!clipId) {
      setHasError(true);
      return;
    }
    
    // Fetch the image as blob to avoid any auth/cors issues
    const url = `${base}/api/broll-thumbnail/${encodeURIComponent(clipId)}`;
    
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed');
        return res.blob();
      })
      .then(blob => {
        setImgUrl(URL.createObjectURL(blob));
      })
      .catch(() => setHasError(true));
      
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [clipId]);
  
  if (hasError) {
    return (
      <div className={`flex items-center justify-center bg-white/5 ${className}`}>
        <svg className="w-5 h-5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  
  if (!imgUrl) {
    return (
      <div className={`flex items-center justify-center bg-white/5 ${className}`}>
        <span className="w-4 h-4 border-2 border-white/20 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    );
  }
  
  return <img src={imgUrl} alt={alt} className={className} />;
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------
function Toggle({ label, value, onChange, description }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2.5 cursor-pointer group">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/90 font-medium">{label}</span>
        {description && <p className="text-[11px] text-white/40 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${value ? 'bg-[#C9A84C]' : 'bg-white/[0.08]'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${value ? 'translate-x-[22px]' : 'translate-x-0.5'} mt-0.5`} />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------
// EditClip page
// ---------------------------------------------------------------------------
export default function EditClip() {
  const { prepJobId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const videoId = searchParams.get('videoId') || '';
  const navigate = useNavigate();
  const isMobile = useMobile();
  
  // Credit lock from navigation state (passed from Upload.jsx)
  const lockId = location.state?.lock_id || sessionStorage.getItem('pending_credit_lock_id');
  const [retryCount, setRetryCount] = useState(0);
  const [lockExpiresAt, setLockExpiresAt] = useState(null);

  // Prep data
  const [styledWords, setStyledWords] = useState([]);
  const [timedCaptions, setTimedCaptions] = useState([]);
  const [transcript, setTranscript] = useState('');
  const [brollPlacements, setBrollPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Video
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [resolvedVideoIdState, setResolvedVideoIdState] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [videoAspect, setVideoAspect] = useState(9 / 16);
  const [videoSize, setVideoSize] = useState(null);   // { width, height } intrinsic video dims
  const [displaySize, setDisplaySize] = useState(null); // { width, height } rendered size
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [previewRotation, setPreviewRotation] = useState(0);  // 0, 90, 180, 270
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loop, setLoop] = useState(false);
  const videoRef = useRef(null);
  const videoContainerRef = useRef(null);

  // Options
  const [preset, setPreset] = useState('dynamic_smart');
  const [enableBroll, setEnableBroll] = useState(true);
  const [textBehind, setTextBehind] = useState(true);
  const [redHook, setRedHook] = useState(true);
  const [noiseIsolation, setNoiseIsolation] = useState(false);
  const [colorGrade, setColorGrade] = useState('');
  const [roundedCorners, setRoundedCorners] = useState('medium');
  const [aspectRatio, setAspectRatio] = useState('');
  const [instagramExport, setInstagramExport] = useState(true);
  const [captionPosition, setCaptionPosition] = useState('bottom');
  const [captionYPercent, setCaptionYPercent] = useState(50);  // 0-100, for viral/marquee
  const [captionHorizontal, setCaptionHorizontal] = useState('center');  // left/center/right for viral
  const [captionSize, setCaptionSize] = useState(64);
  const [captionColor, setCaptionColor] = useState('#FFFFFF');
  const [hookColor, setHookColor] = useState('#ef4444');
  const [hookYPercent, setHookYPercent] = useState(8);   // 0-100, vertical position
  const [hookHorizontal, setHookHorizontal] = useState('center');  // left/center/right
  const [hookMaskQuality, setHookMaskQuality] = useState('medium');  // off|light|medium|strong|maximum
  const [hookSize, setHookSize] = useState(0.8);  // 0.3=Small (fits screen), 1.5=Large
  const [emphasisColor, setEmphasisColor] = useState(GOLD);
  const [regularColor, setRegularColor] = useState('#e2e8f0');
  const [useEmphasisFont, setUseEmphasisFont] = useState(true);  // When true: emphasis words use cursive font. When false: like regular.
  const [wordsPerBlock, setWordsPerBlock] = useState(6);
  const [marqueeSpeed, setMarqueeSpeed] = useState(1);
  const [colorGradePreviews, setColorGradePreviews] = useState(null);  // { before, vintage, cinematic, ... } base64 data URLs
  const [rotation, setRotation] = useState(0);  // 0, 90, 180, 270 — affects render + download
  const [rotationPopupSeen, setRotationPopupSeen] = useState(false);  // Show info popup once when rotation selected
  const [enableWatermark, setEnableWatermark] = useState(true);  // Watermark ON by default for preview protection
  const [watermarkText, setWatermarkText] = useState('OBULA');  // Watermark text
  const [watermarkPosition, setWatermarkPosition] = useState('bottom-right');  // Watermark position
  const [leftPanelWidth, setLeftPanelWidth] = useState(500);  // px, ~35% of typical viewport — draggable
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 1024);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const fn = () => setIsDesktop(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Load lock status on mount
  useEffect(() => {
    if (lockId) {
      getLockStatus(lockId)
        .then((status) => {
          setRetryCount(status.retry_count || 0);
          setLockExpiresAt(status.expires_at);
        })
        .catch(console.error);
    }
  }, [lockId]);
  
  // Restore settings from "Edit Again" feature
  useEffect(() => {
    const shouldRestore = searchParams.get('restore') === 'true';
    if (!shouldRestore) return;
    
    const savedSettings = localStorage.getItem('edit_again_settings');
    if (!savedSettings) return;
    
    try {
      const settings = JSON.parse(savedSettings);
      console.log('[EditClip] Restoring settings:', settings);
      
      // Restore all settings
      if (settings.preset) setPreset(settings.preset);
      if (settings.enable_broll != null) setEnableBroll(settings.enable_broll);
      if (settings.behind_person != null) setTextBehind(settings.behind_person);
      if (settings.enable_red_hook != null) setRedHook(settings.enable_red_hook);
      if (settings.enable_noise_isolation != null) setNoiseIsolation(settings.enable_noise_isolation);
      if (settings.color_grade_lut != null) setColorGrade(settings.color_grade_lut);
      if (settings.rounded_corners) setRoundedCorners(settings.rounded_corners);
      if (settings.aspect_ratio) setAspectRatio(settings.aspect_ratio);
      if (settings.export_instagram != null) setInstagramExport(settings.export_instagram);
      if (settings.caption_position) setCaptionPosition(settings.caption_position);
      if (settings.y_position != null) {
        const yPercent = Math.round((settings.y_position - 0.05) / 0.9 * 100);
        setCaptionYPercent(Math.max(0, Math.min(100, yPercent)));
      }
      if (settings.position) setCaptionHorizontal(settings.position);
      if (settings.font_size) setCaptionSize(settings.font_size);
      if (settings.caption_color) setCaptionColor(settings.caption_color);
      if (settings.hook_color) setHookColor(settings.hook_color);
      if (settings.hook_y_position != null) {
        const hookYPercent = Math.round((settings.hook_y_position - 0.05) / 0.9 * 100);
        setHookYPercent(Math.max(0, Math.min(100, hookYPercent)));
      }
      if (settings.hook_position) setHookHorizontal(settings.hook_position);
      if (settings.hook_mask_quality) setHookMaskQuality(settings.hook_mask_quality);
      if (settings.hook_size != null) setHookSize(settings.hook_size);
      if (settings.emphasis_color) setEmphasisColor(settings.emphasis_color);
      if (settings.regular_color) setRegularColor(settings.regular_color);
      if (settings.use_emphasis_font != null) setUseEmphasisFont(settings.use_emphasis_font);
      if (settings.words_per_line) setWordsPerBlock(settings.words_per_line);
      if (settings.scroll_speed != null) setMarqueeSpeed(settings.scroll_speed);
      if (settings.rotation != null) setRotation(settings.rotation);
      
      // Clear the saved settings after restoring
      localStorage.removeItem('edit_again_settings');
      localStorage.removeItem('edit_again_prep_id');
      localStorage.removeItem('edit_again_video_id');
      
      // Increment retry count and show toast
      if (lockId) {
        incrementRetry(lockId)
          .then((result) => {
            setRetryCount(result.retry_count);
            const remaining = 5 - result.retry_count;
            if (remaining > 0) {
              toast.info(
                <div>
                  <p className="font-medium">{remaining} edit {remaining === 1 ? 'retry' : 'retries'} remaining</p>
                  <p className="text-xs text-white/70">You've used {result.retry_count} of 5 retries</p>
                </div>,
                { autoClose: 4000 }
              );
            } else {
              toast.warning(
                <div>
                  <p className="font-medium">Final edit</p>
                  <p className="text-xs text-white/70">This is your last retry. Next download will deduct credits.</p>
                </div>,
                { autoClose: 5000 }
              );
            }
          })
          .catch(console.error);
      }
      
      // Remove restore param from URL without reloading
      navigate(`/edit/${prepJobId}?videoId=${videoId}`, { replace: true });
    } catch (err) {
      console.error('[EditClip] Failed to restore settings:', err);
    }
  }, [searchParams, prepJobId, videoId, navigate]);

  const captionSizes = preset === 'split' ? CAPTION_SIZES_SPLIT : CAPTION_SIZES;

  // Resize handler for draggable splitter
  const handleSplitterPointerDown = useCallback((e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);
  const handleSplitterPointerMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const x = e.clientX;
    if (x != null && x > 0) {
      const w = Math.max(320, Math.min(680, x));
      setLeftPanelWidth(w);
    }
  }, []);
  const handleSplitterPointerUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    isDraggingRef.current = false;
    setIsDragging(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Sync preview with rotation setting
  useEffect(() => {
    setPreviewRotation(rotation);
  }, [rotation]);

  const ROTATION_OPTIONS = [
    { value: 0, label: 'None' },
    { value: 90, label: '90° CW' },
    { value: 180, label: '180°' },
    { value: 270, label: '90° CCW' },
  ];

  // When switching to split, default to S (36) if current size is from regular preset
  useEffect(() => {
    if (preset === 'split' && CAPTION_SIZES.some((s) => s.value === captionSize)) {
      setCaptionSize(36);
    }
  }, [preset]);

  // Track video container display size for preview font scaling (matches export proportions)
  useEffect(() => {
    const el = videoContainerRef.current;
    if (!el) return;
    const update = () => {
      if (el.offsetWidth && el.offsetHeight) {
        setDisplaySize({ width: el.offsetWidth, height: el.offsetHeight });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [videoUrl, videoAspect]);

  // Generate
  const [generating, setGenerating] = useState(false);
  const [loadingBroll, setLoadingBroll] = useState(false);
  const [regeneratingPlacementIndex, setRegeneratingPlacementIndex] = useState(null);
  
  // B-roll preview state
  const [previewClip, setPreviewClip] = useState(null); // { url, description }

  // Tab state
  const [activeTab, setActiveTab] = useState('transcript');

  // Redirect mobile users to mobile export page
  const handleTabChange = useCallback((tabId) => {
    if (tabId === 'export' && isMobile) {
      navigate(`/export/${prepJobId}?videoId=${videoId}`);
    } else {
      setActiveTab(tabId);
    }
  }, [isMobile, navigate, prepJobId, videoId]);

  const resolvedVideoId = useRef(videoId);

  // Fetch prep data
  useEffect(() => {
    if (!prepJobId) {
      setError('Missing edit session. Go to Upload and prepare a video first.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getPrepData(prepJobId)
      .then((data) => {
        setStyledWords(data.styled_words || []);
        setTimedCaptions(data.timed_captions || []);
        setTranscript(data.transcript_text || '');
        setBrollPlacements(data.broll_placements || []);
        if (data.video_id && !resolvedVideoId.current) {
          resolvedVideoId.current = data.video_id;
          setResolvedVideoIdState(data.video_id);
        }
        setLoading(false);
        // Fetch color grade previews from user's video (for Effects tab hover)
        getColorGradePreviews(prepJobId)
          .then(setColorGradePreviews)
          .catch(() => {});
        // Auto-generate B-roll suggestions in background if none exist
        if (!(data.broll_placements?.length)) {
          setLoadingBroll(true);
          generateBrollSuggestions(prepJobId)
            .then((res) => setBrollPlacements(res.broll_placements || []))
            .catch(() => {})
            .finally(() => setLoadingBroll(false));
        }
      })
      .catch((err) => {
        const d = err?.response?.data?.detail;
        const msg = typeof d === 'string' ? d : Array.isArray(d) && d[0] ? d[0] : err?.message || 'Failed to load prep data';
        setError(msg);
        setLoading(false);
      });
  }, [prepJobId]);

  // Build direct video URL with token so the browser handles range requests natively
  useEffect(() => {
    const vid = videoId || resolvedVideoIdState;
    if (!vid) return;
    const authH = getAuthHeader();
    const token = authH.Authorization ? authH.Authorization.replace('Bearer ', '') : '';
    const base = getApiBaseURL();
    setVideoUrl(`${base}/api/upload/${vid}/video?token=${encodeURIComponent(token)}`);
  }, [videoId, resolvedVideoIdState]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch((err) => {
        console.warn('Play failed:', err);
        setIsPlaying(false);
      });
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) {
        videoRef.current.muted = next;
        if (!next) videoRef.current.volume = volume;
      }
      return next;
    });
  }, [volume]);

  const setVolumeAndSync = useCallback((v) => {
    const val = Math.max(0, Math.min(1, v));
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setMuted(val === 0);
    }
  }, []);

  const cycleRotation = useCallback(() => {
    const next = (rotation + 90) % 360;
    setRotation(next);
    if (next !== 0) setRotationPopupSeen(true);
  }, [rotation]);

// Cross-browser fullscreen helper
  const requestFullscreen = useCallback((el) => {
    const method = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    return method?.call(el);
  }, []);

  const exitFullscreen = useCallback(() => {
    const method = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    return method?.call(document);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = videoContainerRef.current;
    if (!el) return;
    
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement || 
      document.webkitFullscreenElement || 
      document.mozFullScreenElement || 
      document.msFullscreenElement
    );
    
    if (!isCurrentlyFullscreen) {
      requestFullscreen(el)?.then(() => setIsFullscreen(true)).catch((err) => {
        console.warn('Fullscreen request failed:', err);
        // Fallback: try fullscreen on the video element itself (for iOS)
        const video = videoRef.current;
        if (video && video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
      });
    } else {
      exitFullscreen()?.then(() => setIsFullscreen(false)).catch((err) => {
        console.warn('Exit fullscreen failed:', err);
      });
    }
  }, [requestFullscreen, exitFullscreen]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.volume = muted ? 0 : volume;
    v.playbackRate = playbackRate;
    v.loop = loop;
  }, [muted, volume, playbackRate, loop]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
      setIsFullscreen(isFs);
    };
    
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('mozfullscreenchange', onFullscreenChange);
      document.removeEventListener('MSFullscreenChange', onFullscreenChange);
    };
  }, []);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen()?.catch(() => {});
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, exitFullscreen]);


  const formatTime = (t) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Generate clip (Phase 2). Pass force1080=true to override instagramExport for 1080p output.
  const handleGenerate = async (force1080 = false) => {
    if (generating) return;
    if (!styledWords?.length || !timedCaptions?.length) {
      setError('Captions are still loading. Please wait a moment and try again.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      // Flush pending save so prep file has latest (fallback if request payload fails)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        updatePrepData(prepJobId, {
          styled_words: styledWords,
          timed_captions: timedCaptions,
          transcript_text: styledWords.map((w) => w.word).join(' '),
        }).catch(() => {});
      }
      const yPos = (preset === 'dynamic_smart' || preset === 'viral' || preset === 'marquee' || preset === 'split')
        ? captionYPercent / 100 * 0.9 + 0.05  // 0-100 → 0.05-0.95
        : (CAPTION_POSITIONS.find((p) => p.value === captionPosition)?.yPosition ?? 0.85);
      const payload = {
        video_id: videoId || resolvedVideoIdState,
        from_prep_id: prepJobId,
        lock_id: lockId,
        preset,
        enable_broll: enableBroll,
        behind_person: textBehind,
        enable_red_hook: redHook,
        enable_noise_isolation: noiseIsolation,
        color_grade_lut: colorGrade || undefined,
        rounded_corners: roundedCorners,
        aspect_ratio: aspectRatio || undefined,
        export_instagram: force1080 ? true : instagramExport,
        caption_position: (preset === 'dynamic_smart' || preset === 'viral' || preset === 'marquee' || preset === 'split') ? undefined : captionPosition,
        ...((preset === 'viral' || preset === 'split') && { position: captionHorizontal }),
        font_size: captionSize,
        caption_color: captionColor,
        hook_color: hookColor,
        hook_y_position: hookYPercent / 100 * 0.9 + 0.05,  // 0-100 → 0.05-0.95
        hook_position: hookHorizontal,  // left/center/right
        hook_mask_quality: hookMaskQuality,
        hook_size: hookSize,
        emphasis_color: emphasisColor,
        regular_color: regularColor,
        use_emphasis_font: useEmphasisFont,
        y_position: yPos,
        // Send user's edited transcript data to backend
        styled_words: styledWords,
        timed_captions: timedCaptions,
        transcript_text: styledWords.map(w => w.word).join(' '),
        ...(preset === 'split' && { words_per_line: wordsPerBlock }),
        ...(preset === 'marquee' && { scroll_speed: marqueeSpeed }),
        ...(rotation !== 0 && { rotation }),
        // Note: Watermark is preview-only, not applied to final export
      };
      const { job_id } = await startJob(payload);
      navigate(`/upload/processing/${job_id}`);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 402) {
        navigate('/pricing', { state: { noCredits: true } });
        return;
      }
      setError(err?.response?.data?.detail || 'Failed to start rendering.');
    } finally {
      setGenerating(false);
    }
  };

  // ---- Transcript editing callbacks ----
  const saveTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  const rebuildTimedCaptions = useCallback((words) => {
    if (!words?.length) return [];
    const captions = [];
    let group = [];
    let groupStart = words[0].start;
    let groupEnd = words[0].end;

    for (const w of words) {
      if (group.length && (w.start - groupEnd > 0.6 || group.length >= 6)) {
        captions.push([groupStart, groupEnd, group.map((g) => g.word)]);
        group = [];
        groupStart = w.start;
      }
      group.push(w);
      groupEnd = w.end;
    }
    if (group.length) captions.push([groupStart, groupEnd, group.map((g) => g.word)]);
    return captions;
  }, []);

  const scheduleSave = useCallback((payload) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updatePrepData(prepJobId, payload);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch {
        setSaveStatus('error');
      }
    }, 1200);
  }, [prepJobId]);

  const handleWordEdit = useCallback((index, newWord) => {
    setStyledWords((prev) => {
      const updated = prev.map((w, i) => (i === index ? { ...w, word: newWord } : w));
      const newCaptions = rebuildTimedCaptions(updated);
      setTimedCaptions(newCaptions);
      scheduleSave({ styled_words: updated, timed_captions: newCaptions, transcript_text: updated.map((w) => w.word).join(' ') });
      return updated;
    });
  }, [rebuildTimedCaptions, scheduleSave]);

  const handleStyleChange = useCallback((index, newStyle) => {
    setStyledWords((prev) => {
      const updated = prev.map((w, i) => (i === index ? { ...w, style: newStyle } : w));
      scheduleSave({ styled_words: updated, timed_captions: timedCaptions, transcript_text: updated.map((w) => w.word).join(' ') });
      return updated;
    });
  }, [timedCaptions, scheduleSave]);

  const handleWordDelete = useCallback((index) => {
    setStyledWords((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      const newCaptions = rebuildTimedCaptions(updated);
      setTimedCaptions(newCaptions);
      scheduleSave({ styled_words: updated, timed_captions: newCaptions, transcript_text: updated.map((w) => w.word).join(' ') });
      return updated;
    });
  }, [rebuildTimedCaptions, scheduleSave]);

  // B-Roll placement handlers
  const handleBrollSelectClip = useCallback((placementIdx, candidateIdx) => {
    setBrollPlacements((prev) => {
      const updated = prev.map((p, i) => (i === placementIdx ? { ...p, selected_index: candidateIdx } : p));
      scheduleSave({ broll_placements: updated });
      return updated;
    });
  }, [scheduleSave]);

  const handleBrollToggle = useCallback((placementIdx) => {
    setBrollPlacements((prev) => {
      const updated = prev.map((p, i) => (i === placementIdx ? { ...p, enabled: !p.enabled } : p));
      scheduleSave({ broll_placements: updated });
      return updated;
    });
  }, [scheduleSave]);

  const handleGenerateBroll = useCallback(async () => {
    if (loadingBroll) return;
    setLoadingBroll(true);
    try {
      const res = await generateBrollSuggestions(prepJobId);
      setBrollPlacements(res.broll_placements || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to generate B-Roll suggestions');
    } finally {
      setLoadingBroll(false);
    }
  }, [prepJobId, loadingBroll]);

  const handleRegeneratePlacement = useCallback(async (pIdx) => {
    if (regeneratingPlacementIndex !== null) return;
    setRegeneratingPlacementIndex(pIdx);
    try {
      const res = await regeneratePlacementClips(prepJobId, pIdx);
      setBrollPlacements(res.broll_placements || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to regenerate clips');
    } finally {
      setRegeneratingPlacementIndex(null);
    }
  }, [prepJobId, regeneratingPlacementIndex]);

  // Stats from styled_words
  const hookCount = useMemo(() => styledWords.filter((w) => w.style === 'hook').length, [styledWords]);
  const emphasisCount = useMemo(() => styledWords.filter((w) => w.style === 'emphasis').length, [styledWords]);
  const regularCount = useMemo(() => styledWords.length - hookCount - emphasisCount, [styledWords, hookCount, emphasisCount]);

  const ACTION_PILLS = useMemo(() => [
    { label: 'Cinematic Captions', icon: '\u{1F3AC}', tab: 'captions', stateKey: null },
    { label: 'Add B-Roll', icon: '\u{1F3A5}', tab: 'broll', toggle: () => setEnableBroll((v) => !v), stateKey: enableBroll },
    { label: 'Text Behind', icon: '\u{1F9CA}', toggle: () => setTextBehind((v) => !v), stateKey: textBehind },
    { label: 'Color Grade', icon: '\u{1F3A8}', tab: 'effects', stateKey: null },
    { label: 'Noise Reduction', icon: '\u{1F50A}', toggle: () => setNoiseIsolation((v) => !v), stateKey: noiseIsolation },
    
  ], [enableBroll, textBehind, noiseIsolation, enableWatermark]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <LandingNav />
        <div className="flex items-center justify-center h-[80vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
            <p className="text-white/80 text-sm">Loading editing data…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !styledWords.length) {
    const is404 = error.toLowerCase().includes('not found') || error.toLowerCase().includes('404');
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
        <LandingNav />
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-red-400 text-lg font-medium">{error}</p>
            {is404 && (
              <p className="text-white/60 text-sm">
                This edit link may be from a finished clip. Use Upload → Prepare only first, then edit your clip.
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/upload')}
            className="px-6 py-3 bg-[#C9A84C] text-black font-semibold rounded-xl hover:bg-[#C9A84C]/90 transition-colors"
          >
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <LandingNav />

      {/* Rotation info modal — shown when user first selects a non-zero rotation */}
      {rotation !== 0 && rotationPopupSeen && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setRotationPopupSeen(false)}
        >
          <div
            className="max-w-md rounded-2xl border border-[#C9A84C]/40 bg-[#1a1a1a] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#C9A84C] mb-2">Video will be rotated</h3>
            <p className="text-sm text-white/80 leading-relaxed mb-4">
              The video you download will be rotated {rotation}°. Captions, B-roll, hook text, and all effects will also be rendered in rotated mode. New person masks will be created for the rotated frames to ensure clean compositing.
            </p>
            <button
              type="button"
              onClick={() => setRotationPopupSeen(false)}
              className="w-full py-2.5 rounded-xl bg-[#C9A84C] text-black font-semibold text-sm hover:bg-[#C9A84C]/90 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeSlideUp { animation: fadeSlideUp 0.35s ease-out both; }
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 6s linear infinite; }
        @keyframes tabFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-tabFade { animation: tabFade 0.2s ease-out both; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .slim-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
        .slim-scroll::-webkit-scrollbar { width: 4px; }
        .slim-scroll::-webkit-scrollbar-track { background: transparent; }
        .slim-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .slim-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        /* Slider — gold track fill, circular thumb */
        .slider-gold {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 8px;
          border-radius: 4px;
          background: linear-gradient(to right, #C9A84C 0%, #C9A84C calc(var(--value, 50) * 1%), rgba(255,255,255,0.12) calc(var(--value, 50) * 1%));
          cursor: pointer;
        }
        .slider-gold::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px; height: 18px;
          border-radius: 50%;
          background: #C9A84C;
          border: 2px solid rgba(255,255,255,0.9);
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          cursor: grab;
          margin-top: -5px;
        }
        .slider-gold::-webkit-slider-thumb:hover { background: #d4b85c; }
        .slider-gold::-webkit-slider-thumb:active { cursor: grabbing; }
        .slider-gold::-moz-range-thumb {
          width: 18px; height: 18px;
          border-radius: 50%;
          background: #C9A84C;
          border: 2px solid rgba(255,255,255,0.9);
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          cursor: grab;
        }
        .slider-gold::-moz-range-thumb:hover { background: #d4b85c; }
        .slider-gold::-moz-range-track { background: transparent; }
      `}</style>

      <div className="flex-1 flex flex-col lg:flex-row pt-14 sm:pt-16" style={{ paddingTop: 'max(3.5rem, env(safe-area-inset-top, 3.5rem))' }}>
        {/* ============ LEFT PANEL ============ */}
        <div
          className="order-2 lg:order-1 shrink-0 border-t lg:border-t-0 lg:border-r border-white/[0.06] flex flex-col h-auto lg:h-[calc(100vh-4rem)] min-h-0 bg-[#0a0a0a]"
          style={{ width: isDesktop ? leftPanelWidth : undefined }}
        >

          {/* Clean header bar */}
          <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-3">
              {/* Credit Lock Status - Made more visible */}
              {lockId && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-sm font-medium">100 credits locked</span>
                  </div>
                  {retryCount > 0 && (
                    <div className={`px-2.5 py-1.5 rounded-lg border text-sm font-medium ${
                      retryCount >= 5 
                        ? 'bg-red-500/15 border-red-500/30 text-red-400' 
                        : retryCount >= 3 
                          ? 'bg-orange-500/15 border-orange-500/30 text-orange-400'
                          : 'bg-white/5 border-white/10 text-white/60'
                    }`}>
                      {retryCount}/5 retries
                    </div>
                  )}
                </div>
              )}
              
              {!lockId && <div />} {/* Spacer when no lock */}
              
              {saveStatus && (
                <span className={`text-[11px] font-medium ${
                  saveStatus === 'saving' ? 'text-white/40' :
                  saveStatus === 'saved' ? 'text-[#C9A84C]/90' :
                  'text-red-400/80'
                }`}>
                  {saveStatus === 'saving' && <><span className="inline-block w-2 h-2 border border-white/40 border-t-transparent rounded-full animate-spin mr-1 align-middle" /> Saving…</>}
                  {saveStatus === 'saved' && <>All changes saved</>}
                  {saveStatus === 'error' && <>Save failed</>}
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold text-white tracking-tight" style={{ fontFamily: 'Syne, DM Sans, system-ui' }}>Craft Your Clip</h1>
            <p className="text-white/45 text-xs mt-1">Refine words · Pick a style · Export</p>
          </div>

          {/* Tab bar - text-only, pill segments; horizontal scroll on mobile */}
          <div className="flex overflow-x-auto overflow-y-hidden gap-0.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] shrink-0 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex-1 min-w-[72px] sm:min-w-0 py-2.5 sm:py-2 text-[11px] font-medium transition-all whitespace-nowrap touch-manipulation min-h-[44px] rounded-lg flex-shrink-0 sm:flex-shrink ${
                  activeTab === tab.id
                    ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
                    : 'text-white/50 hover:text-white/75 hover:bg-white/[0.04]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content (scrollable) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 slim-scroll">
            <div key={activeTab} className="animate-tabFade space-y-5">

              {/* ---- TRANSCRIPT TAB ---- */}
              {activeTab === 'transcript' && (
                <>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-white/45 uppercase tracking-widest font-medium">Editable Transcript</span>
                      {saveStatus && (
                        <span className={`text-[11px] flex items-center gap-1.5 ${
                          saveStatus === 'saving' ? 'text-white/40' :
                          saveStatus === 'saved' ? 'text-[#C9A84C]/90' :
                          'text-red-400/80'
                        }`}>
                          {saveStatus === 'saving' && <><span className="w-2 h-2 border border-white/30 border-t-transparent rounded-full animate-spin" /> Saving…</>}
                          {saveStatus === 'saved' && <>Saved</>}
                          {saveStatus === 'error' && <>Save failed</>}
                        </span>
                      )}
                    </div>
                    {/* Tip - moved above transcript */}
                    <p className="text-xs text-white/50 mb-3 leading-relaxed px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      <span className="font-medium text-[#C9A84C]">Tip:</span> <span className="sm:hidden">Tap a word for style menu or edit.</span><span className="hidden sm:inline">Click a word to edit · Right-click to cycle style (regular → hook → emphasis).</span> Clear to delete · Changes auto-save
                    </p>
                    
                    <TranscriptViewer
                      styledWords={styledWords}
                      currentTime={currentTime}
                      onWordEdit={handleWordEdit}
                      onStyleChange={handleStyleChange}
                      onWordDelete={handleWordDelete}
                      styleColors={{ hook: hookColor, emphasis: emphasisColor, regular: regularColor }}
                    />
                    <div className="mt-4 pt-4 border-t border-white/[0.06]">
                      <span className="text-[11px] text-white/45 uppercase tracking-widest font-medium block mb-3">Style colors</span>
                      <div className="grid grid-cols-3 gap-2">
                        {/* Hook Color */}
                        <button 
                          onClick={() => document.getElementById('hook-color-input').click()}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] active:bg-white/[0.06] transition-colors cursor-pointer touch-manipulation"
                        >
                          <input 
                            id="hook-color-input"
                            type="color" 
                            value={hookColor} 
                            onChange={(e) => setHookColor(e.target.value.toUpperCase())} 
                            className="sr-only" 
                          />
                          <div 
                            className="w-12 h-12 rounded-xl border-2 border-white/30 shadow-inner flex items-center justify-center"
                            style={{ backgroundColor: hookColor }}
                          >
                            <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                          </div>
                          <span className="text-xs font-medium text-white/70">Hook</span>
                          <span className="text-[10px] text-white/40">{hookCount} words</span>
                        </button>
                        
                        {/* Emphasis Color */}
                        <button 
                          onClick={() => document.getElementById('emphasis-color-input').click()}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] active:bg-white/[0.06] transition-colors cursor-pointer touch-manipulation"
                        >
                          <input 
                            id="emphasis-color-input"
                            type="color" 
                            value={emphasisColor} 
                            onChange={(e) => setEmphasisColor(e.target.value.toUpperCase())} 
                            className="sr-only" 
                          />
                          <div 
                            className="w-12 h-12 rounded-xl border-2 border-white/30 shadow-inner flex items-center justify-center"
                            style={{ backgroundColor: emphasisColor }}
                          >
                            <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                          </div>
                          <span className="text-xs font-medium text-white/70">Emphasis</span>
                          <span className="text-[10px] text-white/40">{emphasisCount} words</span>
                        </button>
                        
                        {/* Regular Color */}
                        <button 
                          onClick={() => document.getElementById('regular-color-input').click()}
                          className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] active:bg-white/[0.06] transition-colors cursor-pointer touch-manipulation"
                        >
                          <input 
                            id="regular-color-input"
                            type="color" 
                            value={regularColor} 
                            onChange={(e) => setRegularColor(e.target.value.toUpperCase())} 
                            className="sr-only" 
                          />
                          <div 
                            className="w-12 h-12 rounded-xl border-2 border-white/30 shadow-inner flex items-center justify-center"
                            style={{ backgroundColor: regularColor }}
                          >
                            <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                          </div>
                          <span className="text-xs font-medium text-white/70">Regular</span>
                          <span className="text-[10px] text-white/40">{regularCount} words</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-white/35 mt-2">Tap a swatch to change its color</p>
                    </div>

                  </div>
                </>
              )}

              {/* ---- CAPTIONS TAB ---- */}
              {activeTab === 'captions' && (
                <div className="space-y-3">
                  {/* Style — always prominent */}
                  <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-3">Style</h2>
                    <div className="grid grid-cols-2 gap-2 sm:gap-2">
                      {CAPTION_PRESETS.map((p) => {
                        // Dynamic Smart and Viral show 2-line vertical preview
                        // Cinematic Captions (split) and Marquee show single line
                        const isTwoVertical = p.id === 'dynamic_smart' || p.id === 'viral';
                        return (
                          <button
                            key={p.id}
                            onClick={() => setPreset(p.id)}
                            className={`group flex flex-col items-center justify-center p-4 sm:p-3 rounded-xl border transition-all text-center min-h-[76px] sm:min-h-[68px] touch-manipulation active:scale-[0.98] ${
                              preset === p.id
                                ? 'border-[#C9A84C]/60 bg-[#C9A84C]/10 text-white ring-1 ring-[#C9A84C]/25'
                                : 'border-white/[0.06] bg-white/[0.02] text-white/60 hover:border-white/15 hover:text-white/80'
                            }`}
                          >
                            {isTwoVertical ? (
                              <>
                                <div className="flex flex-col gap-0.5 mb-1" style={{ fontFamily: 'inherit' }}>
                                  <span className="text-[10px] font-bold text-white/70 leading-tight">What if</span>
                                  <span className="text-[10px] font-bold text-white/70 leading-tight">art came</span>
                                </div>
                                <span className="text-[10px] font-medium block">{p.label}</span>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] font-bold text-white/70 mb-1 block" style={{ fontFamily: 'inherit' }}>Hello</span>
                                <span className="text-[10px] font-medium block">{p.label}</span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-white/40 mt-2.5 leading-relaxed">{CAPTION_PRESETS.find((x) => x.id === preset)?.description}</p>
                  </section>

                  {/* Layout & appearance — collapsible */}
                  <details className="rounded-xl border border-white/[0.08] bg-white/[0.02] group/details">
                    <summary className="flex items-center justify-between cursor-pointer list-none p-4 pb-2 select-none min-h-[44px] touch-manipulation">
                      <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest">Layout</h2>
                      <svg className="w-4 h-4 text-white/40 transition-transform group-open/details:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="px-4 pb-4 pt-1 space-y-4">
                    {(preset === 'dynamic_smart' || preset === 'viral' || preset === 'marquee' || preset === 'split') ? (
                      <>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">Vertical position ({captionYPercent}%)</label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={captionYPercent}
                            onChange={(e) => setCaptionYPercent(Number(e.target.value))}
                            style={{ '--value': captionYPercent }}
                            className="slider-gold"
                          />
                          <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                            <span>Top</span>
                            <span>Bottom</span>
                          </div>
                        </div>
                        {(preset === 'viral' || preset === 'split') && (
                          <div>
                            <label className="text-xs text-white/50 mb-1.5 block">Horizontal position</label>
                            <div className="flex gap-1.5">
                              {HORIZONTAL_POSITIONS.map((p) => (
                                <button
                                  key={p.value}
                                  onClick={() => setCaptionHorizontal(p.value)}
                                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                    captionHorizontal === p.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {preset === 'dynamic_smart' && (
                          <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
                            <p className="text-xs text-white/70 leading-relaxed">
                              <span className="font-medium text-[#C9A84C]">Smart caption placement</span> analyzes each frame and places captions in the emptiest area—left, center, or right—so text stays readable and avoids overlapping you.
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Position</label>
                        <div className="flex gap-1.5">
                          {CAPTION_POSITIONS.map((p) => (
                            <button
                              key={p.value}
                              onClick={() => setCaptionPosition(p.value)}
                              className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                captionPosition === p.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {preset === 'split' && (
                      <>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">Words per block</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {[4, 5, 6, 7, 8].map((n) => (
                              <button
                                key={n}
                                onClick={() => setWordsPerBlock(n)}
                                className={`px-3 py-1.5 rounded-lg text-xs border transition-all font-semibold ${
                                  wordsPerBlock === n ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    {preset === 'marquee' && (
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Speed</label>
                        <div className="flex gap-1.5">
                          {MARQUEE_SPEEDS.map((s) => (
                            <button
                              key={s.value}
                              onClick={() => setMarqueeSpeed(s.value)}
                              className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                marqueeSpeed === s.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Size</label>
                        <div className="flex gap-1.5 flex-wrap items-center">
                          {captionSizes.map((s) => (
                            <button
                              key={s.value}
                              onClick={() => setCaptionSize(s.value)}
                              title={s.tooltip}
                              className={`group relative flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs border transition-all font-semibold ${
                                captionSize === s.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                              }`}
                            >
                              {s.label}
                              {/* Tooltip */}
                              <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1a1a1a] border border-white/20 rounded text-[10px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                {s.tooltip}
                              </span>
                            </button>
                          ))}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setCaptionSize(Math.max(12, captionSize - 4))}
                              className="w-7 h-8 rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 flex items-center justify-center text-sm transition-colors"
                              title="Decrease size"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={12}
                              value={captionSizes.some((s) => s.value === captionSize) ? '' : captionSize}
                              placeholder="Custom"
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!Number.isNaN(v) && v >= 12) setCaptionSize(v);
                              }}
                              onBlur={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (!e.target.value) return;
                                if (Number.isNaN(v) || v < 12) setCaptionSize(12);
                                else setCaptionSize(v);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  setCaptionSize(captionSize + 4);
                                } else if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setCaptionSize(Math.max(12, captionSize - 4));
                                }
                              }}
                              className="w-16 px-2 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 text-white placeholder-white/30 focus:border-[#C9A84C]/50 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/30 text-center"
                            />
                            <button
                              onClick={() => setCaptionSize(captionSize + 4)}
                              className="w-7 h-8 rounded-lg border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 flex items-center justify-center text-sm transition-colors"
                              title="Increase size"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Color</label>
                        <div className="flex items-center gap-2 flex-wrap">
                        {CAPTION_COLORS.map((c) => (
                          <button
                            key={c.value}
                            onClick={() => setCaptionColor(c.value)}
                            title={c.label}
                            className={`w-9 h-9 sm:w-7 sm:h-7 rounded-full border-2 transition-all shrink-0 touch-manipulation ${
                              captionColor === c.value
                                ? 'border-[#C9A84C] scale-110 ring-2 ring-[#C9A84C]/30'
                                : 'border-white/15 hover:border-white/30'
                            }`}
                            style={{ background: c.value }}
                          />
                        ))}
                        {/* Native color picker - Palette Icon */}
                        <label
                          title="Custom color"
                          className={`w-9 h-9 sm:w-7 sm:h-7 rounded-full border-2 shrink-0 cursor-pointer overflow-hidden transition-all relative touch-manipulation flex items-center justify-center bg-white/5 hover:bg-white/10 ${
                            !CAPTION_COLORS.some((c) => c.value === captionColor)
                              ? 'border-[#C9A84C] scale-110 ring-2 ring-[#C9A84C]/30'
                              : 'border-white/15 hover:border-white/30'
                          }`}
                        >
                          <input
                            type="color"
                            value={captionColor}
                            onChange={(e) => setCaptionColor(e.target.value.toUpperCase())}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                          <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                          </svg>
                        </label>
                        {/* Eyedropper */}
                        {typeof window !== 'undefined' && 'EyeDropper' in window && (
                          <button
                            type="button"
                            title="Pick color from screen"
                            onClick={async () => {
                              try {
                                const dropper = new window.EyeDropper();
                                const result = await dropper.open();
                                setCaptionColor(result.sRGBHex.toUpperCase());
                              } catch (_) {}
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-full border-2 border-white/15 hover:border-white/30 bg-white/[0.05] hover:bg-white/[0.12] transition-all cursor-pointer group shrink-0"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors">
                              <path d="m2 22 1-1h3l9-9" />
                              <path d="M3 21v-3l9-9" />
                              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6" />
                            </svg>
                          </button>
                        )}
                        </div>
                        {/* Hex input */}
                        <div className="flex items-center gap-2 mt-2">
                        <div
                          className="w-6 h-6 rounded-md border border-white/15 shrink-0"
                          style={{ background: captionColor }}
                        />
                        <input
                          type="text"
                          value={captionColor}
                          onChange={(e) => {
                            let v = e.target.value.trim().toUpperCase();
                            if (!v.startsWith('#')) v = '#' + v;
                            if (/^#[0-9A-F]{0,6}$/.test(v)) setCaptionColor(v);
                          }}
                          onBlur={() => {
                            if (!/^#[0-9A-F]{6}$/i.test(captionColor)) setCaptionColor('#FFFFFF');
                          }}
                          maxLength={7}
                          placeholder="#FFFFFF"
                          className="flex-1 bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-lg text-white text-xs font-mono focus:border-[#C9A84C]/50 outline-none"
                        />
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* Effects — collapsible */}
                  <details className="rounded-xl border border-white/[0.08] bg-white/[0.02] group/details">
                    <summary className="flex items-center justify-between cursor-pointer list-none p-4 pb-2 select-none touch-manipulation min-h-[44px]">
                      <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest">Effects</h2>
                      <svg className="w-4 h-4 text-white/40 transition-transform group-open/details:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div className="px-4 pb-4 pt-1 space-y-1">
                    <Toggle label="Text Behind" description="Captions weave behind you" value={textBehind} onChange={setTextBehind} />
                    <Toggle label="Hook Text" description="Giant background text behind you" value={redHook} onChange={setRedHook} />
                    <Toggle label="Emphasis font" description="Use cursive font for emphasis words; off = same as regular" value={useEmphasisFont} onChange={setUseEmphasisFont} />

                    </div>
                  </details>
                  

                  {redHook && (
                    <details className="rounded-xl border border-white/[0.08] bg-white/[0.02] group/details">
                      <summary className="flex items-center justify-between cursor-pointer list-none p-4 pb-2 select-none touch-manipulation min-h-[44px]">
                        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest">Hook Text Style</h2>
                        <svg className="w-4 h-4 text-white/40 transition-transform group-open/details:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </summary>
                      <div className="px-4 pb-4 pt-1 space-y-4">
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Vertical position ({hookYPercent}%)</label>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={hookYPercent}
                          onChange={(e) => setHookYPercent(Number(e.target.value))}
                          style={{ '--value': hookYPercent }}
                          className="slider-gold"
                        />
                        <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                          <span>Top</span>
                          <span>Bottom</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Horizontal position</label>
                        <div className="flex gap-1.5">
                          {HORIZONTAL_POSITIONS.map((p) => (
                            <button
                              key={p.value}
                              onClick={() => setHookHorizontal(p.value)}
                              className={`flex-1 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                hookHorizontal === p.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Hook mask quality</label>
                        <p className="text-[10px] text-white/40 mb-1.5">Refines person cutout where hook appears for cleaner edges</p>
                        <div className="flex flex-wrap gap-1.5">
                          {HOOK_MASK_QUALITY.map((q) => (
                            <button
                              key={q.value}
                              onClick={() => setHookMaskQuality(q.value)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs border transition-all ${
                                hookMaskQuality === q.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                              }`}
                              title={q.description}
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Size ({Math.round(hookSize * 100)}%)</label>
                        <input
                          type="range"
                          min={0.3}
                          max={1.5}
                          step={0.1}
                          value={hookSize}
                          onChange={(e) => setHookSize(parseFloat(e.target.value))}
                          style={{ '--value': ((hookSize - 0.3) / 1.2) * 100 }}
                          className="slider-gold w-full"
                        />
                        <div className="flex justify-between text-[10px] text-white/40 mt-0.5">
                          <span>Fits screen</span>
                          <span>Large</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/50 mb-1.5 block">Color</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {CAPTION_COLORS.map((c) => (
                            <button
                              key={c.value}
                              onClick={() => setHookColor(c.value)}
                              title={c.label}
                              className={`w-9 h-9 sm:w-7 sm:h-7 rounded-full border-2 transition-all shrink-0 touch-manipulation ${
                                hookColor === c.value
                                  ? 'border-[#C9A84C] scale-110 ring-2 ring-[#C9A84C]/30'
                                  : 'border-white/15 hover:border-white/30'
                              }`}
                              style={{ background: c.value }}
                            />
                          ))}
                          {/* Native color picker - Palette Icon */}
                          <label
                            title="Custom color"
                            className={`w-7 h-7 rounded-full border-2 shrink-0 cursor-pointer overflow-hidden transition-all relative flex items-center justify-center bg-white/5 hover:bg-white/10 ${
                              !CAPTION_COLORS.some((c) => c.value === hookColor)
                                ? 'border-[#C9A84C] scale-110 ring-2 ring-[#C9A84C]/30'
                                : 'border-white/15 hover:border-white/30'
                            }`}
                          >
                            <input
                              type="color"
                              value={hookColor}
                              onChange={(e) => setHookColor(e.target.value.toUpperCase())}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            />
                            <svg className="w-4 h-4 text-white/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                            </svg>
                          </label>
                          {typeof window !== 'undefined' && 'EyeDropper' in window && (
                            <button
                              type="button"
                              title="Pick color from screen"
                              onClick={async () => {
                                try {
                                  const dropper = new window.EyeDropper();
                                  const result = await dropper.open();
                                  setHookColor(result.sRGBHex.toUpperCase());
                                } catch (_) {}
                              }}
                              className="w-7 h-7 flex items-center justify-center rounded-full border-2 border-white/15 hover:border-white/30 bg-white/[0.05] hover:bg-white/[0.12] transition-all cursor-pointer group shrink-0"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors">
                                <path d="m2 22 1-1h3l9-9" />
                                <path d="M3 21v-3l9-9" />
                                <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3L15 6" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div
                            className="w-6 h-6 rounded-md border border-white/15 shrink-0"
                            style={{ background: hookColor }}
                          />
                          <input
                            type="text"
                            value={hookColor}
                            onChange={(e) => {
                              let v = e.target.value.trim().toUpperCase();
                              if (!v.startsWith('#')) v = '#' + v;
                              if (/^#[0-9A-F]{0,6}$/.test(v)) setHookColor(v);
                            }}
                            onBlur={() => {
                              if (!/^#[0-9A-F]{6}$/i.test(hookColor)) setHookColor('#ef4444');
                            }}
                            maxLength={7}
                            placeholder="#EF4444"
                            className="flex-1 bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-lg text-white text-xs font-mono focus:border-[#C9A84C]/50 outline-none"
                          />
                        </div>
                      </div>
                      </div>
                    </details>
                  )}
                </div>
              )}

              {/* ---- B-ROLL TAB ---- */}
              {activeTab === 'broll' && (
                <>
                  <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
                    <Toggle label="Enable B-Roll" description="AI inserts matching cinematic clips with crossfades" value={enableBroll} onChange={setEnableBroll} />
                  </section>

                  {enableBroll && brollPlacements.length > 0 && (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Placements</h2>
                        <button
                          onClick={handleGenerateBroll}
                          disabled={loadingBroll}
                          className="text-xs text-[#C9A84C]/70 hover:text-[#C9A84C] transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          {loadingBroll ? (
                            <><span className="w-3 h-3 border border-[#C9A84C]/50 border-t-transparent rounded-full animate-spin" /> Refreshing…</>
                          ) : (
                            <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Regenerate All</>
                          )}
                        </button>
                      </div>
                      {brollPlacements.map((placement, pIdx) => (
                        <div
                          key={pIdx}
                          className={`rounded-xl border p-4 transition-all ${
                            placement.enabled
                              ? 'border-white/10 bg-white/[0.02]'
                              : 'border-white/[0.04] bg-white/[0.01] opacity-50'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-[#C9A84C] bg-[#C9A84C]/10 px-1.5 py-0.5 rounded">
                                  {placement.timestamp_seconds.toFixed(1)}s
                                </span>
                                <span className="text-sm text-white/80 font-medium truncate">{placement.theme}</span>
                              </div>
                              {placement.reason && (
                                <p className="text-xs text-white/35 mt-1 leading-relaxed">{placement.reason}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleBrollToggle(pIdx)}
                              className={`shrink-0 ml-3 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                                placement.enabled
                                  ? 'border-white/15 text-white/50 hover:text-red-400 hover:border-red-400/30'
                                  : 'border-[#C9A84C]/30 text-[#C9A84C]/70 hover:text-[#C9A84C]'
                              }`}
                            >
                              {placement.enabled ? 'Remove' : 'Restore'}
                            </button>
                          </div>

                          {placement.enabled && placement.clip_options?.length > 0 && (
                            <div className="space-y-3">
                              {/* 3 Clips in a row - smaller thumbnails */}
                              <div className="grid grid-cols-3 gap-2">
                                {placement.clip_options.slice(0, 3).map((clip, cIdx) => (
                                  <div
                                    key={clip.clip_id}
                                    className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video ${
                                      placement.selected_index === cIdx
                                        ? 'border-[#C9A84C] ring-1 ring-[#C9A84C]/30'
                                        : 'border-transparent hover:border-white/20'
                                    }`}
                                  >
                                    {/* Thumbnail / Video */}
                                    <button
                                      onClick={() => handleBrollSelectClip(pIdx, cIdx)}
                                      className="w-full h-full"
                                      title={clip.description || `Clip ${cIdx + 1}`}
                                    >
                                      {clip.thumbnail_url ? (
                                        <img
                                          src={clip.thumbnail_url}
                                          alt={clip.description || `Clip ${cIdx + 1}`}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : clip.clip_id ? (
                                        <BrollThumbnail
                                          clipId={clip.clip_id}
                                          alt={clip.description || `Clip ${cIdx + 1}`}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/20 text-xs">
                                          <svg className="w-4 h-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        </div>
                                      )}
                                    </button>
                                    
                                    {/* Preview button */}
                                    {clip.video_url && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewClip({ url: clip.video_url, description: clip.description });
                                        }}
                                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                                        title="Preview clip"
                                      >
                                        <div className="w-8 h-8 rounded-full bg-[#C9A84C] flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform">
                                          <svg className="w-4 h-4 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                          </svg>
                                        </div>
                                      </button>
                                    )}
                                    
                                    {placement.selected_index === cIdx && (
                                      <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#C9A84C] flex items-center justify-center shadow-lg pointer-events-none">
                                        <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              
                              {/* Regenerate button */}
                              <button
                                onClick={() => handleRegeneratePlacement(pIdx)}
                                disabled={regeneratingPlacementIndex !== null}
                                className="w-full py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:text-[#C9A84C] hover:border-[#C9A84C]/30 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                              >
                                {regeneratingPlacementIndex === pIdx ? (
                                  <>
                                    <span className="w-3 h-3 border border-[#C9A84C]/50 border-t-transparent rounded-full animate-spin" />
                                    Finding new clips...
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Not happy? Get 3 new clips
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </section>
                  )}

                  {enableBroll && brollPlacements.length === 0 && (
                    <div className="text-center py-8">
                      {loadingBroll ? (
                        <>
                          <div className="w-7 h-7 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                          <p className="text-white/50 text-sm">Finding the best B-Roll moments…</p>
                          <p className="text-xs text-white/25 mt-1">This takes a few seconds</p>
                        </>
                      ) : (
                        <>
                          <p className="text-white/40 text-sm mb-4">No B-Roll suggestions available.</p>
                          <button
                            onClick={handleGenerateBroll}
                            className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                            style={{ background: GOLD, color: '#000' }}
                          >
                            Generate B-Roll Suggestions
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {!enableBroll && (
                    <div className="text-center py-8 text-white/30 text-sm">
                      Enable B-Roll above to see placement options.
                    </div>
                  )}
                  
                  {/* B-Roll Video Preview Modal */}
                  {previewClip && createPortal(
                    <div 
                      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                      onClick={() => setPreviewClip(null)}
                    >
                      <div 
                        className="relative max-w-2xl w-full bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                          <span className="text-sm font-medium text-white/80 truncate pr-4">
                            {previewClip.description || 'B-Roll Preview'}
                          </span>
                          <button
                            onClick={() => setPreviewClip(null)}
                            className="p-1.5 text-white/40 hover:text-white/80 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        {/* Video */}
                        <div className="aspect-video bg-black">
                          <video
                            src={previewClip.url}
                            controls
                            autoPlay
                            className="w-full h-full"
                            onError={() => setPreviewClip(null)}
                          />
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                </>
              )}

              {/* ---- EFFECTS TAB ---- */}
              {activeTab === 'effects' && (
                <>
                  {!isDesktop ? (
                    <EffectsTabMobile
                      rotation={rotation}
                      onRotationChange={(value) => {
                        setRotation(value);
                        if (value !== 0) setRotationPopupSeen(true);
                      }}
                      colorGrade={colorGrade}
                      onColorGradeChange={setColorGrade}
                      roundedCorners={roundedCorners}
                      onRoundedCornersChange={setRoundedCorners}
                      aspectRatio={aspectRatio}
                      onAspectRatioChange={setAspectRatio}
                      noiseIsolation={noiseIsolation}
                      onNoiseIsolationChange={setNoiseIsolation}
                      colorGradePreviews={colorGradePreviews}
                    />
                  ) : (
                    <>
                      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">Rotate Video</label>
                          <p className="text-[10px] text-white/40 mb-2">The downloaded video, captions, and effects will be rendered in the rotated orientation. New person masks are generated for rotated frames.</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ROTATION_OPTIONS.map((r) => (
                              <button
                                key={r.value}
                                onClick={() => {
                                  setRotation(r.value);
                                  if (r.value !== 0) setRotationPopupSeen(true);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                  rotation === r.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                                }`}
                              >
                                {r.label}
                              </button>
                            ))}
                          </div>
                          {rotation !== 0 && (
                            <div className="mt-3 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/30 p-3 text-xs text-white/90">
                              <strong className="text-[#C9A84C]">Rotation applied to output</strong>
                              <p className="mt-1 text-white/70">Your downloaded video will be rotated {rotation}°. Captions, B-roll, hook text, and all effects will also be in rotated mode. New masks are generated for the rotated video.</p>
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">Color Grade</label>
                          <div className="flex flex-wrap gap-1.5">
                            {COLOR_GRADES.map((g) => (
                              <ColorGradeButton
                                key={g.value}
                                grade={g}
                                selected={colorGrade === g.value}
                                onSelect={() => setColorGrade(g.value)}
                                previews={colorGradePreviews}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">Rounded Corners</label>
                          <div className="flex gap-1.5">
                            {ROUNDED_OPTIONS.map((r) => (
                              <button
                                key={r.value}
                                onClick={() => setRoundedCorners(r.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                  roundedCorners === r.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                                }`}
                              >
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-white/50 mb-1.5 block">Aspect Ratio</label>
                          <div className="flex flex-wrap gap-1.5">
                            {ASPECT_RATIOS.map((a) => (
                              <button
                                key={a.value}
                                onClick={() => setAspectRatio(a.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                                  aspectRatio === a.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50 hover:border-white/20'
                                }`}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </section>
                      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
                        <Toggle label="Noise Reduction" description="AI removes background noise before transcription" value={noiseIsolation} onChange={setNoiseIsolation} />
                      </section>
                    </>
                  )}
                </>
              )}

              {/* ---- EXPORT TAB ---- */}
              {activeTab === 'export' && (
                <>
                  {/* Summary of choices */}
                  <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Your selections</h2>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <span className="text-white/40">Caption style</span>
                      <span className="text-white/80 font-medium">{CAPTION_PRESETS.find((p) => p.id === preset)?.label}</span>
                      <span className="text-white/40">B-Roll</span>
                      <span className={enableBroll ? 'text-[#C9A84C]' : 'text-white/40'}>{enableBroll ? 'On' : 'Off'}</span>
                      <span className="text-white/40">Text Behind</span>
                      <span className={textBehind ? 'text-[#C9A84C]' : 'text-white/40'}>{textBehind ? 'On' : 'Off'}</span>
                      <span className="text-white/40">Hook Text</span>
                      <span className={redHook ? 'text-[#C9A84C]' : 'text-white/40'}>{redHook ? 'On' : 'Off'}</span>
                      <span className="text-white/40">Noise Reduction</span>
                      <span className={noiseIsolation ? 'text-[#C9A84C]' : 'text-white/40'}>{noiseIsolation ? 'On' : 'Off'}</span>
                      {colorGrade && <>
                        <span className="text-white/40">Color Grade</span>
                        <span className="text-white/80">{COLOR_GRADES.find((g) => g.value === colorGrade)?.label}</span>
                      </>}
                      {roundedCorners !== 'none' && <>
                        <span className="text-white/40">Corners</span>
                        <span className="text-white/80">{roundedCorners}</span>
                      </>}
                      {aspectRatio && <>
                        <span className="text-white/40">Aspect Ratio</span>
                        <span className="text-white/80">{ASPECT_RATIOS.find((a) => a.value === aspectRatio)?.label}</span>
                      </>}
                      {rotation !== 0 && <>
                        <span className="text-white/40">Rotation</span>
                        <span className="text-[#C9A84C]">{rotation}°</span>
                      </>}
                      
                    </div>
                  </section>
                  <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
                    <p className="text-[11px] text-white/50 mb-2">Exports at 1080p HD for Instagram, TikTok, and YouTube Shorts.</p>
                    <Toggle label="Instagram Optimized" description="Tailored for Instagram Reels (1080�-1920)" value={instagramExport} onChange={setInstagramExport} />
                    
                  </section>
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={generating || (!videoId && !resolvedVideoIdState)}
                    className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20"
                    style={{ background: generating ? '#555' : GOLD, color: '#000' }}
                  >
                    {generating ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/40 border-t-transparent rounded-full animate-spin" />
                        Exporting…
                      </span>
                    ) : (
                      'Export'
                    )}
                  </button>
                  {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                </>
              )}
            </div>
          </div>

          {/* Feature action pills (always visible at bottom); horizontal scroll on mobile */}
          <div className="shrink-0 border-t border-white/[0.06] px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex overflow-x-auto overflow-y-hidden flex-nowrap sm:flex-wrap gap-2 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
              {ACTION_PILLS.map((pill) => {
                const isToggle = pill.stateKey != null;
                const isActive = isToggle ? pill.stateKey : false;
                return (
                  <button
                    key={pill.label}
                    onClick={() => {
                      if (pill.toggle) pill.toggle();
                      if (pill.tab) setActiveTab(pill.tab);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-full text-xs font-medium border transition-all touch-manipulation min-h-[44px] flex-shrink-0 ${
                      isActive
                        ? 'border-[#C9A84C]/60 bg-[#C9A84C]/15 text-[#C9A84C]'
                        : 'border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/80'
                    }`}
                  >
                    <span>{pill.icon}</span>
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Draggable splitter — thin grey line, full height; lg:order-1 keeps it between panels */}
        <div
          onPointerDown={handleSplitterPointerDown}
          onPointerMove={handleSplitterPointerMove}
          onPointerUp={handleSplitterPointerUp}
          onPointerCancel={handleSplitterPointerUp}
          className={`hidden lg:flex lg:order-1 shrink-0 cursor-col-resize self-stretch flex-col items-center justify-center touch-none select-none relative z-20 group min-h-0 ${
            isDragging ? 'bg-white/10' : 'hover:bg-white/5'
          }`}
          role="separator"
          aria-label="Resize panels — drag to adjust"
          style={{ minWidth: 24, width: 24 }}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/25 group-hover:bg-white/40 transition-colors pointer-events-none" />
        </div>

        {/* ============ RIGHT PANEL — Video Preview (first on mobile) ============ */}
        <div className="order-1 lg:order-2 flex-1 flex flex-col items-center justify-center bg-[#080808] p-3 sm:p-4 lg:p-8 min-h-0">
          <div
            ref={videoContainerRef}
            className="video-preview-container relative w-full mx-auto rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/[0.06]"
            style={{
              aspectRatio: videoAspect,
              maxWidth: 'min(100vw, 520px)',
              maxHeight: 'min(70vh, 720px)',
              width: '100%',
              minHeight: '300px',
              transform: previewRotation ? `rotate(${previewRotation}deg)` : undefined,
            }}
          >
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain block"
                  style={{ display: 'block' }}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration || 0);
                      if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
                        setVideoAspect(videoRef.current.videoWidth / videoRef.current.videoHeight);
                        setVideoSize({ width: videoRef.current.videoWidth, height: videoRef.current.videoHeight });
                      }
                      videoRef.current.currentTime = 0.1;
                      setVideoLoading(false);
                    }
                  }}
                  onLoadStart={() => setVideoLoading(true)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onError={(e) => {
                    console.error('Video error:', e);
                    setVideoError(true);
                  }}
                  playsInline
                  webkit-playsinline="true"
                  muted={muted}
                  preload="auto"
                  controlsList="nodownload"
                  disablePictureInPicture
                  loop={loop}
                  onClick={togglePlay}
                />
                <CaptionOverlay
                  key={`caption-${preset}`}
                  styledWords={styledWords}
                  timedCaptions={timedCaptions}
                  currentTime={currentTime}
                  preset={preset}
                  position={captionPosition}
                  positionYPercent={(preset === 'dynamic_smart' || preset === 'viral' || preset === 'marquee' || preset === 'split') ? captionYPercent : undefined}
                  positionHorizontal={(preset === 'dynamic_smart' || preset === 'viral' || preset === 'split') ? captionHorizontal : undefined}
                  fontSize={captionSize}
                  color={captionColor}
                  marqueeSpeed={marqueeSpeed}
                  videoSize={videoSize}
                  displaySize={displaySize}
                  styleColors={{ hook: hookColor, emphasis: emphasisColor, regular: regularColor }}
                />
                <HookPreviewOverlay
                  redHook={redHook}
                  hookYPercent={hookYPercent}
                  hookHorizontal={hookHorizontal}
                  hookSize={hookSize}
                  hookColor={hookColor}
                  styledWords={styledWords}
                  currentTime={currentTime}
                />
                
                {/* Watermark Overlay - Smart positioning based on video aspect ratio */}
                {(() => {
                  // Calculate aspect ratio from video dimensions
                  const isVertical = videoAspect && videoAspect < 1;
                  
                  if (isVertical) {
                    // VERTICAL VIDEO (9:16): Top-center watermark
                    return (
                      <div 
                        className="absolute z-20 pointer-events-none select-none"
                        style={{ 
                          top: '40px',
                          left: '50%', 
                          transform: 'translateX(-50%)',
                        }}
                      >
                        <span 
                          className="text-white/40 text-lg sm:text-xl font-medium tracking-[0.3em] uppercase"
                          style={{
                            textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 1px 4px rgba(0,0,0,0.8)',
                          }}
                        >
                          OBULA
                        </span>
                      </div>
                    );
                  } else {
                    // HORIZONTAL VIDEO (16:9): Bottom-right corner
                    return (
                      <div 
                        className="absolute z-20 pointer-events-none select-none"
                        style={{ bottom: '16px', right: '16px' }}
                      >
                        <span 
                          className="text-white/50 text-base font-medium tracking-wider uppercase"
                          style={{
                            textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.6)',
                          }}
                        >
                          OBULA
                        </span>
                      </div>
                    );
                  }
                })()}
                
                {/* Exit Fullscreen Button - shown when in fullscreen */}
                {isFullscreen && (
                  <button
                    onClick={toggleFullscreen}
                    className="absolute top-3 right-3 z-30 p-2 rounded-full bg-black/60 backdrop-blur-sm text-white/90 hover:text-white transition-all touch-manipulation"
                    aria-label="Exit fullscreen"
                    title="Exit fullscreen"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                {/* Video loading indicator */}
                {videoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-white/20 border-t-[#C9A84C] rounded-full animate-spin" />
                      <p className="text-white/60 text-sm">Loading video...</p>
                    </div>
                  </div>
                )}

                {/* Video error indicator */}
                {videoError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                    <div className="flex flex-col items-center gap-3 text-center px-4">
                      <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-white/80 text-sm">Failed to load video</p>
                      <button 
                        onClick={() => window.location.reload()}
                        className="text-xs text-[#C9A84C] hover:text-[#C9A84C]/80 underline"
                      >
                        Refresh page
                      </button>
                    </div>
                  </div>
                )}

                {/* Play button overlay when paused */}
                {!isPlaying && !videoLoading && !videoError && (
                  <button
                    onClick={togglePlay}
                    className="video-play-overlay absolute inset-0 flex items-center justify-center bg-black/40 transition-all hover:bg-black/50 active:bg-black/50 touch-manipulation"
                    aria-label="Play video"
                  >
                    <div className="video-play-button w-20 h-20 sm:w-16 sm:h-16 rounded-full bg-white/25 backdrop-blur-md flex items-center justify-center shadow-lg transform transition-transform active:scale-95">
                      <svg className="w-10 h-10 sm:w-8 sm:h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                  </button>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <p className="text-sm">Video preview loading…</p>
              </div>
            )}
          </div>

          {/* Watermark note */}
          <p className="mt-2 text-[11px] text-white/40 text-center">
            <span className="text-[#C9A84C]/70">Preview only:</span> OBULA watermark will not appear in downloaded video
          </p>

          {/* Playback controls — BIG TIMELINE on top + controls below */}
          <div className="video-controls-container mt-3 w-full max-w-md px-4 sm:px-0 space-y-2">
            
            {/* Row 1: BIG Timeline + Time */}
            <div className="flex items-center gap-3 p-2 rounded-xl bg-[#1a1a1a] border border-white/[0.06]">
              {/* BIG Progress bar */}
              <input 
                type="range" 
                min={0} 
                max={duration || 1} 
                step={0.1} 
                value={currentTime} 
                onChange={(e) => {
                  const t = parseFloat(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = t;
                  setCurrentTime(t);
                }} 
                className="flex-1 accent-white h-3 min-w-0 cursor-pointer rounded-full appearance-none bg-white/20 hover:bg-white/30 transition-colors"
                style={{
                  background: `linear-gradient(to right, #C9A84C 0%, #C9A84C ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) ${(currentTime / (duration || 1)) * 100}%)`
                }}
              />
              {/* Time display */}
              <span className="text-sm text-white/90 tabular-nums shrink-0 font-medium min-w-[80px] text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            
            {/* Row 2: Control buttons */}
            <div className="flex items-center justify-center gap-2 p-2 rounded-xl bg-[#1a1a1a] border border-white/[0.06]">
              
              {/* Play/Pause */}
              <button 
                onClick={togglePlay} 
                className="p-2 text-white/90 hover:text-white transition-all touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95" 
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              
              {/* Mute */}
              <button 
                onClick={toggleMute} 
                className="p-2 text-white/70 hover:text-white transition-all touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95" 
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                )}
              </button>
              
              {/* Speed selector */}
              <div className="relative">
                <select 
                  value={playbackRate} 
                  onChange={(e) => setPlaybackRate(parseFloat(e.target.value))} 
                  className="text-xs bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg px-2 py-1.5 text-white/90 focus:outline-none cursor-pointer appearance-none min-w-[50px] text-center"
                  title="Playback speed"
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                    <option key={r} value={r} className="bg-[#1a1a1a]">{r}x</option>
                  ))}
                </select>
                <svg className="w-3 h-3 text-white/50 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              
              {/* Loop - Different icon from Rotate */}
              <button 
                onClick={() => setLoop(l => !l)} 
                className={`p-2 transition-all touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95 ${loop ? 'text-[#C9A84C]' : 'text-white/70 hover:text-white'}`}
                title={loop ? 'Loop on' : 'Loop off'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
              
              {/* Rotate */}
              <button 
                onClick={cycleRotation} 
                className="p-2 text-white/70 hover:text-white transition-all touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95" 
                title="Rotate preview"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              
              {/* Fullscreen */}
              <button 
                onClick={toggleFullscreen} 
                className="p-2 text-white/70 hover:text-white transition-all touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-white/10 active:scale-95" 
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  )}
                </button>
            </div>
          </div>

          {/* Export Button - Below video controls */}
          <button
            onClick={() => handleGenerate(true)}
            disabled={generating || (!videoId && !resolvedVideoIdState)}
            className="mt-4 w-full max-w-md py-4 rounded-xl font-semibold text-base bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20 active:scale-[0.98]"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-black/40 border-t-transparent rounded-full animate-spin" />
                Exporting 1080p…
              </span>
            ) : (
              'Export 1080p'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
