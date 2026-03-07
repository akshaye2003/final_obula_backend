import { useState, useRef, useEffect } from 'react';
import { getOutputVideoURL } from '../api/upload.js';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function VideoPreview({ outputVideoUrl, thumbnailUrl, processingTime, overlaysAdded, showDownloadButton = true, showWatermark = false }) {
  const src = outputVideoUrl ? getOutputVideoURL(outputVideoUrl) : null;
  const poster = thumbnailUrl ? getOutputVideoURL(thumbnailUrl) : null;
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleFullscreen = () => {
    if (containerRef.current) {
      containerRef.current.requestFullscreen?.();
    }
  };

  const handleDownload = async () => {
    if (!src) return;
    setDownloading(true);
    setSaveError(null);
    try {
      const res = await fetch(src);
      const blob = await res.blob();

      // Save to Supabase Storage + videos table (skip if file > 200 MB)
      const MAX_CLOUD_BYTES = 200 * 1024 * 1024;
      if (user && blob.size <= MAX_CLOUD_BYTES) {
        const storagePath = `${user.id}/${Date.now()}.mp4`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('videos')
          .upload(storagePath, blob, { contentType: 'video/mp4', upsert: false });

        if (uploadErr) {
          setSaveError(`Cloud save failed: ${uploadErr.message}`);
        } else {
          await supabase.from('videos').insert({
            user_id: user.id,
            title: 'Obula Clip',
            storage_path: uploadData.path,
            file_size: blob.size,
          });
          setSaved(true);
        }
      }

      // Trigger browser download regardless
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'obula_clip.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5 w-full max-w-md">
      <div 
        ref={containerRef}
        className="aspect-[9/16] w-full mx-auto bg-black border border-white/10 overflow-hidden rounded-xl shadow-2xl relative group"
      >
        {src ? (
          <>
            <video
              ref={videoRef}
              src={src}
              playsInline
              preload="metadata"
              poster={poster}
              onLoadedData={() => setVideoLoaded(true)}
              onCanPlay={() => setVideoLoaded(true)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.target.duration || 0)}
              onError={(e) => {
                console.error('[VideoPreview] Video error:', e);
                setVideoError(true);
              }}
              className="w-full h-full object-contain cursor-pointer"
              onClick={() => videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause()}
            />
            {/* Custom Controls Bar - BIG TIMELINE */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* BIG Timeline Slider */}
              <div className="flex items-center gap-3 mb-3">
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
                  className="w-full h-3 cursor-pointer rounded-full appearance-none bg-white/20 hover:bg-white/30 transition-colors"
                  style={{
                    background: `linear-gradient(to right, #C9A84C 0%, #C9A84C ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) ${(currentTime / (duration || 1)) * 100}%)`
                  }}
                />
              </div>
              {/* Controls Row */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => isPlaying ? videoRef.current?.pause() : videoRef.current?.play()}
                  className="text-white/90 hover:text-white transition-colors"
                >
                  <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    {isPlaying ? (
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    ) : (
                      <path d="M8 5v14l11-7z" />
                    )}
                  </svg>
                </button>
                {/* Time Display */}
                <span className="text-sm text-white/90 tabular-nums font-medium">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <div className="flex-1"></div>
                <button 
                  onClick={handleFullscreen}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              </div>
            </div>
            {/* Watermark Overlay - centered top */}
            {showWatermark && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none select-none z-20">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 shadow-lg">
                  <svg className="w-4 h-4 text-[#C9A84C]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                  <span className="text-white/90 text-sm font-bold tracking-widest uppercase">Obula</span>
                </div>
              </div>
            )}
            {/* Loading overlay */}
            {!videoLoaded && !videoError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                <div className="w-10 h-10 border-3 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin mb-3" />
                <p className="text-white/60 text-sm">Loading preview...</p>
              </div>
            )}
            {/* Error overlay */}
            {videoError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90">
                <svg className="w-12 h-12 text-white/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-white/60 text-sm mb-2">Cannot play preview</p>
                <p className="text-white/40 text-xs">Try downloading the video</p>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">No preview available</span>
          </div>
        )}
      </div>
      {(processingTime != null || overlaysAdded != null) && (
        <div className="flex gap-4 justify-center text-sm text-white/50 flex-wrap">
          {processingTime != null && <span>Processed in {processingTime.toFixed(1)}s</span>}
          {overlaysAdded != null && (
            <span>• {overlaysAdded.replace(/,/g, ', ').replace(/^captions/, 'Captions').replace(/broll/, 'B-roll')}</span>
          )}
        </div>
      )}
      {showDownloadButton && src && (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white font-bold hover:bg-primary-dark rounded-xl transition-colors text-base shadow-lg shadow-primary/25 disabled:opacity-70"
          >
            {downloading ? 'Saving & downloading…' : '↓ Download processed video'}
          </button>
          {saved && (
            <p className="text-green-400 text-sm">Saved to your account · <a href="/my-videos" className="underline hover:text-green-300">View My Videos</a></p>
          )}
          {saveError && (
            <p className="text-yellow-400 text-sm">{saveError}</p>
          )}
        </div>
      )}
      {!showDownloadButton && saved && (
        <p className="text-green-400 text-sm text-center">Saved to your account · <a href="/my-videos" className="underline hover:text-green-300">View My Videos</a></p>
      )}
      {!showDownloadButton && saveError && (
        <p className="text-yellow-400 text-sm text-center">{saveError}</p>
      )}
    </div>
  );
}
