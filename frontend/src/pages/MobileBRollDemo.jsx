import { useState, useEffect } from 'react';
import MobileBRollPanel from '../components/MobileBRollPanel.jsx';

const TABS = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'captions', label: 'Captions' },
  { id: 'broll', label: 'B-Roll' },
  { id: 'effects', label: 'Effects' },
  { id: 'export', label: 'Export' },
];

const GOLD = '#C9A84C';

// Simple Toggle component
function Toggle({ label, value, onChange, description }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer group">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/90 font-medium">{label}</span>
        {description && <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{description}</p>}
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

// Mock Transcript Tab
function TranscriptTab() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-white/45 uppercase tracking-widest font-medium">Editable Transcript</span>
          <span className="text-[11px] text-[#C9A84C]/90">Saved</span>
        </div>
        <div className="max-h-64 overflow-y-auto pr-2 slim-scroll">
          <p className="text-[15px] leading-[1.7] text-white/70">
            <span className="text-[#ef4444] font-semibold">Welcome</span> to the future of content creation. 
            Today we're going to talk about how <span className="text-[#C9A84C] font-semibold">AI</span> is 
            transforming the way we make videos. Imagine being able to create 
            <span className="text-[#ef4444] font-semibold"> professional content</span> in minutes instead of hours.
          </p>
        </div>
        <p className="text-xs text-white/60 mt-4 leading-relaxed px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <span className="font-medium text-white/70">Tip:</span> Tap a word to edit or change its style
        </p>
      </section>
    </div>
  );
}

// Mock Captions Tab
function CaptionsTab() {
  const [preset, setPreset] = useState('dynamic_smart');
  const [captionSize, setCaptionSize] = useState(100);
  
  const presets = [
    { id: 'dynamic_smart', label: 'Dynamic Smart' },
    { id: 'marquee', label: 'Marquee' },
    { id: 'split', label: 'Cinematic' },
    { id: 'viral', label: 'Punchy Captions' },
  ];
  
  const sizes = [
    { value: 70, label: 'S' },
    { value: 100, label: 'M' },
    { value: 130, label: 'L' },
    { value: 160, label: 'XL' },
  ];

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-3">Style</h2>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`p-3 rounded-xl border text-center transition-all ${
                preset === p.id
                  ? 'border-[#C9A84C]/60 bg-[#C9A84C]/10 text-white'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/60'
              }`}
            >
              <span className="text-xs font-medium">{p.label}</span>
            </button>
          ))}
        </div>
      </section>
      
      <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
        <h2 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-3">Size</h2>
        <div className="flex gap-2">
          {sizes.map((s) => (
            <button
              key={s.value}
              onClick={() => setCaptionSize(s.value)}
              className={`flex-1 py-2 rounded-lg text-xs border transition-all font-semibold ${
                captionSize === s.value ? 'border-[#C9A84C] bg-[#C9A84C]/15 text-white' : 'border-white/10 text-white/50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// Mock Effects Tab
function EffectsTab() {
  const [textBehind, setTextBehind] = useState(true);
  const [redHook, setRedHook] = useState(true);
  const [noiseIsolation, setNoiseIsolation] = useState(false);

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-1">
        <Toggle label="Text Behind" description="Captions weave behind you" value={textBehind} onChange={setTextBehind} />
        <Toggle label="Hook Text" description="Giant background text behind you" value={redHook} onChange={setRedHook} />
        <Toggle label="Noise Reduction" description="AI removes background noise" value={noiseIsolation} onChange={setNoiseIsolation} />
      </section>
    </div>
  );
}

// Mock Export Tab
function ExportTab() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Your selections</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-white/40">Caption style</span>
          <span className="text-white/80 font-medium">Dynamic Smart</span>
          <span className="text-white/40">B-Roll</span>
          <span className="text-[#C9A84C]">On</span>
          <span className="text-white/40">Text Behind</span>
          <span className="text-[#C9A84C]">On</span>
        </div>
      </section>
      
      <button
        className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-[#C9A84C]/20"
        style={{ background: GOLD, color: '#000' }}
      >
        Export
      </button>
    </div>
  );
}

// Action Pills
const ACTION_PILLS = [
  { label: 'Cinematic Captions', icon: '🎬', active: false },
  { label: 'Add B-Roll', icon: '🎥', active: true },
  { label: 'Text Behind', icon: '🧊', active: true },
  { label: 'Color Grade', icon: '🎨', active: false },
  { label: 'Noise Reduction', icon: '🔊', active: false },
];

export default function MobileBRollDemo() {
  const [activeTab, setActiveTab] = useState('broll');
  const [isMobile, setIsMobile] = useState(true);

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'transcript':
        return <TranscriptTab />;
      case 'captions':
        return <CaptionsTab />;
      case 'broll':
        return <MobileBRollPanel />;
      case 'effects':
        return <EffectsTab />;
      case 'export':
        return <ExportTab />;
      default:
        return <MobileBRollPanel />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <button className="text-white/45 hover:text-white/80 text-sm flex items-center gap-1.5 transition-colors -ml-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <button
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all shadow-lg shadow-[#C9A84C]/20"
          >
            Export
          </button>
        </div>
        <h1 className="text-lg font-semibold text-white tracking-tight">Craft Your Clip</h1>
        <p className="text-white/45 text-xs mt-1">Refine words · Pick a style · Export</p>
      </div>

      {/* Tab Bar */}
      <div className="px-4 pb-2 shrink-0">
        <div 
          className="flex overflow-x-auto overflow-y-hidden gap-0.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] scrollbar-none"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[72px] py-2.5 text-[11px] font-medium transition-all whitespace-nowrap rounded-lg ${
                activeTab === tab.id
                  ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
                  : 'text-white/50 hover:text-white/75'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 slim-scroll">
        <div key={activeTab} className="animate-tabFade">
          {renderTabContent()}
        </div>
      </div>

      {/* Action Pills */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div 
          className="flex overflow-x-auto overflow-y-hidden flex-nowrap gap-2 scrollbar-none"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {ACTION_PILLS.map((pill) => (
            <button
              key={pill.label}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                pill.active
                  ? 'border-[#C9A84C]/60 bg-[#C9A84C]/15 text-[#C9A84C]'
                  : 'border-white/10 bg-white/[0.03] text-white/55'
              }`}
            >
              <span>{pill.icon}</span>
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile viewport indicator for demo */}
      <div className="fixed bottom-4 right-4 text-[10px] text-white/30 bg-black/50 px-2 py-1 rounded">
        Mobile View
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes tabFade { 
          from { opacity: 0; transform: translateY(6px); } 
          to { opacity: 1; transform: translateY(0); } 
        }
        .animate-tabFade { 
          animation: tabFade 0.2s ease-out both; 
        }
        .scrollbar-none { 
          -ms-overflow-style: none; 
          scrollbar-width: none; 
        }
        .scrollbar-none::-webkit-scrollbar { 
          display: none; 
        }
        .slim-scroll { 
          scrollbar-width: thin; 
          scrollbar-color: rgba(255,255,255,0.1) transparent; 
        }
        .slim-scroll::-webkit-scrollbar { 
          width: 4px; 
        }
        .slim-scroll::-webkit-scrollbar-track { 
          background: transparent; 
        }
        .slim-scroll::-webkit-scrollbar-thumb { 
          background: rgba(255,255,255,0.1); 
          border-radius: 4px; 
        }
      `}</style>
    </div>
  );
}
