import { create } from 'zustand';
import api from '../services/api';
import * as authService from '../services/auth';

function extractErrorMessage(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  if (data.errors) return data.errors.join(', ');
  if (data.error) return data.error;
  return fallback;
}

const useAuthStore = create((set) => ({
  user: authService.getUser(),
  isAuthenticated: !!authService.getToken(),
  error: null,

  login: async (email, password) => {
    set({ error: null });
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { token, user } = response.data;
      authService.setToken(token);
      authService.setUser(user);
      set({ user, isAuthenticated: true });
      return true;
    } catch (err) {
      set({ error: extractErrorMessage(err, 'Impossible de se connecter. Vérifiez vos identifiants.') });
      return false;
    }
  },

  register: async (payload) => {
    set({ error: null });
    try {
      const response = await api.post('/api/auth/register', payload);
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = extractErrorMessage(err, 'Impossible de créer le compte.');
      set({ error: message });
      return { success: false, message };
    }
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      // La session locale est nettoyée même si l'appel réseau échoue
    }
    authService.removeToken();
    authService.removeUser();
    set({ user: null, isAuthenticated: false });
  },
}));

export default useAuthStore;
