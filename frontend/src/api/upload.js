import apiClient from './client.js';
import { getApiBaseURL, getRawToken } from './client.js';

/** Get app config (e.g. max_upload_mb). No auth required. */
export async function getUploadedVideoBlob(videoId) {
  const { data } = await apiClient.get(`/api/upload/${videoId}/video`, { responseType: 'blob' });
  return data;
}

export async function getConfig() {
  const { data } = await apiClient.get('/api/config');
  return data;
}

export async function uploadVideo(file, onProgress) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post('/api/upload', formData, {
    onUploadProgress: onProgress ? (progressEvent) => {
      const percentCompleted = progressEvent.total
        ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
        : 0;
      onProgress(percentCompleted);
    } : undefined,
  });
  return data;
}

export async function startJob(body) {
  const { data } = await apiClient.post('/api/jobs', body);
  return data;
}

export async function getJobStatus(jobId) {
  const { data } = await apiClient.get(`/api/jobs/${jobId}`);
  return data;
}

/** Request backend to stop a running/queued job (e.g. when user leaves the page). */
export async function cancelJob(jobId) {
  const { data } = await apiClient.post(`/api/jobs/${jobId}/cancel`);
  return data;
}

/** Prep (EditClip) API */
export async function getPrepData(prepId) {
  const { data } = await apiClient.get(`/api/prep/${prepId}`);
  return data;
}

export async function updatePrepData(prepId, body) {
  const { data } = await apiClient.patch(`/api/prep/${prepId}`, body);
  return data;
}

export async function createPrep(videoId) {
  const { data } = await apiClient.post('/api/prep', { video_id: videoId });
  return data;
}

export async function generateBrollSuggestions(prepId) {
  const { data } = await apiClient.post(`/api/prep/${prepId}/broll-suggestions`);
  return data;
}

export async function regeneratePlacementClips(prepId, placementIndex) {
  const { data } = await apiClient.post(`/api/prep/${prepId}/regenerate-placement/${placementIndex}`);
  return data;
}

export async function getBrollClips(prepId, placementIndex) {
  const { data } = await apiClient.get(`/api/prep/${prepId}/broll-clips/${placementIndex}`);
  return data;
}

export async function getColorGradePreviews(prepId) {
  const { data } = await apiClient.get(`/api/prep/${prepId}/color-grade-previews`);
  return data;
}

export async function processVideo(body) {
  const { data } = await apiClient.post('/api/process', body, { timeout: 15 * 60 * 1000 });
  return data;
}

export function getOutputVideoURL(outputPath) {
  const base = getApiBaseURL();
  const url = `${base}${outputPath.startsWith('/') ? '' : '/'}${outputPath}`;
  const token = getRawToken();
  if (token) {
    const sep = outputPath.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }
  return url;
}
