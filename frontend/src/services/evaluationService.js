import api from './api';

// Admin : historique complet des évaluations d'un employé.
export function getUserEvaluations(userId) {
  return api.get(`/api/users/${userId}/evaluations`).then((res) => res.data);
}

// Admin : crée/met à jour l'évaluation d'un mois (month = 'YYYY-MM').
export function saveUserEvaluation(userId, month, data) {
  return api.put(`/api/users/${userId}/evaluations/${month}`, data).then((res) => res.data);
}

// Employé : ses propres évaluations (commentaire global + détail si rendu visible).
export function getMyEvaluations() {
  return api.get('/api/users/me/evaluations').then((res) => res.data);
}
