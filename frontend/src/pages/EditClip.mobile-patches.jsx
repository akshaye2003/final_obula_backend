// ============================================
// MOBILE IMPROVEMENT PATCHES FOR EditClip.jsx
// Copy these modifications into your EditClip.jsx
// ============================================

// ============================================
// PATCH 1: IMPORT - Add at top of file
// ============================================
import './EditClip.mobile-improvements.css'; // Add this import


// ============================================
// PATCH 2: TAB BAR - Replace the tab bar div (around line 1363)
// ============================================
// OLD CODE:
{/* <div className="flex gap-0.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] shrink-0">
  {TABS.map((tab) => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`flex-1 py-2.5 sm:py-2 text-[11px] font-medium transition-all whitespace-nowrap touch-manipulation min-h-[40px] rounded-lg ${
        activeTab === tab.id
          ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
          : 'text-white/50 hover:text-white/75 hover:bg-white/[0.04]'
      }`}
    >
      {tab.label}
    </button>
  ))}
</div> */}

// NEW CODE:
<div className="tab-bar flex gap-0.5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] shrink-0">
  {TABS.map((tab) => (
    <button
      key={tab.id}
      onClick={() => setActiveTab(tab.id)}
      className={`flex-1 py-2.5 sm:py-2 text-[11px] font-medium transition-all whitespace-nowrap touch-manipulation min-h-[44px] sm:min-h-[40px] rounded-lg active:scale-[0.98] ${
        activeTab === tab.id
          ? 'bg-[#C9A84C]/20 text-[#C9A84C]'
          : 'text-white/50 hover:text-white/75 hover:bg-white/[0.04]'
      }`}
    >
      {tab.label}
    </button>
  ))}
</div>


// ============================================
// PATCH 3: TRANSCRIPT VIEWER - Update word rendering (around line 360-382)
// ============================================
// OLD CODE:
{/* <span
  key={i}
  ref={isActive ? activeRef : undefined}
  onClick={(e) => handleWordClick(e, i, w)}
  onContextMenu={(e) => handleContextMenu(e, i)}
  className={`transition-all duration-200 cursor-pointer rounded-md select-none inline-block ${
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
</span> */}

// NEW CODE:
<span
  key={i}
  ref={isActive ? activeRef : undefined}
  onClick={(e) => handleWordClick(e, i, w)}
  onContextMenu={(e) => handleContextMenu(e, i)}
  className={`transcript-word transition-all duration-200 cursor-pointer rounded-md select-none inline-flex items-center justify-center ${
    isActive
      ? 'font-semibold ring-1 ring-white/20'
      : 'hover:bg-white/[0.06]'
  }`}
  style={{
    color,
    backgroundColor: isActive ? 'rgba(201,168,76,0.12)' : undefined,
    padding: '6px 10px',
    minHeight: '36px',
    fontSize: '15px',
    margin: '2px',
  }}
  title={isTouchDevice ? 'Tap to change style or edit' : 'Click to edit · Right-click to change style'}
>
  {w.word}
</span>


// ============================================
// PATCH 4: STYLE COLORS GRID - Update the grid (around line 1411)
// ============================================
// OLD CODE:
{/* <div className="grid grid-cols-3 gap-2"> */}

// NEW CODE:
<div className="grid grid-cols-3 gap-3 sm:gap-2">

// Also update each label inside:
// OLD:
{/* <label className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group"> */}

// NEW:
<label className="flex flex-col items-center gap-2 p-4 sm:p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group touch-manipulation">

// Update the color swatch divs:
// OLD:
{/* <div className="relative w-10 h-10"> */}

// NEW:
<div className="color-swatch relative w-12 h-12 sm:w-10 sm:h-10">


// ============================================
// PATCH 5: ACTION PILLS - Update container (around line 2234)
// ============================================
// OLD CODE:
{/* <div className="shrink-0 border-t border-white/[0.06] px-4 sm:px-5 py-3">
  <div className="flex flex-wrap gap-2">
    {ACTION_PILLS.map((pill) => (...))}
  </div>
</div> */}

// NEW CODE:
<div className="shrink-0 border-t border-white/[0.06] px-4 sm:px-5 py-3">
  <div className="action-pills-container flex gap-2">
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
          className={`action-pill inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-full text-xs font-medium border transition-all touch-manipulation min-h-[44px] sm:min-h-[36px] active:scale-[0.98] ${
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


// ============================================
// PATCH 6: EXPORT BUTTON - Update both instances
// ============================================

// First instance (around line 1342) - Update className:
// OLD:
{/* className="text-sm font-semibold px-4 py-2 rounded-xl bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20" */}

// NEW:
className="btn-export text-sm font-semibold px-4 py-3 sm:py-2 rounded-xl bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20 min-h-[48px] sm:min-h-[40px]"


// Second instance (around line 2428) - Update className:
// OLD:
{/* className="mt-4 w-full max-w-md py-3 rounded-xl font-semibold text-sm bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20" */}

// NEW:
className="btn-export mt-4 w-full max-w-md py-4 sm:py-3 rounded-xl font-semibold text-base sm:text-sm bg-[#C9A84C] text-black hover:bg-[#C9A84C]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#C9A84C]/20 min-h-[52px] sm:min-h-[44px]"


// ============================================
// PATCH 7: VIDEO PREVIEW - Update container (around line 2278)
// ============================================
// OLD:
{/* <div className="order-1 lg:order-2 flex-1 flex flex-col items-center justify-center bg-[#080808] p-3 sm:p-4 lg:p-8 min-h-0">
  <div
    ref={videoContainerRef}
    className="relative w-full mx-auto rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/[0.06]"
    style={{...}}
  > */}

// NEW:
{/* <div className="right-panel order-1 lg:order-2 flex-1 flex flex-col items-center justify-center bg-[#080808] p-3 sm:p-4 lg:p-8 min-h-0">
  <div
    ref={videoContainerRef}
    className="video-preview-container relative w-full mx-auto rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/[0.06]"
    style={{...}}
  > */}


// ============================================
// PATCH 8: VIDEO CONTROLS - Update container (around line 2360)
// ============================================
// OLD:
{/* <div className="mt-4 w-full max-w-md">
  <div className="flex items-center gap-2 sm:gap-3 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]"> */}

// NEW:
{/* <div className="mt-4 w-full max-w-md px-2 sm:px-0">
  <div className="video-controls flex items-center gap-2 sm:gap-3 p-3 sm:p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]"> */}


// ============================================
// PATCH 9: LEFT PANEL - Add className (around line 1316)
// ============================================
// OLD:
{/* <div
  className="order-2 lg:order-1 shrink-0 border-t lg:border-t-0 lg:border-r border-white/[0.06] flex flex-col h-auto lg:h-[calc(100vh-4rem)] min-h-0 bg-[#0a0a0a]"
  style={{ width: isDesktop ? leftPanelWidth : undefined }}
> */}

// NEW:
{/* <div
  className="left-panel order-2 lg:order-1 shrink-0 border-t lg:border-t-0 lg:border-r border-white/[0.06] flex flex-col h-auto lg:h-[calc(100vh-4rem)] min-h-0 bg-[#0a0a0a]"
  style={{ width: isDesktop ? leftPanelWidth : undefined }}
> */}


// ============================================
// PATCH 10: TOGGLE COMPONENT - Update (around line 730)
// ============================================
// OLD:
{/* function Toggle({ label, value, onChange, description }) {
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
} */}

// NEW:
function Toggle({ label, value, onChange, description }) {
  return (
    <label className="toggle-container flex items-center justify-between gap-3 py-3 sm:py-2.5 cursor-pointer group min-h-[52px] sm:min-h-[44px]">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/90 font-medium">{label}</span>
        {description && <p className="text-[11px] sm:text-[11px] text-white/40 mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`toggle-switch relative inline-flex h-7 w-14 sm:h-6 sm:w-11 shrink-0 rounded-full transition-colors duration-200 ${value ? 'bg-[#C9A84C]' : 'bg-white/[0.08]'}`}
      >
        <span className={`pointer-events-none inline-block h-6 w-6 sm:h-5 sm:w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${value ? 'translate-x-[34px] sm:translate-x-[22px]' : 'translate-x-0.5'} mt-0.5`} />
      </button>
    </label>
  );
}


// ============================================
// PATCH 11: B-ROLL GRID - Update (around line 1926)
// ============================================
// OLD:
{/* <div className="grid grid-cols-3 gap-2"> */}

// NEW:
{/* <div className="broll-grid grid grid-cols-2 sm:grid-cols-3 gap-2"> */}


// ============================================
// PATCH 12: MAIN CONTAINER - Add className (around line 1315)
// ============================================
// OLD:
{/* <div className="flex-1 flex flex-col lg:flex-row pt-14 sm:pt-16"> */}

// NEW:
{/* <div className="edit-clip-container flex-1 flex flex-col lg:flex-row pt-14 sm:pt-16"> */}


// ============================================
// PATCH 13: PAGE WRAPPER - Add className (around line 1239)
// ============================================
// OLD:
{/* <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col"> */}

// NEW:
{/* <div className="edit-clip-page min-h-screen bg-[#0a0a0a] text-white flex flex-col"> */}


// ============================================
// PATCH 14: DETAILS/SUMMARY - Improve touch targets
// ============================================
// For all <details> elements, update the <summary>:
// OLD:
{/* <summary className="flex items-center justify-between cursor-pointer list-none p-4 pb-2 select-none"> */}

// NEW:
{/* <summary className="flex items-center justify-between cursor-pointer list-none p-4 pb-2 select-none min-h-[48px] touch-manipulation"> */}


// ============================================
// PATCH 15: PRESET BUTTONS - Update grid (around line 1452)
// ============================================
// OLD:
{/* <div className="grid grid-cols-2 gap-2"> */}

// NEW:
{/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"> */}
