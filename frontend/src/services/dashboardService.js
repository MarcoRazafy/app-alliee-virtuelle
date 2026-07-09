import api from './api';

export function getRealtimeDashboard() {
  return api.get('/api/dashboard/realtime').then((res) => res.data);
}
