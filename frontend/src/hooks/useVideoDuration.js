import { useState, useEffect, useRef } from 'react';

/**
 * Get the duration in seconds of a video from its URL (blob or http).
 * Returns { duration: number, error } when loaded.
 */
export function useVideoDuration(videoUrl) {
  const [duration, setDuration] = useState(null);
  const [error, setError] = useState(null);
  const prevUrlRef = useRef(null);

  useEffect(() => {
    if (!videoUrl) {
      setDuration(null);
      setError(null);
      prevUrlRef.current = null;
      return;
    }
    if (prevUrlRef.current === videoUrl) return;
    prevUrlRef.current = videoUrl;

    setDuration(null);
    setError(null);

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
      } else {
        setError('Could not read video duration');
      }
      video.src = '';
      video.load();
    };

    video.onerror = () => {
      setError('Could not load video');
      video.src = '';
      video.load();
    };

    video.src = videoUrl;
    video.load();

    return () => {
      video.src = '';
      video.load();
    };
  }, [videoUrl]);

  return { duration, error };
}
