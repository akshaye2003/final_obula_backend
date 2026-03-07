import { useState, useCallback, useRef } from 'react';

const ACCEPT = '.mp4,.mov,.avi,.webm';
const DEFAULT_MAX_SIZE_MB = 500;

export default function UploadZone({ onUploadSuccess, disabled, maxUploadMb = DEFAULT_MAX_SIZE_MB }) {
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
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!disabled) inputRef.current?.click(); } }}
        aria-label="Upload video: drop file here or click to browse"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 ${
          dragActive
            ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/15'
            : 'border-primary/50 hover:border-primary hover:bg-primary/5 hover:scale-[1.01]'
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
        <div className="text-zinc-600 dark:text-zinc-300 pointer-events-none">
          <span className="text-primary font-bold">Drop video here</span>
          <span className="text-zinc-500 dark:text-white/60"> or </span>
          <span className="text-primary underline font-medium">browse</span>
        </div>
        <p className="text-sm text-zinc-500 mt-2 pointer-events-none">MP4, MOV, AVI, WebM • Max 1080p, {maxMb} MB</p>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}
