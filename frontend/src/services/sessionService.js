import api from './api';
import { getToken } from './auth';
// Chrono de connexion (présence) : indépendant du chrono de tâche. Le login/logout
// explicite est déjà géré côté backend (authController). Le heartbeat prolonge l'unique
// session ouverte tant que l'application est réellement active.

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

export function heartbeatSession() {
  return api.post('/api/sessions/heartbeat').then((res) => res.data);
}

// fetch keepalive est adapté au pagehide, contrairement à une requête XHR classique.
// Le backend applique une tolérance : un simple rechargement annule cette demande au
// heartbeat suivant et ne fragmente donc pas la présence.
export function signalSessionDisconnect() {
  const token = getToken();
  if (!token) return;
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  fetch(`${baseUrl}/api/sessions/disconnect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {});
}
