import axios from 'axios';

// In dev: use '' so Vite proxy (/api -> backend) works. In prod: use env or relative.
const baseURL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '' : '');

const apiClient = axios.create({
  baseURL: baseURL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Inject Authorization header from token
let getToken = () => null;

export const setTokenGetter = (fn) => {
  getToken = fn;
};

apiClient.interceptors.request.use((config) => {
  // Use token from AuthContext (handles dev-token, session, and dev sign-out)
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Don't override Content-Type for FormData – let the browser set multipart/form-data with boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Trigger auth clear - handled by AuthContext
      window.dispatchEvent(new CustomEvent('auth:401'));
    }
    return Promise.reject(error);
  }
);

export const getApiBaseURL = () => baseURL || '';

/** For use in keepalive/unload requests where axios cannot be used. */
export const getAuthHeader = () => {
  const t = import.meta.env.DEV ? 'dev-token-xyz' : (getToken() || null);
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** Get raw token for use in URLs (img src, etc.) */
export const getRawToken = () => import.meta.env.DEV ? 'dev-token-xyz' : (getToken() || null);

export default apiClient;
