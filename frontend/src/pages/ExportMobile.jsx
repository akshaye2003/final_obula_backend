import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getPrepData, startJob } from '../api/upload.js';
import './ExportMobile.css';

const GOLD = '#C9A84C';

const CAPTION_PRESETS = [
  { id: 'dynamic_smart', label: 'Dynamic Smart' },
  { id: 'marquee', label: 'Marquee' },
  { id: 'split', label: 'Cinematic Captions' },
  { id: 'viral', label: 'Punchy Captions' },
];

const COLOR_GRADES = [
  { value: '', label: 'None' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'frosted', label: 'Frosted' },
  { value: 'foliage', label: 'Foliage' },
  { value: 'cross_process', label: 'Cross Process' },
  { value: 'bw', label: 'B&W' },
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

const TABS = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'captions', label: 'Captions' },
  { id: 'broll', label: 'B-Roll' },
  { id: 'effects', label: 'Effects' },
  { id: 'export', label: 'Export' },
];

// Toggle Component
function Toggle({ label, value, onChange, description }) {
  return (
    <label className="flex items-center justify-between gap-3 py-3 cursor-pointer group">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white font-medium">{label}</span>
        {description && <p className="text-[11px] text-white/40 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          value ? 'bg-[#C9A84C]' : 'bg-white/[0.12]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          } mt-0.5`}
        />
      </button>
    </label>
  );
}

export default function ExportMobile() {
  const { prepJobId } = useParams();
  const [searchParams] = useSearchParams();
  const videoId = searchParams.get('videoId') || '';
  const navigate = useNavigate();

  // Loading state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State from prep data
  const [preset, setPreset] = useState('dynamic_smart');
  const [enableBroll, setEnableBroll] = useState(true);
  const [textBehind, setTextBehind] = useState(true);
  const [redHook, setRedHook] = useState(true);
  const [noiseIsolation, setNoiseIsolation] = useState(false);
  const [colorGrade, setColorGrade] = useState('');
  const [roundedCorners, setRoundedCorners] = useState('medium');
  const [aspectRatio, setAspectRatio] = useState('');
  const [rotation, setRotation] = useState(0);
  const [instagramExport, setInstagramExport] = useState(true);
  const [generating, setGenerating] = useState(false);

  const activeTab = 'export';

  // Fetch prep data on mount
  useEffect(() => {
    if (!prepJobId) {
      setError('Missing edit session');
      setLoading(false);
      return;
    }

    setLoading(true);
    getPrepData(prepJobId)
      .then((data) => {
        // Load saved settings from prep data if available
        if (data.export_settings) {
          const s = data.export_settings;
          setPreset(s.preset || 'dynamic_smart');
          setEnableBroll(s.enable_broll ?? true);
          setTextBehind(s.behind_person ?? true);
          setRedHook(s.enable_red_hook ?? true);
          setNoiseIsolation(s.enable_noise_isolation ?? false);
          setColorGrade(s.color_grade_lut || '');
          setRoundedCorners(s.rounded_corners || 'medium');
          setAspectRatio(s.aspect_ratio || '');
          setRotation(s.rotation || 0);
          setInstagramExport(s.export_instagram ?? true);
        }
        setLoading(false);
      })
      .catch((err) => {
        const d = err?.response?.data?.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d) && d[0]
            ? d[0]
            : err?.message || 'Failed to load data';
        setError(msg);
        setLoading(false);
      });
  }, [prepJobId]);

  const ACTION_PILLS = useMemo(
    () => [
      { label: 'Cinematic Captions', icon: '\u{1F3AC}', tab: 'captions' },
      { label: 'Add B-Roll', icon: '\u{1F3A5}', toggle: () => setEnableBroll((v) => !v), stateKey: enableBroll },
      { label: 'Text Behind', icon: '\u{1F9CA}', toggle: () => setTextBehind((v) => !v), stateKey: textBehind },
      { label: 'Colors', icon: '\u{1F3A8}', tab: 'effects' },
    ],
    [enableBroll, textBehind]
  );

  const handleTabChange = (tabId) => {
    if (tabId === 'export') return;
    navigate(`/edit/${prepJobId}?videoId=${videoId}&tab=${tabId}`);
  };

  const handleExport = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);

    try {
      const payload = {
        video_id: videoId,
        from_prep_id: prepJobId,
        preset,
        enable_broll: enableBroll,
        behind_person: textBehind,
        enable_red_hook: redHook,
        enable_noise_isolation: noiseIsolation,
        color_grade_lut: colorGrade || undefined,
        rounded_corners: roundedCorners,
        aspect_ratio: aspectRatio || undefined,
        export_instagram: instagramExport,
        ...(rotation !== 0 && { rotation }),
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
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="text-white/50 hover:text-white text-sm flex items-center gap-1 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={handleExport}
          disabled={generating}
          className="text-sm font-semibold px-4 py-2 rounded-lg bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all disabled:opacity-50 min-h-[40px]"
        >
          {generating ? 'Exporting…' : 'Export'}
        </button>
      </div>

      {/* Title Section */}
      <div className="px-4 pb-3">
        <h1 className="text-lg font-semibold text-white">Craft Your Clip</h1>
        <p className="text-white/40 text-xs mt-0.5">Refine words · Pick a style · Export</p>
      </div>

      {/* Tab Bar */}
      <div className="px-4 pb-4">
        <div className="flex overflow-x-auto gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              disabled={generating}
              className={`flex-1 min-w-[72px] py-2.5 text-[11px] font-medium transition-all whitespace-nowrap rounded-lg ${
                activeTab === tab.id
                  ? 'bg-[#4a4a3a] text-[#C9A84C]'
                  : 'text-white/50 hover:text-white/70'
              } disabled:opacity-50`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* YOUR SELECTIONS Card */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4 mb-3">
          <h2 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-4">
            YOUR SELECTIONS
          </h2>

          <div className="space-y-3">
            {/* Caption Style */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/50">Caption style</span>
              <span className="text-[13px] text-white font-medium">
                {CAPTION_PRESETS.find((p) => p.id === preset)?.label}
              </span>
            </div>

            {/* B-Roll */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/50">B-Roll</span>
              <span
                className={`text-[13px] font-medium ${enableBroll ? 'text-[#C9A84C]' : 'text-white/40'}`}
              >
                {enableBroll ? 'On' : 'Off'}
              </span>
            </div>

            {/* Text Behind */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/50">Text Behind</span>
              <span
                className={`text-[13px] font-medium ${textBehind ? 'text-[#C9A84C]' : 'text-white/40'}`}
              >
                {textBehind ? 'On' : 'Off'}
              </span>
            </div>

            {/* Hook Text */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/50">Hook Text</span>
              <span
                className={`text-[13px] font-medium ${redHook ? 'text-[#C9A84C]' : 'text-white/40'}`}
              >
                {redHook ? 'On' : 'Off'}
              </span>
            </div>

            {/* Noise Reduction */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/50">Noise Reduction</span>
              <span
                className={`text-[13px] font-medium ${noiseIsolation ? 'text-[#C9A84C]' : 'text-white/40'}`}
              >
                {noiseIsolation ? 'On' : 'Off'}
              </span>
            </div>

            {/* Corners */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-white/50">Corners</span>
              <span className="text-[13px] text-white font-medium">{roundedCorners}</span>
            </div>
          </div>
        </div>

        {/* Instagram Optimized Section */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-4 mb-4">
          <p className="text-[11px] text-white/40 mb-3">
            Exports at 1080p HD for Instagram, TikTok, and YouTube Shorts.
          </p>
          <div className="border-t border-white/[0.06] pt-3">
            <Toggle
              label="Instagram Optimized"
              description="Tailored for Instagram Reels (1080×1920)"
              value={instagramExport}
              onChange={setInstagramExport}
            />
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={generating}
          className="w-full py-4 rounded-xl font-semibold text-base bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-black/40 border-t-transparent rounded-full animate-spin" />
              Exporting…
            </span>
          ) : (
            'Export'
          )}
        </button>

        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
      </div>

      {/* Bottom Action Pills */}
      <div className="border-t border-white/[0.06] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#0a0a0a]">
        <div className="flex overflow-x-auto gap-2 scrollbar-none">
          {ACTION_PILLS.map((pill) => {
            const isActive = pill.stateKey ?? false;
            return (
              <button
                key={pill.label}
                onClick={() => {
                  if (pill.toggle) pill.toggle();
                  if (pill.tab) handleTabChange(pill.tab);
                }}
                disabled={generating}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'border-[#C9A84C]/60 bg-[#C9A84C]/15 text-[#C9A84C]'
                    : 'border-white/[0.12] bg-[#1a1a1a] text-white/60 hover:border-white/20 hover:text-white/80'
                } disabled:opacity-50`}
              >
                <span>{pill.icon}</span>
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Styles */}
      <style>{`
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
