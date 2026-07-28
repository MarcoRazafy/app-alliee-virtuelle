import api from './api';

export async function getUserAvatarBlob(userId) {
  const response = await api.get(`/api/users/${userId}/avatar`, {
    responseType: 'blob',
  });
  return response.data;
}
