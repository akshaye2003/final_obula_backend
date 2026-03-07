import { useState, useRef, useCallback, useEffect } from 'react';

const PRESETS = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1 min' },
  { value: 90, label: '1½ min' },
  { value: 120, label: '2 min' },
];
const MIN = 5;
const DEFAULT_MAX = 120;
const STEP = 5;

function formatDuration(sec) {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${m} min`;
  }
  return `${sec}s`;
}

export default function DurationSlider({ value, onChange, label = 'Clip duration', maxDuration }) {
  const MAX = maxDuration ? Math.max(MIN, Math.min(300, Math.ceil(maxDuration))) : DEFAULT_MAX;
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(() => Math.min(MAX, Math.max(MIN, Number(value) || 15)));

  useEffect(() => {
    const v = Number(value) || 15;
    setLocalValue(Math.min(MAX, Math.max(MIN, v)));
  }, [value, MAX]);

  const percent = ((localValue - MIN) / (MAX - MIN)) * 100;

  const percentToValue = useCallback((p) => {
    const v = MIN + (p / 100) * (MAX - MIN);
    return Math.round(v / STEP) * STEP;
  }, [MAX]);

  const updateFromEvent = useCallback(
    (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const val = percentToValue(x * 100);
      const clamped = Math.min(MAX, Math.max(MIN, val));
      setLocalValue(clamped);
      onChange?.(String(clamped));
    },
    [onChange, percentToValue]
  );

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    updateFromEvent(e.clientX);
  };

  const handleTouchStart = (e) => {
    setIsDragging(true);
    updateFromEvent(e.touches[0].clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e) =>
      updateFromEvent(e.touches ? e.touches[0].clientX : e.clientX);
    const handleEnd = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, updateFromEvent]);

  return (
    <div className="space-y-4">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-white/50 uppercase tracking-widest">{label}</span>
          <span
            className={`text-xl font-bold tabular-nums tracking-tight transition-all duration-200 ${
              isDragging ? 'text-primary scale-105' : 'text-white'
            }`}
          >
            {formatDuration(localValue)}
          </span>
        </div>
      )}
      {/* Premium track + thumb */}
      <div
        ref={trackRef}
        className="relative h-12 flex items-center cursor-pointer select-none group"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="slider"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={localValue}
        aria-valuetext={formatDuration(localValue)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = Math.max(MIN, localValue - (e.shiftKey ? 15 : STEP));
            setLocalValue(v);
            onChange?.(String(v));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            const v = Math.min(MAX, localValue + (e.shiftKey ? 15 : STEP));
            setLocalValue(v);
            onChange?.(String(v));
          }
        }}
      >
        {/* Background track – premium gradient */}
        <div className="absolute inset-x-0 h-2.5 rounded-full bg-white/5 overflow-hidden border border-white/10" />
        {/* Fill track – gradient glow */}
        <div
          className="absolute left-0 h-2.5 rounded-l-full bg-gradient-to-r from-primary/90 to-primary transition-[width] duration-150 ease-out shadow-[inset_0_0_12px_rgba(0,174,239,0.3)]"
          style={{ width: `${percent}%` }}
        />
        {/* Thumb – premium pill */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-8 h-8 -ml-4 rounded-full bg-white shadow-lg border-2 border-primary/50 transition-all duration-150 flex items-center justify-center ${
            isDragging
              ? 'scale-110 shadow-[0_0_24px_rgba(0,174,239,0.4)] ring-4 ring-primary/20'
              : 'group-hover:scale-105 group-hover:shadow-xl'
          }`}
          style={{ left: `${percent}%` }}
        >
          <div className="w-2 h-2 rounded-full bg-primary" />
        </div>
      </div>
      {/* Quick presets – premium pill buttons (only show presets <= max) */}
      <div className="flex gap-2 flex-wrap">
        {maxDuration && Math.ceil(maxDuration) !== localValue && (
          <button
            key="full"
            type="button"
            onClick={() => {
              const full = Math.min(MAX, Math.ceil(maxDuration));
              setLocalValue(full);
              onChange?.(String(full));
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200 border bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20"
          >
            Full ({formatDuration(Math.ceil(maxDuration))})
          </button>
        )}
        {PRESETS.filter((p) => p.value <= MAX).map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              setLocalValue(p.value);
              onChange?.(String(p.value));
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200 border ${
              localValue === p.value
                ? 'bg-primary text-white border-primary shadow-md shadow-primary/30'
                : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
