import api from './api';

// Annuaire léger (tout utilisateur connecté) : utilisé pour démarrer une conversation
export function getUsers() {
  return api.get('/api/users/directory').then((res) => res.data);
}

// Gestion des comptes (admin uniquement)
export function getAllUsers(filters = {}) {
  return api.get('/api/users', { params: filters }).then((res) => res.data);
}

export function getPendingUsers() {
  return api.get('/api/users/pending').then((res) => res.data);
}

export function getUserDetail(id) {
  return api.get(`/api/users/${id}/detail`).then((res) => res.data);
}

export function approveUser(id) {
  return api.post(`/api/users/${id}/approve`).then((res) => res.data);
}

export function rejectUser(id, motif) {
  return api.post(`/api/users/${id}/reject`, { motif }).then((res) => res.data);
}

export function suspendUser(id) {
  return api.post(`/api/users/${id}/suspend`).then((res) => res.data);
}

export function activateUser(id) {
  return api.post(`/api/users/${id}/activate`).then((res) => res.data);
}

export function promoteUser(id) {
  return api.post(`/api/users/${id}/promote`).then((res) => res.data);
}
