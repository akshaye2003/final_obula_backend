import { useState, useCallback, useRef } from 'react';

const ACCEPT = '.mp4,.mov,.avi,.webm';
const DEFAULT_MAX_SIZE_MB = 500;

export default function PremiumUploadZone({ onUploadSuccess, disabled, maxUploadMb = DEFAULT_MAX_SIZE_MB }) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const maxMb = maxUploadMb > 0 ? maxUploadMb : DEFAULT_MAX_SIZE_MB;

  const validateFile = useCallback((file) => {
    setError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
      setError('Invalid format. Use MP4, MOV, AVI, or WebM.');
      return false;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setError(`File too large. Max ${maxMb} MB.`);
      return false;
    }
    return true;
  }, [maxMb]);

  const handleFile = useCallback(
    (file) => {
      if (!file || !validateFile(file)) return;
      onUploadSuccess?.(file);
    },
    [validateFile, onUploadSuccess]
  );

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!disabled) setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleChange = (e) => {
    const file = e.target?.files?.[0];
    handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) inputRef.current?.click(); } }}
        aria-label="Upload video: drop file here or click to browse"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative rounded-2xl border-2 border-dashed p-12 sm:p-16 text-center transition-all duration-300 ${
          dragActive
            ? 'border-primary/60 bg-primary/5'
            : 'border-white/[0.15] hover:border-white/30 hover:bg-white/[0.02]'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-hidden
        />
        <div className="flex flex-col items-center gap-4 pointer-events-none">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
            <svg className="w-7 h-7 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Drop your video here</p>
            <p className="text-white/50 text-sm mt-1">or <span className="text-white/80 font-medium">browse</span> to select</p>
          </div>
          <p className="text-white/40 text-xs">MP4, MOV, AVI, WebM • Max 1080p, {maxMb} MB</p>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
