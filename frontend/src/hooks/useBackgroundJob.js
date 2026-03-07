import { useState, useEffect, useRef } from 'react';
import { getJobStatus } from '../api/upload.js';

const LAST_JOB_ID_KEY = 'obula_last_job_id';
const LAST_JOB_TIMESTAMP_KEY = 'obula_last_job_timestamp';
const MAX_JOB_AGE_HOURS = 24; // Jobs older than this are considered stale

/**
 * Hook for tracking a job in the background.
 * - Persists job ID to localStorage
 * - Continues polling even when tab is hidden (using Page Visibility API)
 * - Resumes tracking when user returns to the page
 * - Works across page reloads and browser restarts
 */
export function useBackgroundJob(jobId) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Refs for managing intervals and tracking state without triggering re-renders
  const elapsedIntervalRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const isPollingRef = useRef(false);

  // Store job ID in localStorage whenever it changes
  useEffect(() => {
    if (jobId) {
      localStorage.setItem(LAST_JOB_ID_KEY, jobId);
      localStorage.setItem(LAST_JOB_TIMESTAMP_KEY, Date.now().toString());
    }
  }, [jobId]);

  // Update elapsed time counter - only runs when job status changes
  useEffect(() => {
    // Clear any existing interval
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
    
    // Only start timer if job is active
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      const startTime = Date.now() - (elapsedSeconds * 1000);
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }

    return () => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
      }
    };
  }, [job, elapsedSeconds]);

  // Main polling effect - handles all polling logic
  useEffect(() => {
    // Clear any existing poll interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    isPollingRef.current = false;
    
    if (!jobId) return;

    isPollingRef.current = true;
    
    // Poll function that updates state through callbacks
    const doPoll = () => {
      getJobStatus(jobId).then((res) => {
        // Update job state
        setJob(res);
        setError(null);
        
        // Job completed, failed, or cancelled - clean up
        if (res.status === 'completed' || res.status === 'failed' || res.status === 'cancelled') {
          localStorage.removeItem(LAST_JOB_ID_KEY);
          localStorage.removeItem(LAST_JOB_TIMESTAMP_KEY);
          isPollingRef.current = false;
          
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          
          // Notify user if tab is hidden and job completed
          if (document.hidden && res.status === 'completed') {
            const originalTitle = document.title;
            document.title = '✓ Your clip is ready! - Obula';
            
            const restoreTitle = () => {
              if (!document.hidden) {
                document.title = originalTitle;
                document.removeEventListener('visibilitychange', restoreTitle);
              }
            };
            document.addEventListener('visibilitychange', restoreTitle);
          }
        }
      }).catch((err) => {
        const detail = err?.response?.data?.detail || '';
        const is404 = err?.response?.status === 404;
        const msg = is404
          ? 'This job is no longer available. If the server restarted, jobs are cleared. Please go back and create a new clip.'
          : (detail || 'Could not load job status.');
        
        setError(msg);
        localStorage.removeItem(LAST_JOB_ID_KEY);
        localStorage.removeItem(LAST_JOB_TIMESTAMP_KEY);
        isPollingRef.current = false;
        
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      });
    };

    // Initial poll
    doPoll();
    
    // Set up interval for polling (2 seconds)
    pollIntervalRef.current = setInterval(doPoll, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, [jobId]);

  // Handle page visibility changes - poll immediately when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && jobId && isPollingRef.current) {
        // Tab is now visible - trigger a poll by clearing and resetting interval
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        
        // Poll immediately
        getJobStatus(jobId).then((res) => {
          setJob(res);
          setError(null);
          
          if (res.status === 'completed' || res.status === 'failed' || res.status === 'cancelled') {
            localStorage.removeItem(LAST_JOB_ID_KEY);
            localStorage.removeItem(LAST_JOB_TIMESTAMP_KEY);
            isPollingRef.current = false;
            return;
          }
          
          // Restart interval
          pollIntervalRef.current = setInterval(() => {
            getJobStatus(jobId).then((res) => {
              setJob(res);
              setError(null);
              
              if (res.status === 'completed' || res.status === 'failed' || res.status === 'cancelled') {
                localStorage.removeItem(LAST_JOB_ID_KEY);
                localStorage.removeItem(LAST_JOB_TIMESTAMP_KEY);
                isPollingRef.current = false;
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
              }
            }).catch(() => {
              // Ignore errors during visibility change poll
            });
          }, 2000);
        }).catch(() => {
          // Ignore errors during visibility change poll
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [jobId]);

  // isPolling is true when we have a jobId and the job is not in a terminal state
  const isPolling = !!jobId && (!job || (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled'));
  
  return { job, error, elapsedSeconds, isPolling };
}

/**
 * Get the last active job ID from localStorage if it's not stale
 */
export function getLastActiveJobId() {
  const jobId = localStorage.getItem(LAST_JOB_ID_KEY);
  const timestamp = localStorage.getItem(LAST_JOB_TIMESTAMP_KEY);
  
  if (!jobId || !timestamp) return null;
  
  const ageHours = (Date.now() - parseInt(timestamp, 10)) / (1000 * 60 * 60);
  if (ageHours > MAX_JOB_AGE_HOURS) {
    localStorage.removeItem(LAST_JOB_ID_KEY);
    localStorage.removeItem(LAST_JOB_TIMESTAMP_KEY);
    return null;
  }
  
  return jobId;
}

/**
 * Clear the last active job from localStorage
 */
export function clearLastActiveJob() {
  localStorage.removeItem(LAST_JOB_ID_KEY);
  localStorage.removeItem(LAST_JOB_TIMESTAMP_KEY);
}

/**
 * Check if there's an active job that needs to be resumed
 */
export function hasActiveJob() {
  return !!getLastActiveJobId();
}
