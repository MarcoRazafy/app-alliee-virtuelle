import api from './api';

// Employé : sa sélection « Daily » (tâches faites) du jour.
export function getMyDailyDone(date) {
  return api.get('/api/daily/done', { params: date ? { date } : {} }).then((res) => res.data);
}
export function saveMyDailyDone(payload) {
  return api.put('/api/daily/done', payload).then((res) => res.data);
}

// Admin : vue d'ensemble des To Do / Daily des employés pour une date.
export function getOverview(date) {
  return api.get('/api/daily/admin', { params: date ? { date } : {} }).then((res) => res.data);
}
