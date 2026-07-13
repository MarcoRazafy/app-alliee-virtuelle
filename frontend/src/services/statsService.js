import api from './api';

export function getTeamStats(from, to) {
  return api.get('/api/stats/team', { params: { from, to } }).then((res) => res.data);
}

export function getMyStats(from, to) {
  return api.get('/api/stats/me', { params: { from, to } }).then((res) => res.data);
}

export function getAuditLog(params = {}) {
  return api.get('/api/audit-log', { params }).then((res) => res.data);
}
