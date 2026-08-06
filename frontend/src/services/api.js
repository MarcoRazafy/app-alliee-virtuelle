import axios from 'axios';
import { getToken, removeToken, removeUser } from './auth';

// Une valeur vide utilise la même origine que le frontend. En développement LAN,
// Vite relaie alors /api vers le backend local sans créer de contenu mixte HTTPS/HTTP.
export const apiBaseUrl = (import.meta.env.VITE_API_URL?.trim() || '').replace(/\/+$/, '');

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 10000,
  // Envoie le cookie d'authentification httpOnly à chaque requête (same-origin).
  withCredentials: true,
});

// L'auth repose désormais sur le cookie httpOnly. On garde le fallback Authorization: Bearer
// au cas où un token serait encore présent (rétrocompatibilité), mais il n'est plus stocké.
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
      // Marque l'erreur : un 401 = session expirée / déconnexion. Les appels de fond (polling)
      // peuvent l'ignorer au lieu d'afficher un toast « Jeton d'authentification manquant ».
      error.isAuthError = true;
    }
    return Promise.reject(error);
  }
);

export default api;
