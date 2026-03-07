import apiClient from './client.js';

/**
 * Get user's credit status (total, locked, available)
 */
export async function getCreditsStatus() {
  const { data } = await apiClient.get('/api/credits/status');
  return data;
}

/**
 * Lock credits for video upload
 * @param {string} uploadId - The upload/video ID
 * @param {number} amount - Amount to lock (default 100)
 */
export async function lockCredits(uploadId, amount = 100) {
  const { data } = await apiClient.post('/api/credits/lock', {
    upload_id: uploadId,
    amount: amount,
  });
  return data;
}

/**
 * Release locked credits (when abandoning video)
 * @param {string} lockId - The lock ID
 */
export async function releaseCredits(lockId) {
  const { data } = await apiClient.post(`/api/credits/lock/${lockId}/release`);
  return data;
}

/**
 * Deduct locked credits (when confirming download)
 * @param {string} lockId - The lock ID
 */
export async function deductCredits(lockId) {
  const { data } = await apiClient.post(`/api/credits/lock/${lockId}/deduct`);
  return data;
}

/**
 * Increment retry count (when clicking Edit Again)
 * @param {string} lockId - The lock ID
 */
export async function incrementRetry(lockId) {
  const { data } = await apiClient.post(`/api/credits/lock/${lockId}/retry`);
  return data;
}

/**
 * Get lock status
 * @param {string} lockId - The lock ID
 */
export async function getLockStatus(lockId) {
  const { data } = await apiClient.get(`/api/credits/lock/${lockId}`);
  return data;
}

/**
 * Confirm download and deduct credits
 * @param {string} jobId - The job ID
 * @param {string} lockId - The lock ID
 */
export async function confirmDownload(jobId, lockId) {
  const { data } = await apiClient.post(`/api/jobs/${jobId}/confirm-download`, {
    job_id: jobId,
    lock_id: lockId,
  });
  return data;
}
