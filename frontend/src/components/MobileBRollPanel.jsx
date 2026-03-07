import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const GOLD = '#C9A84C';

// ---------------------------------------------------------------------------
// BrollThumbnail - shows B-roll clip thumbnail from API
// ---------------------------------------------------------------------------
function BrollThumbnail({ clipId, thumbnailUrl, className, alt }) {
  const [hasError, setHasError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Use provided thumbnail URL or fall back to placeholder
  const imageUrl = thumbnailUrl || `https://picsum.photos/seed/${clipId}/400/225`;

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

  return (
    <div className={`relative bg-white/5 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="w-4 h-4 border-2 border-white/20 border-t-[#C9A84C] rounded-full animate-spin" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mobile B-Roll Panel Component
// ---------------------------------------------------------------------------
export default function MobileBRollPanel({
  prepJobId,
  initialPlacements = [],
  onPlacementUpdate,
  onGenerateBroll,
  onRegeneratePlacement,
  loadingBroll = false,
}) {
  const [enableBroll, setEnableBroll] = useState(true);
  const [placements, setPlacements] = useState(initialPlacements.length > 0 ? initialPlacements : [
    {
      timestamp_seconds: 10.0,
      theme: 'unboxing',
      reason: 'Opening a package to reveal the product',
      enabled: true,
      selected_index: 0,
      clip_options: [
        { clip_id: 'clip1a', description: 'Hands opening white box' },
        { clip_id: 'clip1b', description: 'Product reveal shot' },
        { clip_id: 'clip1c', description: 'Unboxing from above' },
      ]
    },
    {
      timestamp_seconds: 20.0,
      theme: 'realization',
      reason: 'Moment of understanding or discovery',
      enabled: true,
      selected_index: 0,
      clip_options: [
        { clip_id: 'clip2a', description: 'Lightbulb moment' },
        { clip_id: 'clip2b', description: 'Person thinking' },
        { clip_id: 'clip2c', description: 'Eureka expression' },
      ]
    },
    {
      timestamp_seconds: 35.5,
      theme: 'celebration',
      reason: 'Success and achievement moment',
      enabled: true,
      selected_index: 1,
      clip_options: [
        { clip_id: 'clip3a', description: 'Confetti falling' },
        { clip_id: 'clip3b', description: 'Champagne toast' },
        { clip_id: 'clip3c', description: 'Team celebrating' },
      ]
    },
  ]);
  const [regeneratingIndex, setRegeneratingIndex] = useState(null);
  const [previewClip, setPreviewClip] = useState(null);

  // Handlers
  const handleEnableBroll = useCallback((enabled) => {
    setEnableBroll(enabled);
  }, []);

  const handleTogglePlacement = useCallback((pIdx) => {
    setPlacements(prev => {
      const updated = prev.map((p, i) => i === pIdx ? { ...p, enabled: !p.enabled } : p);
      onPlacementUpdate?.(updated);
      return updated;
    });
  }, [onPlacementUpdate]);

  const handleSelectClip = useCallback((pIdx, cIdx) => {
    setPlacements(prev => {
      const updated = prev.map((p, i) => i === pIdx ? { ...p, selected_index: cIdx } : p);
      onPlacementUpdate?.(updated);
      return updated;
    });
  }, [onPlacementUpdate]);

  const handleRegenerate = useCallback(async (pIdx) => {
    if (regeneratingIndex !== null) return;
    setRegeneratingIndex(pIdx);
    
    // Simulate API call
    await new Promise(r => setTimeout(r, 1500));
    
    setPlacements(prev => {
      const updated = prev.map((p, i) => {
        if (i !== pIdx) return p;
        // Generate new random clips
        const newClips = p.clip_options.map((c, idx) => ({
          ...c,
          clip_id: `${c.clip_id.split('_')[0]}_${Date.now()}_${idx}`,
        }));
        return { ...p, clip_options: newClips, selected_index: 0 };
      });
      onPlacementUpdate?.(updated);
      return updated;
    });
    
    setRegeneratingIndex(null);
  }, [regeneratingIndex, onPlacementUpdate]);

  const handleRegenerateAll = useCallback(async () => {
    if (loadingBroll) return;
    onGenerateBroll?.();
  }, [loadingBroll, onGenerateBroll]);

  return (
    <div className="min-h-0 flex flex-col">
      {/* Enable B-Roll Toggle */}
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-4">
        <Toggle 
          label="Enable B-Roll" 
          description="AI inserts matching cinematic clips with crossfades" 
          value={enableBroll} 
          onChange={handleEnableBroll} 
        />
      </section>

      {/* Placements Section */}
      {enableBroll && placements.length > 0 && (
        <section className="space-y-3 flex-1 overflow-y-auto pb-20">
          {/* Header */}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Placements</h2>
            <button
              onClick={handleRegenerateAll}
              disabled={loadingBroll}
              className="text-[11px] text-[#C9A84C]/70 hover:text-[#C9A84C] transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {loadingBroll ? (
                <><span className="w-3 h-3 border border-[#C9A84C]/50 border-t-transparent rounded-full animate-spin" /> Refreshing…</>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate All
                </>
              )}
            </button>
          </div>

          {/* Placement Cards */}
          {placements.map((placement, pIdx) => (
            <div
              key={pIdx}
              className={`rounded-xl border p-3.5 transition-all ${
                placement.enabled
                  ? 'border-white/10 bg-white/[0.02]'
                  : 'border-white/[0.04] bg-white/[0.01] opacity-50'
              }`}
            >
              {/* Header Row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] font-mono text-[#C9A84C] bg-[#C9A84C]/10 px-1.5 py-0.5 rounded shrink-0">
                    {placement.timestamp_seconds.toFixed(1)}s
                  </span>
                  <span className="text-sm text-white/80 font-medium truncate capitalize">
                    {placement.theme}
                  </span>
                </div>
                <button
                  onClick={() => handleTogglePlacement(pIdx)}
                  className={`shrink-0 ml-2 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                    placement.enabled
                      ? 'border-white/15 text-white/50 hover:text-red-400 hover:border-red-400/30'
                      : 'border-[#C9A84C]/30 text-[#C9A84C]/70 hover:text-[#C9A84C]'
                  }`}
                >
                  {placement.enabled ? 'Remove' : 'Restore'}
                </button>
              </div>

              {/* Clip Thumbnails - Horizontal Scroll */}
              {placement.enabled && placement.clip_options?.length > 0 && (
                <div className="space-y-3">
                  {/* Thumbnails Row */}
                  <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
                    {placement.clip_options.slice(0, 3).map((clip, cIdx) => (
                      <div
                        key={clip.clip_id}
                        className={`relative rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                          placement.selected_index === cIdx
                            ? 'border-[#C9A84C] ring-1 ring-[#C9A84C]/30'
                            : 'border-transparent'
                        }`}
                        style={{ width: '120px', height: '68px' }}
                      >
                        {/* Thumbnail */}
                        <button
                          onClick={() => handleSelectClip(pIdx, cIdx)}
                          className="w-full h-full"
                        >
                          <BrollThumbnail
                            clipId={clip.clip_id}
                            thumbnailUrl={clip.thumbnail_url}
                            alt={clip.description || `Clip ${cIdx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                        
                        {/* Play Preview Overlay */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewClip({ 
                              url: clip.video_url || `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4`,
                              description: clip.description 
                            });
                          }}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                        >
                          <div className="w-7 h-7 rounded-full bg-[#C9A84C] flex items-center justify-center shadow-lg">
                            <svg className="w-3.5 h-3.5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </button>
                        
                        {/* Selected Checkmark */}
                        {placement.selected_index === cIdx && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#C9A84C] flex items-center justify-center shadow-lg pointer-events-none">
                            <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Regenerate Button */}
                  <button
                    onClick={() => handleRegenerate(pIdx)}
                    disabled={regeneratingIndex !== null}
                    className="w-full py-2.5 rounded-lg border border-white/10 text-white/50 text-xs hover:text-[#C9A84C] hover:border-[#C9A84C]/30 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {regeneratingIndex === pIdx ? (
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

      {/* Empty State */}
      {enableBroll && placements.length === 0 && (
        <div className="text-center py-12">
          {loadingBroll ? (
            <>
              <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/50 text-sm">Finding the best B-Roll moments…</p>
              <p className="text-xs text-white/25 mt-1">This takes a few seconds</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white/40 text-sm mb-4">No B-Roll suggestions available.</p>
              <button
                onClick={handleRegenerateAll}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{ background: GOLD, color: '#000' }}
              >
                Generate B-Roll Suggestions
              </button>
            </>
          )}
        </div>
      )}

      {/* Disabled State */}
      {!enableBroll && (
        <div className="text-center py-12 text-white/30 text-sm">
          <div className="w-12 h-12 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          Enable B-Roll to see placement options.
        </div>
      )}

      {/* Video Preview Modal */}
      {previewClip && createPortal(
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewClip(null)}
        >
          <div 
            className="relative w-full max-w-sm bg-[#1a1a1a] rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
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
    </div>
  );
}
