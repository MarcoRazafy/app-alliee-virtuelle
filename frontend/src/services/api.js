import axios from 'axios';
import { getToken, removeToken, removeUser } from './auth';

export const apiBaseUrl = (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/+$/, '');

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 10000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      removeUser();
      error.isAuthError = true;
      if (!String(error.config?.url || '').includes('/api/auth/login')) {
        window.dispatchEvent(new CustomEvent('auth:session-lost'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
