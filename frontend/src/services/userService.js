import api from './api';

export function getUsers() {
  return api.get('/api/users').then((res) => res.data);
}
