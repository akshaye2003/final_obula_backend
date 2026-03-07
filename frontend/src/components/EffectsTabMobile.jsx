/**
 * EffectsTabMobile - Mobile-optimized Effects tab for EditClip page
 * Features:
 * - Larger touch targets (min 44px)
 * - Improved spacing for mobile
 * - Horizontal scrolling for button groups
 * - Sticky action bar at bottom
 * - Clean, accessible design
 */

import { useState } from 'react';

const GOLD = '#C9A84C';

const ROTATION_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 90, label: '90° CW' },
  { value: 180, label: '180°' },
  { value: 270, label: '90° CCW' },
];

const COLOR_GRADES = [
  { value: '', label: 'None', description: 'No color grading' },
  { value: 'vintage', label: 'Vintage', description: 'Warm film emulation' },
  { value: 'cinematic', label: 'Cinematic', description: 'Cinematic film look' },
  { value: 'frosted', label: 'Frosted', description: 'Cool, muted tones' },
  { value: 'foliage', label: 'Foliage', description: 'Rich greens, natural tones' },
  { value: 'cross_process', label: 'CrossProcess', description: 'Cross-process film effect' },
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

// Toggle component with larger touch target
function Toggle({ label, value, onChange, description }) {
  return (
    <label className="flex items-center justify-between gap-4 py-4 cursor-pointer group min-h-[56px]">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/90 font-medium">{label}</span>
        {description && <p className="text-xs text-white/40 mt-1 leading-relaxed">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-7 w-14 shrink-0 rounded-full transition-colors duration-200 ${
          value ? 'bg-[#C9A84C]' : 'bg-white/[0.08]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform transition-transform duration-200 ${
            value ? 'translate-x-7' : 'translate-x-0.5'
          } mt-0.5`}
        />
      </button>
    </label>
  );
}

// Section header component
function SectionHeader({ title, description }) {
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold text-white/60 uppercase tracking-widest">{title}</h3>
      {description && <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{description}</p>}
    </div>
  );
}

// Button pill for option groups
function OptionButton({ label, selected, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex-shrink-0 px-4 py-3 rounded-xl text-sm font-medium border transition-all active:scale-[0.98] min-h-[44px] ${
        selected
          ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white'
          : 'border-white/10 text-white/60 hover:border-white/20 hover:text-white/80'
      }`}
    >
      {label}
    </button>
  );
}

// Horizontal scrollable button group
function ScrollableButtonGroup({ children, className = '' }) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide scroll-snap-x ${className}`}
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {children}
    </div>
  );
}

// Main Effects Tab Component
export default function EffectsTabMobile({
  rotation = 0,
  onRotationChange,
  colorGrade = '',
  onColorGradeChange,
  roundedCorners = 'medium',
  onRoundedCornersChange,
  aspectRatio = '',
  onAspectRatioChange,
  noiseIsolation = false,
  onNoiseIsolationChange,
  colorGradePreviews = null,
  onColorGradeHover,
}) {
  const [showRotationInfo, setShowRotationInfo] = useState(false);

  const handleRotationChange = (value) => {
    onRotationChange?.(value);
    if (value !== 0) setShowRotationInfo(true);
  };

  return (
    <div className="space-y-4 pb-24 effects-tab">
      {/* Rotate Video Section */}
      <section className="effects-section rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <SectionHeader
          title="Rotate Video"
          description="The downloaded video, captions, and effects will be rendered in the rotated orientation. New person masks are generated for rotated frames."
        />
        <ScrollableButtonGroup>
          {ROTATION_OPTIONS.map((r) => (
            <OptionButton
              key={r.value}
              label={r.label}
              selected={rotation === r.value}
              onClick={() => handleRotationChange(r.value)}
            />
          ))}
        </ScrollableButtonGroup>
        
        {rotation !== 0 && showRotationInfo && (
          <div className="mt-4 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/30 p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#C9A84C] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-[#C9A84C]">Rotation applied to output</p>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  Your downloaded video will be rotated {rotation}°. Captions, B-roll, hook text, and all effects will also be in rotated mode.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowRotationInfo(false)}
              className="mt-3 text-xs text-[#C9A84C]/80 hover:text-[#C9A84C] font-medium"
            >
              Got it
            </button>
          </div>
        )}
      </section>

      {/* Color Grade Section */}
      <section className="effects-section rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <SectionHeader title="Color Grade" />
        <ScrollableButtonGroup>
          {COLOR_GRADES.map((g) => (
            <OptionButton
              key={g.value}
              label={g.label}
              selected={colorGrade === g.value}
              onClick={() => onColorGradeChange?.(g.value)}
              title={g.description}
            />
          ))}
        </ScrollableButtonGroup>
        
        {/* Color grade preview thumbnails */}
        {colorGradePreviews && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video">
              <img
                src={colorGradePreviews.before || '/color-grade-previews/before.png'}
                alt="Original"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 left-2 text-[10px] font-medium text-white/80 bg-black/50 px-2 py-0.5 rounded-full">
                Original
              </span>
            </div>
            <div className="relative rounded-xl overflow-hidden border border-[#C9A84C]/30 aspect-video">
              <img
                src={
                  colorGrade
                    ? colorGradePreviews[colorGrade] || `/color-grade-previews/${colorGrade}.png`
                    : colorGradePreviews.before || '/color-grade-previews/before.png'
                }
                alt="Preview"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 left-2 text-[10px] font-medium text-[#C9A84C] bg-black/50 px-2 py-0.5 rounded-full">
                {colorGrade ? COLOR_GRADES.find((g) => g.value === colorGrade)?.label : 'Original'}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Rounded Corners Section */}
      <section className="effects-section rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <SectionHeader title="Rounded Corners" />
        <div className="grid grid-cols-4 gap-2">
          {ROUNDED_OPTIONS.map((r) => (
            <button
              key={r.value}
              onClick={() => onRoundedCornersChange?.(r.value)}
              className={`py-3 px-2 rounded-xl text-sm font-medium border transition-all active:scale-[0.98] ${
                roundedCorners === r.value
                  ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/20'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        
        {/* Visual preview of corner radius */}
        <div className="mt-4 flex justify-center">
          <div
            className="w-32 h-20 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 transition-all duration-300"
            style={{
              borderRadius:
                roundedCorners === 'none'
                  ? '0px'
                  : roundedCorners === 'subtle'
                  ? '8px'
                  : roundedCorners === 'medium'
                  ? '16px'
                  : '28px',
            }}
          />
        </div>
      </section>

      {/* Aspect Ratio Section */}
      <section className="effects-section rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <SectionHeader title="Aspect Ratio" />
        <ScrollableButtonGroup>
          {ASPECT_RATIOS.map((a) => (
            <OptionButton
              key={a.value}
              label={a.label}
              selected={aspectRatio === a.value}
              onClick={() => onAspectRatioChange?.(a.value)}
            />
          ))}
        </ScrollableButtonGroup>
        
        {/* Visual preview of aspect ratio */}
        <div className="mt-4 flex justify-center">
          <div
            className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 transition-all duration-300"
            style={{
              width: '120px',
              aspectRatio:
                aspectRatio === '9:16'
                  ? '9/16'
                  : aspectRatio === '1:1'
                  ? '1/1'
                  : aspectRatio === '4:5'
                  ? '4/5'
                  : '16/9',
              borderRadius: roundedCorners === 'none' ? '0px' : roundedCorners === 'subtle' ? '8px' : roundedCorners === 'medium' ? '16px' : '28px',
            }}
          />
        </div>
      </section>

      {/* Noise Reduction Toggle */}
      <section className="effects-section rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
        <Toggle
          label="Noise Reduction"
          description="AI removes background noise before transcription"
          value={noiseIsolation}
          onChange={onNoiseIsolationChange}
        />
      </section>

      {/* Quick Actions Bar - Sticky at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-lg border-t border-white/[0.06] px-4 py-3 safe-area-pb action-bar-shadow lg:hidden">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          <ActionPill icon="🎬" label="Captions" />
          <ActionPill icon="🎥" label="B-Roll" />
          <ActionPill icon="🧊" label="Text Behind" active />
          <ActionPill icon="🎨" label="Color" />
        </div>
      </div>
    </div>
  );
}

// Action pill button for bottom bar
function ActionPill({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border whitespace-nowrap transition-all active:scale-[0.98] ${
        active
          ? 'border-[#C9A84C]/60 bg-[#C9A84C]/15 text-[#C9A84C]'
          : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20'
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}
