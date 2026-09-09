import api from './api';

export function getTeamStats(from, to) {
  return api.get('/api/stats/team', { params: { from, to } }).then((res) => res.data);
}

export function getMyStats(from, to) {
  return api.get('/api/stats/me', { params: { from, to } }).then((res) => res.data);
}

// Feuille de temps hebdomadaire (admin) : temps de connexion par employé et par jour.
// La date envoyée n'a pas besoin d'être un lundi — le serveur ramène à la semaine qui la contient.
export function getWeeklyConnections(weekStartDate) {
  return api
    .get('/api/stats/weekly-connections', { params: weekStartDate ? { week_start_date: weekStartDate } : {} })
    .then((res) => res.data);
}

// Relevé de temps d'un employé sur une semaine : ses entrées de chrono groupées par jour.
export function getWeeklyTimelog(userId, weekStartDate) {
  return api
    .get('/api/stats/weekly-timelog', {
      params: { user_id: userId, ...(weekStartDate ? { week_start_date: weekStartDate } : {}) },
    })
    .then((res) => res.data);
}

export function getAuditLog(params = {}) {
  return api.get('/api/audit-log', { params }).then((res) => res.data);
}
