import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import LandingNav from '../components/LandingNav.jsx';
import VideoPreview from '../components/VideoPreview.jsx';
import { useBackgroundJob, getLastActiveJobId } from '../hooks/useBackgroundJob.js';
import { cancelJob, getOutputVideoURL } from '../api/upload.js';
import { confirmDownload, releaseCredits } from '../api/credits';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';

const GOLD = '#C9A84C';

// Stage descriptions
const STAGE_DETAILS = {
  queued: { title: 'In Queue', description: 'Your video is waiting to be processed' },
  starting: { title: 'Starting', description: 'Initializing AI models...' },
  orientation: { title: 'Analyzing', description: 'Detecting video orientation...' },
  masks: { title: 'Creating Masks', description: 'Detecting subjects for text-behind effects...' },
  transcription: { title: 'Transcribing', description: 'Converting speech to text...' },
  captions: { title: 'Styling Words', description: 'Highlighting key moments...' },
  broll: { title: 'Adding B-Roll', description: 'Inserting cinematic footage...' },
  intro: { title: 'Adding Intro', description: 'Creating intro effect...' },
  instagram: { title: 'Optimizing', description: 'Applying final touches...' },
  rounded_corners: { title: 'Finishing', description: 'Applying rounded corners...' },
  exporting: { title: 'Exporting', description: 'Saving your final video...' },
  done: { title: 'Complete', description: 'Your clip is ready!' },
};

// Format elapsed time
function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// Animated progress ring
function ProgressRing({ progress }) {
  const radius = 56;
  const stroke = 4;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  return (
    <div className="relative w-28 h-28 mx-auto">
      {/* Background circle */}
      <svg 
        height="112" 
        width="112" 
        className="absolute top-0 left-0 transform -rotate-90"
        style={{ width: '112px', height: '112px' }}
      >
        <circle
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={GOLD}
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease' }}
          strokeLinecap="round"
          fill="transparent"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      
      {/* Center percentage */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-light text-white tabular-nums">{progress}%</span>
      </div>
    </div>
  );
}

// Processing steps visualizer
function ProcessingSteps({ currentStage }) {
  const stages = ['queued', 'masks', 'transcription', 'captions', 'broll', 'exporting'];
  const currentIndex = stages.indexOf(currentStage);
  
  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      {stages.map((stage, idx) => {
        const isActive = idx <= currentIndex;
        const isCurrent = idx === currentIndex;
        
        return (
          <div key={stage} className="flex items-center">
            <div 
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                isCurrent 
                  ? 'bg-[#C9A84C]' 
                  : isActive 
                    ? 'bg-[#C9A84C]/50' 
                    : 'bg-white/10'
              }`}
            />
            {idx < stages.length - 1 && (
              <div 
                className={`w-6 h-[1px] mx-1 transition-all duration-500 ${
                  idx < currentIndex ? 'bg-[#C9A84C]/30' : 'bg-white/10'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Processing() {
  const { jobId: urlJobId } = useParams();
  const navigate = useNavigate();
  const redirectingRef = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [showCreateNewWarning, setShowCreateNewWarning] = useState(false);
  const [lockExpiry, setLockExpiry] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const { user } = useAuth();
  
  // Get lock_id from sessionStorage
  const lockId = sessionStorage.getItem('pending_credit_lock_id');
  
  const jobId = urlJobId || getLastActiveJobId();
  const { job, error, elapsedSeconds, isPolling } = useBackgroundJob(jobId);

  // Load lock expiry on mount
  useEffect(() => {
    const expiry = sessionStorage.getItem('lock_expires_at');
    if (expiry) {
      setLockExpiry(new Date(expiry));
    }
  }, []);
  
  // Countdown timer
  useEffect(() => {
    if (!lockExpiry) return;
    
    const updateTimer = () => {
      const now = new Date();
      const diff = lockExpiry - now;
      if (diff <= 0) {
        setTimeRemaining('00:00');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lockExpiry]);

  const handleDownloadClick = () => {
    // Show confirmation modal
    setShowDownloadConfirm(true);
  };

  const handleConfirmDownload = async () => {
    if (!job?.output_video_url) return;
    setShowDownloadConfirm(false);
    setDownloading(true);
    
    try {
      // Confirm download and deduct credits
      if (lockId) {
        await confirmDownload(jobId, lockId);
        // Clear lock from sessionStorage after successful download
        sessionStorage.removeItem('pending_credit_lock_id');
        sessionStorage.removeItem('upload_completed');
        
        toast.success(
          <div>
            <p className="font-medium">100 Credits Deducted</p>
            <p className="text-xs text-white/70">Thank you for using Obula!</p>
          </div>,
          { autoClose: 4000 }
        );
      }
      
      const src = getOutputVideoURL(job.output_video_url);
      const res = await fetch(src);
      const blob = await res.blob();

      // Note: We don't save to My Videos on successful download
      // My Videos is only for failed/interrupted downloads

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'obula_clip.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleCreateNewClick = () => {
    // Check if user has pending lock (not downloaded yet)
    const hasPendingLock = sessionStorage.getItem('pending_credit_lock_id');
    if (hasPendingLock) {
      setShowCreateNewWarning(true);
    } else {
      navigate('/upload');
    }
  };

  const handleAbandonAndCreateNew = async () => {
    // Release credits and navigate
    const pendingLockId = sessionStorage.getItem('pending_credit_lock_id');
    if (pendingLockId) {
      try {
        await releaseCredits(pendingLockId);
        toast.info('Credits released. Starting fresh...', { autoClose: 3000 });
      } catch (e) {
        console.error('Failed to release credits:', e);
      }
      sessionStorage.removeItem('pending_credit_lock_id');
      sessionStorage.removeItem('upload_completed');
    }
    setShowCreateNewWarning(false);
    navigate('/upload');
  };

  useEffect(() => {
    if (!urlJobId && jobId && !redirectingRef.current) {
      redirectingRef.current = true;
      navigate(`/upload/processing/${jobId}`, { replace: true });
    }
  }, [urlJobId, jobId, navigate]);

  const handleCancel = async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await cancelJob(jobId);
    } catch {
      setCancelling(false);
    }
  };

  if (!jobId) {
    return (
      <div className="min-h-screen flex flex-col text-white bg-[#0a0a0a]">
        <LandingNav />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-white/60 mb-4">No active processing job found.</p>
            <Link 
              to="/upload" 
              className="px-6 py-3 bg-[#C9A84C] text-black font-semibold rounded-xl hover:bg-[#C9A84C]/90"
            >
              Create a Clip
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col text-white bg-[#0a0a0a]">
        <LandingNav />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-400 mb-6">{error}</p>
            <Link 
              to="/upload" 
              className="px-6 py-3 bg-[#C9A84C] text-black font-semibold rounded-xl hover:bg-[#C9A84C]/90"
            >
              Try Again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (job?.status === 'completed') {
    return (
      <div className="min-h-screen flex flex-col text-white bg-[#0a0a0a]">
        <LandingNav />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center w-full max-w-md">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-1">Your clip is ready!</h2>
            <p className="text-white/50 mb-2">Processing took {formatElapsed(elapsedSeconds)}</p>
            
            {/* Expiration countdown */}
            {timeRemaining && (
              <div className="flex items-center justify-center gap-2 text-amber-400/80 text-sm mb-6">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Video expires in {timeRemaining}</span>
              </div>
            )}
            
            <VideoPreview
              outputVideoUrl={job.output_video_url}
              thumbnailUrl={job.thumbnail_url}
              processingTime={job.processing_time}
              overlaysAdded={job.overlays_added}
              showDownloadButton={false}
              showWatermark={true}
            />
            
            {/* Action Buttons */}
            <div className="mt-8 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadClick}
                  disabled={downloading}
                  className="py-4 px-4 bg-[#C9A84C] text-black font-semibold rounded-xl hover:bg-[#C9A84C]/90 transition-colors text-center flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {downloading ? 'Downloading…' : 'Download'}
                </button>
                
                <button
                  onClick={() => {
                    // Save settings to localStorage for Edit Again feature
                    if (job.settings) {
                      localStorage.setItem('edit_again_settings', JSON.stringify(job.settings));
                      localStorage.setItem('edit_again_prep_id', job.from_prep_id || '');
                      localStorage.setItem('edit_again_video_id', job.video_id || '');
                    }
                    window.location.href = job.from_prep_id 
                      ? `/edit/${job.from_prep_id}?videoId=${job.video_id || ''}&restore=true`
                      : `/upload?videoId=${job.video_id || ''}&restore=true`;
                  }}
                  className="py-4 px-4 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/15 transition-colors text-center flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit Again
                </button>
              </div>
              
              <button
                onClick={handleCreateNewClick}
                className="py-3 px-4 border border-white/20 text-white/80 font-medium rounded-xl hover:bg-white/5 hover:text-white transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New
              </button>
            </div>
            
            {/* Download Confirmation Modal */}
            {showDownloadConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#C9A84C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Confirm Download</h3>
                    </div>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-amber-400 text-xs font-bold">100</span>
                      </div>
                      <p className="text-white/70">This will deduct <span className="text-amber-400 font-medium">100 credits</span> from your account.</p>
                    </div>
                    <div className="flex items-start gap-3 text-sm">
                      <svg className="w-5 h-5 text-white/40 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-white/50">After downloading, you won't be able to edit this video anymore.</p>
                    </div>
                    {timeRemaining && (
                      <div className="flex items-center gap-2 text-xs text-amber-400/70 bg-amber-500/5 rounded-lg px-3 py-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Video expires in {timeRemaining}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDownloadConfirm(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/70 hover:bg-white/5 transition-colors text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmDownload}
                      disabled={downloading}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-[#C9A84C] text-black font-semibold hover:bg-[#d4b85c] transition-colors text-sm disabled:opacity-50"
                    >
                      {downloading ? 'Processing...' : 'Download'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Create New Warning Modal */}
            {showCreateNewWarning && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">Abandon Video?</h3>
                    </div>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    <p className="text-white/70 text-sm">
                      You haven't downloaded this video yet. If you leave now:
                    </p>
                    <ul className="text-sm text-white/50 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-amber-400">•</span>
                        <span>Your 100 locked credits will be released</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-amber-400">•</span>
                        <span>This video will be marked as abandoned</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-amber-400">•</span>
                        <span>You'll need to start over from upload</span>
                      </li>
                    </ul>
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCreateNewWarning(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/70 hover:bg-white/5 transition-colors text-sm font-medium"
                    >
                      Stay Here
                    </button>
                    <button
                      onClick={handleAbandonAndCreateNew}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors text-sm font-medium"
                    >
                      Leave Anyway
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <Link to="/my-videos" className="inline-flex items-center gap-1 mt-6 text-white/40 hover:text-white/70 transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              My Videos
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (job?.status === 'failed') {
    return (
      <div className="min-h-screen flex flex-col text-white bg-[#0a0a0a]">
        <LandingNav />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-400 mb-6">{job.detail || 'Processing failed. Please try again.'}</p>
            <Link 
              to="/upload" 
              className="px-6 py-3 bg-[#C9A84C] text-black font-semibold rounded-xl hover:bg-[#C9A84C]/90"
            >
              Try Again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (job?.status === 'cancelled') {
    return (
      <div className="min-h-screen flex flex-col text-white bg-[#0a0a0a]">
        <LandingNav />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-white/70 mb-2">Processing was cancelled.</p>
            <p className="text-white/40 text-sm mb-6">Your video is ready to edit with different settings.</p>
            <button 
              onClick={() => {
                if (job.settings) {
                  localStorage.setItem('edit_again_settings', JSON.stringify(job.settings));
                  localStorage.setItem('edit_again_prep_id', job.from_prep_id || '');
                  localStorage.setItem('edit_again_video_id', job.video_id || '');
                }
                window.location.href = job.from_prep_id 
                  ? `/edit/${job.from_prep_id}?videoId=${job.video_id || ''}&restore=true`
                  : `/upload?videoId=${job.video_id || ''}&restore=true`;
              }}
              className="px-6 py-3 bg-[#C9A84C] text-black font-semibold rounded-xl hover:bg-[#C9A84C]/90 inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" stroke-linejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Video
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active processing state
  const progress = Math.round(job?.progress || 0);
  const stage = job?.stage || 'queued';
  const stageInfo = STAGE_DETAILS[stage] || STAGE_DETAILS.queued;

  return (
    <div className="min-h-screen flex flex-col text-white bg-[#0a0a0a]">
      <LandingNav />
      
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm text-center">
          {/* Progress Ring */}
          <ProgressRing progress={progress} />
          
          {/* Stage Title */}
          <h2 className="text-lg font-medium text-white mt-4 mb-1">
            {stageInfo.title}
          </h2>
          
          {/* Stage Description */}
          <p className="text-white/40 text-sm mb-6">
            {stageInfo.description}
          </p>
          
          {/* Processing Steps */}
          <ProcessingSteps currentStage={stage} />
          
          {/* Elapsed Time */}
          <div className="mt-8 flex items-center justify-center gap-2 text-white/30 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Elapsed: {formatElapsed(elapsedSeconds)}</span>
          </div>
          
          {/* Background polling indicator */}
          {isPolling && document.hidden && (
            <div className="mt-4 flex items-center justify-center gap-2 text-white/40 text-xs">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Processing in background...
            </div>
          )}

          {/* Cancel Section */}
          <div className="mt-10 flex justify-center">
            {!showCancelConfirm ? (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelling}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-white/50 hover:text-white/70 text-xs font-medium transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <p className="text-white/50 text-sm">Are you sure?</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-3 py-1.5 text-white/50 hover:text-white/70 text-xs transition-colors"
                  >
                    No, keep
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {cancelling ? 'Cancelling...' : 'Yes, cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
