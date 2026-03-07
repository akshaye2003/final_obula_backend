import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadVideo } from '../api/upload.js';
import { startBackgroundPrep, pollPrepUntilReady } from '../api/prep.js';

const GOLD = '#C9A84C';

export default function SeamlessUpload({ maxUploadMb = 500 }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [status, setStatus] = useState('idle'); // idle, uploading, processing
  const [fileName, setFileName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processStatus, setProcessStatus] = useState('');
  const [processProgress, setProcessProgress] = useState(0);
  const [error, setError] = useState(null);
  
  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  const reset = useCallback(() => {
    setStatus('idle');
    setFileName('');
    setUploadProgress(0);
    setProcessStatus('');
    setProcessProgress(0);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate
    if (file.size > maxUploadMb * 1024 * 1024) {
      setError(`File too large. Max ${maxUploadMb}MB allowed.`);
      return;
    }
    
    setError(null);
    setFileName(file.name);
    setStatus('uploading');
    setUploadProgress(0);
    
    try {
      // Upload with real progress
      const uploadRes = await uploadVideo(file, (progress) => {
        if (isMountedRef.current) {
          setUploadProgress(progress);
        }
      });
      
      const videoId = uploadRes.video_id;
      
      // Immediately start background prep
      setStatus('processing');
      setProcessStatus('Starting AI processing...');
      setProcessProgress(5);
      
      const { prep_id } = await startBackgroundPrep(videoId);
      
      // Poll until ready
      await pollPrepUntilReady(
        prep_id,
        (status) => {
          if (!isMountedRef.current) return;
          
          setProcessProgress(status.progress || 0);
          
          // Map status to user-friendly message
          const statusMessages = {
            starting: 'Initializing...',
            transcribing: 'Transcribing audio with Whisper...',
            planning_broll: 'AI planning B-roll scenes...',
            saving: 'Finalizing...',
            completed: 'Ready!',
            failed: 'Failed',
          };
          setProcessStatus(statusMessages[status.status] || 'Processing...');
        }
      );
      
      // Navigate to editor when ready
      if (isMountedRef.current) {
        navigate(`/edit/${prep_id}`);
      }
      
    } catch (err) {
      if (!isMountedRef.current) return;
      
      const status = err?.response?.status;
      if (status === 402) {
        navigate('/pricing', { state: { noCredits: true } });
        return;
      }
      
      let msg = err?.message || 'Upload failed. Please try again.';
      if (err?.message === 'Network Error') msg = "Couldn't reach the server.";
      
      setError(msg);
      setStatus('idle');
    }
  };

  const handleCancel = () => {
    // Note: Can't truly cancel the upload/processing, but we can reset UI
    reset();
  };

  // Render different states
  if (status === 'idle') {
    return (
      <div className="w-full">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full px-8 py-4 rounded-xl font-bold text-base bg-[#C9A84C] text-black hover:opacity-90 transition-all duration-200 shadow-lg shadow-[#C9A84C]/25 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          Upload Video
        </button>
        <p className="text-center text-white/40 text-sm mt-3">
          Drop a video or click to browse • Max 1080p, {maxUploadMb}MB
        </p>
        {error && (
          <p className="text-center text-red-400 text-sm mt-2">{error}</p>
        )}
      </div>
    );
  }

  if (status === 'uploading') {
    return (
      <div className="w-full rounded-2xl border border-white/10 bg-[#1a1a1a] p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#C9A84C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-white font-medium text-sm truncate max-w-[200px]">{fileName}</p>
              <p className="text-white/50 text-xs">Uploading...</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 text-white/40 hover:text-white/70 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#C9A84C] rounded-full transition-all duration-200"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
        <p className="text-right text-white/40 text-xs mt-2">{uploadProgress}%</p>
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="w-full rounded-2xl border border-[#C9A84C]/30 bg-[#1a1a1a] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/20 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-left">
            <p className="text-white font-medium text-sm truncate max-w-[200px]">{fileName}</p>
            <p className="text-[#C9A84C] text-xs">{processStatus}</p>
          </div>
        </div>
        
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-[#C9A84C] to-[#E5D5A5] rounded-full transition-all duration-500"
            style={{ width: `${processProgress}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between mt-3">
          <p className="text-white/40 text-xs">
            AI is transcribing & planning B-roll...
          </p>
          <p className="text-[#C9A84C] text-xs font-medium">{processProgress}%</p>
        </div>
        
        <div className="mt-4 flex flex-wrap gap-2">
          <ProcessingBadge text="Transcription" active={processProgress >= 10} />
          <ProcessingBadge text="Masks" active={processProgress >= 30} />
          <ProcessingBadge text="GPT Analysis" active={processProgress >= 50} />
          <ProcessingBadge text="B-Roll" active={processProgress >= 70} />
        </div>
      </div>
    );
  }

  return null;
}

function ProcessingBadge({ text, active }) {
  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
      active 
        ? 'bg-[#C9A84C]/20 text-[#C9A84C]' 
        : 'bg-white/5 text-white/30'
    }`}>
      {active && <span className="inline-block w-1.5 h-1.5 bg-[#C9A84C] rounded-full mr-1.5" />}
      {text}
    </span>
  );
}
