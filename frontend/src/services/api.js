import axios from 'axios';
import { getToken, removeToken, removeUser } from './auth';

// Une valeur vide utilise la même origine que le frontend. En développement LAN,
// Vite relaie alors /api vers le backend local sans créer de contenu mixte HTTPS/HTTP.
export const apiBaseUrl = (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/+$/, '');

const api = axios.create({
  baseURL: apiBaseUrl,
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
