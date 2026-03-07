import { useState, useEffect, useRef } from 'react';

/**
 * Extract a frame from a video URL for use as preview background.
 * Returns a data URL (JPEG) of the frame at the given time, or null while loading.
 */
export function useVideoFrame(videoUrl, timeSeconds = 2) {
  const [frameUrl, setFrameUrl] = useState(null);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoUrl) {
      setFrameUrl(null);
      setError(null);
      return;
    }

    setFrameUrl(null);
    setError(null);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    videoRef.current = video;

    const cleanup = () => {
      video.src = '';
      video.load();
    };

    video.onerror = () => {
      setError('Could not load video for preview');
      cleanup();
    };

    const doSeek = () => {
      const t = Math.min(timeSeconds, (video.duration || 60) * 0.15);
      video.currentTime = Math.max(0.1, t);
    };

    video.onloadeddata = doSeek;
    video.onloadedmetadata = doSeek;

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setFrameUrl(dataUrl);
      } catch (e) {
        setError(e?.message || 'Failed to capture frame');
      }
      cleanup();
    };

    video.src = videoUrl;
    video.load();

    return cleanup;
  }, [videoUrl, timeSeconds]);

  return { frameUrl, error };
}
