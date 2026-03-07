import apiClient from './client.js';

/** Start background prep (transcription + masks + GPT) immediately after upload */
export async function startBackgroundPrep(videoId) {
  const { data } = await apiClient.post('/api/prep/background', { video_id: videoId });
  return data;
}

/** Get status of background prep job */
export async function getPrepStatus(prepId) {
  const { data } = await apiClient.get(`/api/prep/${prepId}/status`);
  return data;
}

/** Poll until prep is complete (with timeout) */
export async function pollPrepUntilReady(prepId, onProgress, maxAttempts = 300) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getPrepStatus(prepId);
    
    if (onProgress) {
      onProgress(status);
    }
    
    if (status.status === 'completed') {
      return status;
    }
    
    if (status.status === 'failed') {
      throw new Error(status.error || 'Processing failed');
    }
    
    // Wait 2 seconds before next poll
    await new Promise(r => setTimeout(r, 2000));
  }
  
  throw new Error('Processing timed out');
}
