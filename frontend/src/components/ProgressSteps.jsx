// Short status labels — minimal, one-line
const SHORT_LABELS = {
  queued: 'Starting…',
  processing: 'Initializing…',
  extracting_audio: 'Preparing video…',
  generating_masks: 'Detecting faces…',
  transcribing: 'Transcribing audio…',
  burning_captions: 'Adding captions…',
  generating_broll: 'Adding B-roll…',
  building_video: 'Exporting…',
};

const STAGE_ORDER = ['queued', 'processing', 'extracting_audio', 'generating_masks', 'transcribing', 'burning_captions', 'generating_broll', 'building_video'];

export default function ProgressSteps({ stage, message, progress }) {
  const pct = progress != null ? Math.round(progress) : (stage ? Math.round(((STAGE_ORDER.indexOf(stage) + 0.5) / STAGE_ORDER.length) * 100) : 0);
  const status = stage ? (SHORT_LABELS[stage] ?? stage.replace(/_/g, ' ')) : 'Processing…';

  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-20 px-4">
      {/* Large percentage */}
      <div className="text-5xl sm:text-6xl font-light tabular-nums text-white tracking-tight mb-8">
        {pct}%
      </div>

      {/* Single progress bar */}
      <div className="w-full max-w-sm h-1.5 bg-white/10 rounded-full overflow-hidden mb-8">
        <div
          className="h-full bg-[#C9A84C] transition-all duration-700 ease-out rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Short status line */}
      <p className="text-white/60 text-sm sm:text-base font-normal tracking-wide">
        {status}
      </p>
    </div>
  );
}
