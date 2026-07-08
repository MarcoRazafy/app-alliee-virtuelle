import axios from 'axios';
import { getToken, removeToken, removeUser } from './auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 10000,
});

// Attache le token JWT à chaque requête sortante
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si le token est refusé par le backend, on nettoie la session locale
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      removeUser();
    }
    return Promise.reject(error);
  }
);

export default api;
