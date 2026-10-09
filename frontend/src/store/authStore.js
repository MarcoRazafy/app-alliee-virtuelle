import { create } from 'zustand';
import api from '../services/api';
import * as authService from '../services/auth';
import { disconnectSocket } from '../services/socket';

function extractErrorMessage(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  if (data.errors) return data.errors.join(', ');
  if (data.error) return data.error;
  return fallback;
}

export const FORCED_LOGOUT_KEY = 'auth:forced-logout';
export const SESSION_LOST_EVENT = 'auth:session-lost';
export const SESSION_ENDED_MESSAGE = 'Votre session a pris fin. Reconnectez-vous pour continuer.';

const useAuthStore = create((set, get) => ({
  user: authService.getUser(),
  isAuthenticated: !!authService.getUser(),
  error: null,
  dayValidated: null,

  login: async (identifier, password) => {
    set({ error: null });
    try {
      const response = await api.post('/api/auth/login', { identifier, password });
      const { user } = response.data;
      authService.setUser(user);
      set({ user, isAuthenticated: true, dayValidated: user.role === 'EMPLOYEE' ? null : true });
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

  changePassword: async (currentPassword, newPassword) => {
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      return { success: true };
    } catch (err) {
      return { success: false, message: extractErrorMessage(err, 'Impossible de changer le mot de passe.') };
    }
  },

  updateProfile: async (payload) => {
    try {
      const response = await api.put('/api/auth/me', payload);
      const updatedUser = { ...get().user, ...response.data };
      authService.setUser(updatedUser);
      set({ user: updatedUser });
      return { success: true, user: response.data };
    } catch (err) {
      return { success: false, message: extractErrorMessage(err, 'Impossible de mettre à jour le profil.') };
    }
  },

  setDayValidated: (value) => set({ dayValidated: value }),

  checkDayValidated: async () => {
    if (get().user?.role !== 'EMPLOYEE') {
      set({ dayValidated: true });
      return;
    }
    try {
      const [selectionRes, tasksRes] = await Promise.all([api.get('/api/my-day'), api.get('/api/tasks')]);
      const selection = selectionRes.data;
      const tasks = tasksRes.data;
      const validated = selection.length > 0 && selection.every((item) => item.validated_at);
      const hasAvailableTasks = tasks.some((t) => t.status === 'VALIDEE' || t.status === 'EN_COURS');
      set({ dayValidated: validated || !hasAvailableTasks });
    } catch (err) {
      set({ dayValidated: true });
    }
  },

  forceLogout: (message, { broadcast = true } = {}) => {
    disconnectSocket();
    authService.removeToken();
    authService.removeUser();
    set({ user: null, isAuthenticated: false, dayValidated: null, error: message || null });
    if (broadcast) {
      try {
        localStorage.setItem(FORCED_LOGOUT_KEY, JSON.stringify({ message: message || null, at: Date.now() }));
      } catch {
      }
    }
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
    }
    disconnectSocket();
    authService.removeToken();
    authService.removeUser();
    set({ user: null, isAuthenticated: false, dayValidated: null });
  },
}));

export default useAuthStore;
