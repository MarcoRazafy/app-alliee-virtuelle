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
