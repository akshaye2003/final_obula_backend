import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import LandingNav from '../components/LandingNav.jsx';
import { uploadVideo, getConfig } from '../api/upload.js';
import { startBackgroundPrep, pollPrepUntilReady } from '../api/prep.js';
import { getCreditsStatus, lockCredits, releaseCredits } from '../api/credits';

const GOLD = '#C9A84C';

const FEATURE_CHIPS = [
  { id: 'cinematic', label: '✨ Cinematic Captions', icon: 'cc', active: true },
  { id: 'textbehind', label: '👤 Text Behind', icon: 'layers', active: true },
  { id: 'broll', label: '🎬 Auto B-Roll', icon: 'film', active: true, isNew: true },
  { id: 'noise', label: '🔇 Remove Silences', icon: 'scissors', active: false },
  { id: 'color', label: '🎨 Color Grade', icon: 'palette', active: false },
];

const EXAMPLE_PROMPTS = [
  { text: "Create a viral clip with cinematic captions and B-roll", thumbnail: null },
  { text: "Make a 15-second reel with text-behind effect", thumbnail: null },
  { text: "Add dramatic color grading and smooth transitions", thumbnail: null },
];

// Processing status chips
const PROCESSING_CHIPS = [
  { key: 'transcription', label: 'Audio Analysis', threshold: 10 },
  { key: 'masks', label: 'Scene Detection', threshold: 35 },
  { key: 'gpt', label: 'Content Understanding', threshold: 60 },
  { key: 'broll', label: 'Visual Enhancement', threshold: 85 },
];

export default function Upload() {
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const didProcessFileRef = useRef(false);

  const [maxUploadMb, setMaxUploadMb] = useState(500);
  const [promptText, setPromptText] = useState('');
  const [activeFeatures, setActiveFeatures] = useState(
    FEATURE_CHIPS.reduce((acc, chip) => ({ ...acc, [chip.id]: chip.active }), {})
  );
  const [showExamples, setShowExamples] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Upload & Processing states
  const [status, setStatus] = useState('idle'); // idle, checking_credits, locking, uploading, processing
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [uploadedSize, setUploadedSize] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processStatus, setProcessStatus] = useState('');
  const [processProgress, setProcessProgress] = useState(0);
  const [error, setError] = useState(null);
  
  // Credit lock states
  const [creditStatus, setCreditStatus] = useState(null);
  const [lockId, setLockId] = useState(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  // Load config
  useEffect(() => {
    getConfig().then((c) => setMaxUploadMb(c?.max_upload_mb ?? 500)).catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    try {
      if (!didProcessFileRef.current && location.state?.file instanceof File) {
        didProcessFileRef.current = true;
        const file = location.state.file;
        window.history.replaceState({}, '', location.pathname);
        handleFileSelected(file);
      }
    } catch {}
  }, [location.state?.file]);
  
  // Cleanup on unmount - release credits if not uploaded
  useEffect(() => {
    return () => {
      // Only release if we have a lock but upload was cancelled/failed
      const currentLockId = sessionStorage.getItem('pending_credit_lock_id');
      if (currentLockId && !sessionStorage.getItem('upload_completed')) {
        releaseCredits(currentLockId).catch(console.error);
        sessionStorage.removeItem('pending_credit_lock_id');
      }
    };
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = '';
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  /**
   * Step 1: File selected - check credits first
   */
  const handleFileSelected = async (file) => {
    if (file.size > maxUploadMb * 1024 * 1024) {
      setError(`File too large. Max ${maxUploadMb}MB allowed.`);
      return;
    }
    
    setPendingFile(file);
    setStatus('checking_credits');
    setError(null);
    
    try {
      // Check credits status
      const credits = await getCreditsStatus();
      setCreditStatus(credits);
      
      const available = credits.available_credits || credits.available || 0;
      const locked = credits.locked_credits || credits.locked || 0;
      const total = credits.total_credits || credits.total || 0;
      
      if (available < 100) {
        toast.error(
          <div>
            <p className="font-medium">Insufficient Credits</p>
            <p className="text-sm">You need 100 credits to process a video.</p>
            <p className="text-xs mt-1">Available: {available} | Locked: {locked}</p>
          </div>,
          { autoClose: 5000 }
        );
        navigate('/pricing', { state: { noCredits: true, needed: 100, available } });
        setStatus('idle');
        setPendingFile(null);
        return;
      }
      
      // Show credit confirmation modal
      setShowCreditModal(true);
      setStatus('idle');
      
    } catch (err) {
      console.error('Credit check failed:', err);
      toast.error('Unable to check credits. Please try again.');
      setStatus('idle');
      setPendingFile(null);
    }
  };

  /**
   * Step 2: User confirmed - lock credits and start upload
   */
  const handleConfirmUpload = async () => {
    if (!pendingFile) return;
    
    setShowCreditModal(false);
    setStatus('locking');
    
    try {
      // Generate unique upload ID
      const uploadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Lock credits (100 by default)
      const lockData = await lockCredits(uploadId, 100);
      setLockId(lockData.lock_id);
      
      // Store in sessionStorage for persistence across navigation
      sessionStorage.setItem('pending_credit_lock_id', lockData.lock_id);
      sessionStorage.setItem('current_upload_id', uploadId);
      sessionStorage.setItem('lock_expires_at', lockData.expires_at);
      sessionStorage.removeItem('upload_completed');
      
      toast.success(
        <div>
          <p className="font-medium">100 Credits Locked</p>
          <p className="text-xs text-white/70">Credits will unlock in 1 hour if abandoned</p>
        </div>,
        { autoClose: 4000 }
      );
      
      // Start actual upload
      await performUpload(pendingFile, lockData.lock_id, uploadId);
      
    } catch (err) {
      console.error('Failed to lock credits:', err);
      const errorMsg = err.response?.data?.detail || 'Unable to lock credits. Please try again.';
      toast.error(errorMsg);
      setStatus('idle');
      setPendingFile(null);
    }
  };

  /**
   * Step 3: Upload the video
   */
  const performUpload = async (file, lockId, uploadId) => {
    setStatus('uploading');
    setFileName(file.name);
    setFileSize(file.size);
    setUploadProgress(0);
    setUploadedSize(0);
    
    try {
      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return 85;
          }
          setUploadedSize((file.size * (prev + 5)) / 100);
          return prev + 5;
        });
      }, 200);
      
      // Upload with lock_id
      const uploadRes = await uploadVideo(file, (progress) => {
        clearInterval(progressInterval);
        setUploadProgress(progress);
        setUploadedSize((file.size * progress) / 100);
      });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadedSize(file.size);
      
      // Small delay to show 100%
      await new Promise(r => setTimeout(r, 300));
      
      // Mark upload as completed (credits stay locked)
      sessionStorage.setItem('upload_completed', 'true');
      
      // Start processing
      await startProcessing(uploadRes.video_id, lockId);
      
    } catch (err) {
      handleUploadError(err);
    }
  };

  /**
   * Step 4: Start AI processing
   */
  const startProcessing = async (videoId, lockId) => {
    setStatus('processing');
    setProcessStatus('Initializing AI processing...');
    setProcessProgress(5);
    
    try {
      // Start background prep
      const { prep_id } = await startBackgroundPrep(videoId);
      
      // Poll until ready
      await pollPrepUntilReady(
        prep_id,
        (statusUpdate) => {
          setProcessProgress(statusUpdate.progress || 0);
          
          const statusMessages = {
            starting: 'Initializing AI models...',
            transcribing: 'Analyzing speech patterns...',
            planning_broll: 'Curating visual elements...',
            saving: 'Optimizing output...',
            completed: 'Ready!',
            failed: 'Processing failed',
          };
          setProcessStatus(statusMessages[statusUpdate.status] || 'Processing...');
        }
      );
      
      // Pass lock_id to EditClip page via navigation state
      navigate(`/edit/${prep_id}`, { state: { lock_id: lockId } });
      
    } catch (err) {
      console.error('Processing failed:', err);
      
      // Don't release credits on processing failure - user can retry/edit
      // Credits remain locked for 1 hour
      
      toast.error(
        <div>
          <p className="font-medium">Processing Failed</p>
          <p className="text-xs text-white/70">Credits remain locked for 1 hour. You can retry.</p>
        </div>,
        { autoClose: 5000 }
      );
      
      setError('Processing failed. You can retry or contact support.');
      setStatus('idle');
    }
  };

  const handleUploadError = (err) => {
    const status = err?.response?.status;
    
    if (status === 402) {
      navigate('/pricing', { state: { noCredits: true } });
      return;
    }
    
    let msg = err?.response?.data?.detail || err?.message || 'Upload failed. Please try again.';
    if (err?.message === 'Network Error') msg = "Couldn't reach the server.";
    
    // Release credits on upload failure
    const currentLockId = sessionStorage.getItem('pending_credit_lock_id');
    if (currentLockId) {
      releaseCredits(currentLockId).catch(console.error);
      sessionStorage.removeItem('pending_credit_lock_id');
    }
    
    toast.error(msg);
    setError(msg);
    setStatus('idle');
    setPendingFile(null);
  };

  const handleCancel = () => {
    // If uploading/processing, release credits
    if ((status === 'uploading' || status === 'processing') && lockId) {
      releaseCredits(lockId).catch(console.error);
      sessionStorage.removeItem('pending_credit_lock_id');
      sessionStorage.removeItem('upload_completed');
    }
    
    setStatus('idle');
    setFileName('');
    setFileSize(0);
    setUploadedSize(0);
    setUploadProgress(0);
    setProcessStatus('');
    setProcessProgress(0);
    setError(null);
    setLockId(null);
    setPendingFile(null);
  };

  const toggleFeature = (featureId) => {
    setActiveFeatures(prev => ({ ...prev, [featureId]: !prev[featureId] }));
  };

  const applyExample = (example) => {
    setPromptText(example.text);
    setShowExamples(false);
  };

  const isProcessing = ['checking_credits', 'locking', 'uploading', 'processing'].includes(status);

  return (
    <div 
      className="min-h-screen bg-[#0a0a0a] text-white font-body antialiased relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-[#C9A84C]/10 via-transparent to-transparent opacity-50" />
      </div>

      <LandingNav />

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8 -mt-16">
        <div className="w-full max-w-2xl mx-auto">
          
          {/* Header */}
          <div className="text-center mb-10">
            <h1 
              className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mb-3 tracking-tight"
              style={{ fontFamily: 'Syne, DM Sans, system-ui' }}
            >
              What are we <span style={{ fontFamily: "'Ruthie', cursive", fontSize: '2em' }}>creating</span> today?
            </h1>
            <p className="text-white/40 text-sm sm:text-base">
              Upload a video and let AI create your viral clip
            </p>
          </div>

          {/* Main Input Card */}
          <div className="relative">
            <div 
              className={`
                relative bg-gradient-to-b from-[#161616] to-[#111111] border rounded-2xl transition-all duration-300
                ${isDragging 
                  ? 'border-[#C9A84C] shadow-xl shadow-[#C9A84C]/20 scale-[1.01]' 
                  : 'border-white/10 hover:border-white/15'
                }
              `}
            >
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

              {/* Drag overlay */}
              {isDragging && (
                <div className="absolute inset-0 bg-[#C9A84C]/10 rounded-2xl flex flex-col items-center justify-center z-20 backdrop-blur-sm">
                  <div className="w-16 h-16 rounded-full bg-[#C9A84C]/20 flex items-center justify-center mb-3">
                    <svg className="w-8 h-8 text-[#C9A84C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <p className="text-[#C9A84C] font-semibold text-lg">Drop video here</p>
                  <p className="text-[#C9A84C]/60 text-sm mt-1">Release to upload</p>
                </div>
              )}

              <div className="p-6">
                {/* Status Card - shown when checking/locking/uploading/processing */}
                {isProcessing && (
                  <div className="mb-6">
                    {/* Main Card */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-[#0f0f0f] border border-white/[0.08]">
                      {/* Circular Loader */}
                      <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center shrink-0">
                        <svg 
                          className="w-6 h-6 text-[#C9A84C] animate-spin" 
                          fill="none" 
                          viewBox="0 0 24 24"
                          style={{ animationDuration: '1.5s' }}
                        >
                          <circle 
                            className="opacity-20" 
                            cx="12" 
                            cy="12" 
                            r="10" 
                            stroke="currentColor" 
                            strokeWidth="3"
                          />
                          <path 
                            className="opacity-100" 
                            fill="currentColor" 
                            d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
                          />
                        </svg>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-white/90 text-sm font-medium break-all leading-snug">
                          {status === 'checking_credits' && 'Checking credits...'}
                          {status === 'locking' && 'Locking credits...'}
                          {status === 'uploading' && fileName}
                          {status === 'processing' && processStatus}
                        </p>
                        <p className="text-[#C9A84C]/80 text-xs mt-1">
                          {status === 'checking_credits' && 'Verifying available credits...'}
                          {status === 'locking' && 'Reserving 100 credits for processing...'}
                          {status === 'uploading' && `Uploading ${formatBytes(uploadedSize)} / ${formatBytes(fileSize)}...`}
                          {status === 'processing' && 'AI is analyzing your video...'}
                        </p>
                      </div>
                      
                      {/* Close button */}
                      <button
                        onClick={handleCancel}
                        className="p-2 text-white/30 hover:text-white/60 transition-colors shrink-0"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Progress bar */}
                    {(status === 'uploading' || status === 'processing') && (
                      <div className="mt-3">
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#C9A84C] to-[#E5C76B] rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${status === 'uploading' ? uploadProgress : processProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Processing Steps - only show during processing */}
                    {status === 'processing' && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {PROCESSING_CHIPS.map((chip, idx) => {
                          const isActive = processProgress >= chip.threshold;
                          const isCurrent = processProgress >= chip.threshold && (idx === PROCESSING_CHIPS.length - 1 || processProgress < PROCESSING_CHIPS[idx + 1]?.threshold);
                          return (
                            <div
                              key={chip.key}
                              className={`
                                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-300
                                ${isActive 
                                  ? 'bg-[#C9A84C]/15 text-[#C9A84C] border border-[#C9A84C]/30' 
                                  : 'bg-white/[0.03] text-white/30 border border-white/[0.06]'
                                }
                                ${isCurrent ? 'ring-1 ring-[#C9A84C]/20' : ''}
                              `}
                            >
                              {isActive && (
                                <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-[#C9A84C] animate-pulse' : 'bg-[#C9A84C]/60'}`} />
                              )}
                              {chip.label}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Prompt Input */}
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Describe what you want (optional)... e.g., 'Create a viral clip with cinematic captions and B-roll'"
                  disabled={isProcessing}
                  className="w-full bg-transparent text-white text-base placeholder-white/20 resize-none outline-none min-h-[100px] max-h-[140px] disabled:opacity-50 leading-relaxed"
                  rows={4}
                />
                
                {/* Action Row */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={isProcessing}
                    />
                    
                    {/* Upload Button - Primary */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#C9A84C] text-black font-semibold text-sm hover:bg-[#d4b85c] transition-all duration-200 disabled:opacity-50 shadow-lg shadow-[#C9A84C]/20 hover:shadow-[#C9A84C]/30 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload Video
                    </button>
                    
                    {/* Try Example Button - Secondary */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => !isProcessing && setShowExamples(!showExamples)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/20 bg-white/[0.03] text-white/80 font-medium text-sm hover:text-white hover:bg-white/10 hover:border-white/30 transition-all disabled:opacity-50"
                      >
                        <svg className="w-4 h-4 text-[#C9A84C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Try an example
                      </button>

                      {/* Example Dropdown */}
                      {showExamples && (
                        <div className="absolute top-full left-0 sm:left-0 mt-2 w-64 sm:w-80 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-w-[calc(100vw-2rem)]">
                          <div className="px-3 py-2 border-b border-white/5">
                            <p className="text-white/40 text-xs font-medium uppercase tracking-wider">Example prompts</p>
                          </div>
                          {EXAMPLE_PROMPTS.map((example, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => applyExample(example)}
                              className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group"
                            >
                              <p className="text-white/80 text-sm group-hover:text-white">{example.text}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side - Status or Drop hint */}
                  {isProcessing ? (
                    <div className="flex items-center gap-2 text-white/40 text-sm">
                      <span className="w-4 h-4 border-2 border-white/20 border-t-[#C9A84C] rounded-full animate-spin" />
                      {status === 'checking_credits' && 'Checking...'}
                      {status === 'locking' && 'Locking...'}
                      {status === 'uploading' && 'Uploading...'}
                      {status === 'processing' && 'Processing...'}
                    </div>
                  ) : (
                    <div className="text-right">
                      <p className="text-white/30 text-sm hidden sm:block">
                        or drop a video here • Max 1080p, {maxUploadMb}MB
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Click outside to close examples */}
            {showExamples && (
              <div 
                className="fixed inset-0 z-20" 
                onClick={() => setShowExamples(false)}
              />
            )}
          </div>

          {/* Credit Info Banner */}
          <div className="mt-4 flex items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-white/40">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>100 credits to process</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1.5 text-white/40">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>1 hour unlock timer</span>
            </div>
          </div>

          {/* Beta Tagline */}
          <p className="text-center text-white/30 text-xs mt-4">
            Public Beta • AI-generated content may vary
          </p>

          {/* Feature Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-8">
            {FEATURE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => !isProcessing && toggleFeature(chip.id)}
                disabled={isProcessing}
                className={`
                  inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all duration-200
                  ${activeFeatures[chip.id]
                    ? 'bg-[#C9A84C]/15 text-[#C9A84C] border border-[#C9A84C]/40 shadow-lg shadow-[#C9A84C]/10'
                    : 'bg-white/[0.03] text-white/50 border border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                  }
                  ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'}
                `}
              >
                {chip.isNew && (
                  <span className="px-1.5 py-0.5 rounded bg-white text-black text-[9px] font-bold leading-none">
                    New
                  </span>
                )}
                {chip.label}
              </button>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>
      </main>

      {/* Credit Confirmation Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#C9A84C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Lock 100 Credits?</h3>
                <p className="text-white/50 text-sm">Processing requires credit reservation</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-white/60 text-sm">Available Credits</span>
                <span className="text-white font-medium">{creditStatus?.available_credits || creditStatus?.available || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-white/60 text-sm">To Lock</span>
                <span className="text-amber-400 font-medium">-100</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-white/80 text-sm font-medium">Remaining</span>
                <span className="text-white font-semibold">{(creditStatus?.available_credits || creditStatus?.available || 0) - 100}</span>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-lg p-3 mb-6">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-white/40 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-white/50 text-xs leading-relaxed">
                  Credits will be deducted only when you download the final video. 
                  If you abandon the upload, credits will auto-unlock after 1 hour.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreditModal(false);
                  setPendingFile(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/70 hover:bg-white/5 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#C9A84C] text-black font-semibold hover:bg-[#d4b85c] transition-colors text-sm"
              >
                Lock & Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtle grid pattern overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />
    </div>
  );
}
