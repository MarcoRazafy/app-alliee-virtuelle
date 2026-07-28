import api from './api';

export function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('file', file);
  return api
    .post('/api/auth/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((res) => res.data);
}

export function getMyAvatarBlob() {
  return api.get('/api/auth/me/avatar', { responseType: 'blob' }).then((res) => res.data);
}

// Photo d'un autre utilisateur (admin) — 404 si l'utilisateur n'a pas de photo
export function getUserAvatarBlob(userId) {
  return api.get(`/api/users/${userId}/avatar`, { responseType: 'blob' }).then((res) => res.data);
}
