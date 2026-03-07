// ============================================
// MOBILE VIDEO PLAYER FIXES FOR EditClip.jsx
// Apply these patches to fix the double controls & optimize for mobile
// ============================================


// ============================================
// PATCH 1: REMOVE NATIVE VIDEO CONTROLS (Line ~2320)
// ============================================
// PROBLEM: Native controls overlap with custom UI

// OLD CODE:
{/* <video
  ref={videoRef}
  src={videoUrl}
  className="w-full h-full object-contain"
  onTimeUpdate={handleTimeUpdate}
  onLoadedMetadata={() => { ... }}
  onPlay={() => setIsPlaying(true)}
  onPause={() => setIsPlaying(false)}
  onError={(e) => console.error('Video error:', e)}
  playsInline
  muted={muted}
  preload="auto"
  crossOrigin="anonymous"
  controls  // <-- REMOVE THIS LINE
/> */}

// NEW CODE:
{/* <video
  ref={videoRef}
  src={videoUrl}
  className="w-full h-full object-contain"
  onTimeUpdate={handleTimeUpdate}
  onLoadedMetadata={() => { ... }}
  onPlay={() => setIsPlaying(true)}
  onPause={() => setIsPlaying(false)}
  onError={(e) => console.error('Video error:', e)}
  playsInline
  muted={muted}
  preload="auto"
  crossOrigin="anonymous"
/> */}


// ============================================
// PATCH 2: VIDEO CONTAINER - Mobile-optimized sizing (Line ~2285-2294)
// ============================================
// Better sizing for mobile portrait videos

// OLD CODE:
{/* <div
  ref={videoContainerRef}
  className="relative w-full mx-auto rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/[0.06]"
  style={{
    aspectRatio: videoAspect,
    maxWidth: 'min(95vw, 520px)',
    maxHeight: 'min(80vh, 720px)',
    transform: previewRotation ? `rotate(${previewRotation}deg)` : undefined,
  }}
> */}

// NEW CODE:
{/* <div
  ref={videoContainerRef}
  className="video-preview-container relative w-full mx-auto rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/[0.06]"
  style={{
    aspectRatio: videoAspect,
    maxWidth: 'min(100vw, 520px)',  // Changed from 95vw to 100vw for mobile
    maxHeight: 'min(70vh, 720px)',  // Reduced from 80vh for better mobile fit
    width: '100%',
    transform: previewRotation ? `rotate(${previewRotation}deg)` : undefined,
  }}
> */}


// ============================================
// PATCH 3: MOBILE PLAY BUTTON - Larger touch target (Line ~2348-2357)
// ============================================

// OLD CODE:
{/* {!isPlaying && (
  <button
    onClick={togglePlay}
    className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40 active:bg-black/40 touch-manipulation"
  >
    <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
      <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
    </div>
  </button>
)} */}

// NEW CODE:
{/* {!isPlaying && (
  <button
    onClick={togglePlay}
    className="absolute inset-0 flex items-center justify-center bg-black/40 transition-all hover:bg-black/50 active:bg-black/50 touch-manipulation"
    aria-label="Play video"
  >
    <div className="w-20 h-20 sm:w-16 sm:h-16 rounded-full bg-white/25 backdrop-blur-md flex items-center justify-center shadow-lg transform transition-transform active:scale-95">
      <svg className="w-10 h-10 sm:w-8 sm:h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
    </div>
  </button>
)} */}


// ============================================
// PATCH 4: MOBILE-OPTIMIZED CONTROL BAR (Line ~2366-2427)
// ============================================

// OLD CODE:
{/* <div className="mt-4 w-full max-w-md">
  <div className="flex items-center gap-2 sm:gap-3 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
    <button onClick={togglePlay} className="p-1.5 text-white/70 hover:text-white transition-colors touch-manipulation" title={isPlaying ? 'Pause' : 'Play'}>
      {isPlaying ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
      ) : (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      )}
    </button>
    <button onClick={toggleMute} className="p-1.5 text-white/70 hover:text-white transition-colors touch-manipulation" title={muted ? 'Unmute' : 'Mute'}>
      {muted ? (...) : (...)} 
    </button>
    {!muted && (
      <input type="range" ... className="w-16 sm:w-20 accent-[#C9A84C] h-1" />
    )}
    <span className="text-xs text-white/50 tabular-nums shrink-0">{formatTime(currentTime)}</span>
    <input type="range" ... className="flex-1 accent-[#C9A84C] h-1 min-w-0" />
    <span className="text-xs text-white/50 tabular-nums shrink-0 text-right">{formatTime(duration)}</span>
    <div className="flex items-center gap-0.5">
      <select ... className="text-xs bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white/90 ...">
        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
          <option key={r} value={r} className="bg-[#1a1a1a]">{r}x</option>
        ))}
      </select>
      <button onClick={cycleRotation} className="p-1.5 text-white/70 hover:text-white transition-colors touch-manipulation" title="Rotate preview">
        <svg className="w-5 h-5" ... />
      </button>
      <button onClick={toggleFullscreen} className="p-1.5 text-white/70 hover:text-white transition-colors touch-manipulation" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
        {isFullscreen ? (...) : (...)} 
      </button>
    </div>
  </div>
</div> */}

// NEW CODE:
{/* <div className="video-controls-container mt-4 w-full max-w-md px-4 sm:px-0">
  <div className="video-controls flex items-center gap-3 sm:gap-3 p-3 sm:p-2 rounded-xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-sm">
    
    {/* Play/Pause - Larger touch target */}
    <button 
      onClick={togglePlay} 
      className="p-2 sm:p-1.5 text-white/80 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 active:bg-white/15" 
      title={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? (
        <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
      ) : (
        <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
      )}
    </button>
    
    {/* Mute - Larger touch target */}
    <button 
      onClick={toggleMute} 
      className="p-2 sm:p-1.5 text-white/80 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 active:bg-white/15" 
      title={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? (
        <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" /></svg>
      ) : (
        <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
      )}
    </button>
    
    {/* Volume slider - Hidden on very small screens, shown on tap */}
    {!muted && (
      <div className="hidden sm:block">
        <input 
          type="range" 
          min={0} 
          max={1} 
          step={0.05} 
          value={volume} 
          onChange={(e) => setVolumeAndSync(parseFloat(e.target.value))} 
          className="w-16 sm:w-20 accent-[#C9A84C] h-1.5 sm:h-1 cursor-pointer" 
          title="Volume"
        />
      </div>
    )}
    
    {/* Time display */}
    <span className="text-xs text-white/60 tabular-nums shrink-0 font-medium">{formatTime(currentTime)}</span>
    
    {/* Progress bar - Taller for easier seeking on mobile */}
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
      className="flex-1 accent-[#C9A84C] h-2 sm:h-1 min-w-0 cursor-pointer rounded-full"
      style={{
        background: `linear-gradient(to right, #C9A84C 0%, #C9A84C ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.15) ${(currentTime / (duration || 1)) * 100}%)`
      }}
    />
    
    {/* Duration */}
    <span className="text-xs text-white/60 tabular-nums shrink-0 text-right font-medium">{formatTime(duration)}</span>
    
    {/* Right side controls - Speed, Rotate, Fullscreen */}
    <div className="flex items-center gap-1">
      {/* Speed selector - Larger touch target */}
      <select 
        value={playbackRate} 
        onChange={(e) => setPlaybackRate(parseFloat(e.target.value))} 
        className="text-xs sm:text-xs bg-white/10 border border-white/20 rounded-lg px-2 py-2 sm:py-1 text-white/90 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]/50 min-h-[40px] sm:min-h-[32px] cursor-pointer hover:bg-white/15 transition-colors"
        title="Playback speed"
      >
        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
          <option key={r} value={r} className="bg-[#1a1a1a]">{r}x</option>
        ))}
      </select>
      
      {/* Rotate - Larger touch target */}
      <button 
        onClick={cycleRotation} 
        className="p-2 sm:p-1.5 text-white/80 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 active:bg-white/15" 
        title="Rotate preview"
      >
        <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>
      
      {/* Fullscreen - Larger touch target */}
      <button 
        onClick={toggleFullscreen} 
        className="p-2 sm:p-1.5 text-white/80 hover:text-white transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-95 active:bg-white/15" 
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? (
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="w-6 h-6 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        )}
      </button>
    </div>
  </div>
</div> */}


// ============================================
// PATCH 5: ADD MOBILE CSS STYLES
// ============================================
// Add these to your CSS or the mobile-improvements.css file

const mobileVideoStyles = `
/* Mobile Video Player Optimizations */

/* Video container - Full width on mobile */
@media (max-width: 640px) {
  .video-preview-container {
    max-width: 100vw !important;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }
  
  /* Larger video on mobile */
  .video-preview-container video {
    object-fit: cover;
  }
}

/* Video controls - Better mobile styling */
.video-controls-container {
  width: 100%;
}

.video-controls {
  /* Prevent controls from being too small */
  min-height: 56px;
}

@media (max-width: 640px) {
  .video-controls {
    padding: 12px;
    gap: 8px;
    min-height: 64px;
  }
  
  /* Progress bar - easier to grab on mobile */
  .video-controls input[type="range"] {
    min-height: 24px;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
  }
  
  .video-controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #C9A84C;
    cursor: pointer;
    margin-top: -6px;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  }
  
  .video-controls input[type="range"]::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
  }
  
  /* Larger buttons */
  .video-controls button {
    min-height: 44px;
    min-width: 44px;
  }
  
  /* Larger select dropdown */
  .video-controls select {
    min-height: 44px;
    padding: 8px 12px;
    font-size: 14px;
  }
}

/* Play button overlay - Centered and prominent */
.video-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  transition: background 0.2s ease;
}

.video-play-overlay:hover {
  background: rgba(0, 0, 0, 0.5);
}

.video-play-button {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s ease, background 0.2s ease;
}

.video-play-button:active {
  transform: scale(0.95);
  background: rgba(255, 255, 255, 0.35);
}

@media (max-width: 640px) {
  .video-play-button {
    width: 72px;
    height: 72px;
  }
  
  .video-play-button svg {
    width: 32px;
    height: 32px;
  }
}

/* Hide native video controls completely */
video::-webkit-media-controls {
  display: none !important;
}

video::-webkit-media-controls-enclosure {
  display: none !important;
}

video::-webkit-media-controls-panel {
  display: none !important;
}

/* Caption positioning for mobile */
@media (max-width: 640px) {
  /* Ensure captions don't overlap with controls */
  .caption-overlay {
    padding-bottom: 80px;
  }
}

/* Safe area for notched phones */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .video-controls-container {
    padding-bottom: env(safe-area-inset-bottom);
  }
}
`;


// ============================================
// PATCH 6: OPTIONAL - Add tap to toggle play/pause on video
// ============================================
// Add this wrapper around the video element to enable tap-to-play

// Replace the video fragment with:
{/* <div 
  className="relative w-full h-full"
  onClick={(e) => {
    // Only toggle if clicking directly on the video area, not on overlays
    if (e.target === e.currentTarget || e.target.tagName === 'VIDEO') {
      togglePlay();
    }
  }}
>
  <video
    ref={videoRef}
    src={videoUrl}
    className="w-full h-full object-contain"
    onTimeUpdate={handleTimeUpdate}
    onLoadedMetadata={() => { ... }}
    onPlay={() => setIsPlaying(true)}
    onPause={() => setIsPlaying(false)}
    onError={(e) => console.error('Video error:', e)}
    playsInline
    muted={muted}
    preload="auto"
    crossOrigin="anonymous"
  />
</div> */}


// ============================================
// QUICK FIX SUMMARY
// ============================================
/*
MOST IMPORTANT CHANGES:

1. REMOVE 'controls' from <video> element (Line ~2320)
   → This fixes the double controls issue

2. Update video container sizing (Line ~2286)
   → maxWidth: 'min(100vw, 520px)' instead of 95vw
   → maxHeight: 'min(70vh, 720px)' for better mobile fit

3. Make play button larger (Line ~2349)
   → w-20 h-20 on mobile, w-16 h-16 on desktop
   → Add shadow and better backdrop blur

4. Redesign control bar (Line ~2367)
   → 44px minimum touch targets for all buttons
   → Taller progress bar (h-2) for easier seeking
   → Better visual feedback (hover states, active scale)
   → Hide volume slider on mobile (optional UX improvement)

5. Add CSS to hide native controls
   → video::-webkit-media-controls { display: none !important; }
*/
