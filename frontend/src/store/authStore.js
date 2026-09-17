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

// Clé du signal « déconnexion forcée » partagé entre onglets (événement `storage`).
export const FORCED_LOGOUT_KEY = 'auth:forced-logout';
// Événement émis par le client API sur un 401 : la session n'est plus valable.
export const SESSION_LOST_EVENT = 'auth:session-lost';
// Message quand la cause de la fin de session n'est pas connue (simple 401).
export const SESSION_ENDED_MESSAGE = 'Votre session a pris fin. Reconnectez-vous pour continuer.';

const useAuthStore = create((set, get) => ({
  user: authService.getUser(),
  // Le token vit dans un cookie httpOnly (invisible au JS) : on déduit l'état connecté de la
  // présence de l'objet utilisateur. Un cookie expiré → 401 → nettoyage + redirection login.
  isAuthenticated: !!authService.getUser(),
  error: null,
  // null = pas encore vérifié (ex: rechargement de page), true/false = état connu
  dayValidated: null,

  login: async (identifier, password) => {
    set({ error: null });
    try {
      const response = await api.post('/api/auth/login', { identifier, password });
      const { user } = response.data;
      // On NE stocke PAS le token côté JS : il est déjà posé en cookie httpOnly par le backend.
      // Seul l'objet utilisateur (non sensible) est conservé pour l'affichage / la reprise de session.
      authService.setUser(user);
      // La vérification serveur décide si l'employé doit valider sa journée. Elle autorise
      // immédiatement la plateforme lorsqu'aucune tâche actionnable ne lui est assignée.
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

  // Restaure l'état réel depuis le serveur (utile après un rechargement de page,
  // où l'état mémoire de dayValidated est perdu mais la validation serveur, elle, persiste).
  // Si l'employé n'a plus aucune tâche disponible à sélectionner, on ne le bloque pas.
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
      // Ne jamais bloquer l'employé à cause d'une erreur réseau
      set({ dayValidated: true });
    }
  },

  // Déconnexion décidée par le serveur (limite quotidienne de connexion atteinte). Le serveur a
  // déjà fermé la session, arrêté le chrono et effacé le cookie : il ne reste qu'à nettoyer
  // l'état local. Le message est posé dans `error`, que la page de connexion affiche — la
  // redirection vers /login se fait d'elle-même (ProtectedRoute).
  //
  // `broadcast` : prévient les autres onglets ouverts. Ils partagent le même cookie, déjà
  // effacé : sans ce signal, ils restaient affichés, figés sur des erreurs 401.
  forceLogout: (message, { broadcast = true } = {}) => {
    disconnectSocket();
    authService.removeToken();
    authService.removeUser();
    set({ user: null, isAuthenticated: false, dayValidated: null, error: message || null });
    if (broadcast) {
      try {
        // L'horodatage rend chaque signal unique : `storage` ne se déclenche que sur un changement.
        localStorage.setItem(FORCED_LOGOUT_KEY, JSON.stringify({ message: message || null, at: Date.now() }));
      } catch {
        // Stockage indisponible (navigation privée stricte) : les autres onglets retomberont sur
        // le filet de sécurité des 401.
      }
    }
  },

  logout: async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (err) {
      // La session locale est nettoyée même si l'appel réseau échoue
    }
    disconnectSocket(); // ferme la connexion temps réel pour éviter de rester connecté avec un ancien token
    authService.removeToken();
    authService.removeUser();
    set({ user: null, isAuthenticated: false, dayValidated: null });
  },
}));

export default useAuthStore;
