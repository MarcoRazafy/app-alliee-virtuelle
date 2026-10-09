import api from './api';

export function getMyDailyDone(date) {
  return api.get('/api/daily/done', { params: date ? { date } : {} }).then((res) => res.data);
}
export function saveMyDailyDone(payload) {
  return api.put('/api/daily/done', payload).then((res) => res.data);
}

export function getOverview(date) {
  return api.get('/api/daily/admin', { params: date ? { date } : {} }).then((res) => res.data);
}
