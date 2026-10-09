import api from './api';

export function getUserEvaluations(userId) {
  return api.get(`/api/users/${userId}/evaluations`).then((res) => res.data);
}

export function saveUserEvaluation(userId, month, data) {
  return api.put(`/api/users/${userId}/evaluations/${month}`, data).then((res) => res.data);
}

export function getMyEvaluations() {
  return api.get('/api/users/me/evaluations').then((res) => res.data);
}
