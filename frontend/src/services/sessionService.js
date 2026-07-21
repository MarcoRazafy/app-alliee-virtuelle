import api from './api';
import { getToken } from './auth';

// Chrono de connexion (présence) : indépendant du chrono de tâche. Le login/logout
// explicite est déjà géré côté backend (authController) ; ce service ne fait que lire
// les périodes de connexion et signaler une fermeture d'application "silencieuse" (fermeture
// d'onglet/navigateur sans clic sur Déconnexion).

export function getMySessionsForWeek(weekStartDate) {
  return api.get('/api/sessions/week', { params: { week_start_date: weekStartDate } }).then((res) => res.data);
}

// Sessions de connexion d'un employé donné (admin) — pour superposer sa présence sur le planning.
export function getUserSessionsForWeek(userId, weekStartDate) {
  return api
    .get('/api/sessions/admin/week', { params: { user_id: userId, week_start_date: weekStartDate } })
    .then((res) => res.data);
}

// Session de connexion actuellement ouverte (pour le chrono flottant) : { login_at: string|null }.
export function getMyCurrentSession() {
  return api.get('/api/sessions/current').then((res) => res.data);
}

// Appelé au déchargement de la page (fermeture d'onglet/navigateur). keepalive permet à la
// requête de survivre à la navigation qui suit immédiatement ; les en-têtes personnalisés
// (Authorization) restent supportés par fetch, contrairement à navigator.sendBeacon.
export function closeSessionOnUnload() {
  const token = getToken();
  if (!token) return;

  const baseURL = api.defaults.baseURL || '';
  try {
    fetch(`${baseURL}/api/sessions/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
  } catch {
    // La page se ferme de toute façon : une erreur ici ne doit jamais bloquer la fermeture.
  }
}
