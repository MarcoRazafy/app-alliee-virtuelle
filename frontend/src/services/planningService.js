import api from './api';

// ---------- Employé ----------

export function getCurrentWeekPlanning() {
  return api.get('/api/planning/current').then((res) => res.data);
}

export function getNextWeekPlanning() {
  return api.get('/api/planning/next-week').then((res) => res.data);
}

// Filtrage par semaine : consultation en lecture d'une semaine arbitraire (passée, actuelle
// ou future) de l'employé connecté.
export function getWeekPlanning(weekStartDate) {
  return api.get('/api/planning/week', { params: { week_start_date: weekStartDate } }).then((res) => res.data);
}

export function createNextWeekPlanning() {
  return api.post('/api/planning/next-week').then((res) => res.data);
}

export function saveNextWeekPlanning({ generalNote, days }) {
  return api.put('/api/planning/next-week', { general_note: generalNote, days }).then((res) => res.data);
}

export function submitNextWeekPlanning() {
  return api.post('/api/planning/next-week/submit').then((res) => res.data);
}

export function getMyPlanningHistory(params = {}) {
  return api.get('/api/planning/history', { params }).then((res) => res.data);
}

// ---------- Administrateur ----------

export function getAdminPlannings(params = {}) {
  return api.get('/api/planning/admin', { params }).then((res) => res.data);
}

export function getAdminPlanningSummary(params = {}) {
  return api.get('/api/planning/admin/summary', { params }).then((res) => res.data);
}

export function getAdminPlanningDetail(planningId) {
  return api.get(`/api/planning/admin/${planningId}`).then((res) => res.data);
}

export function updateAdminPlanning(planningId, { changeReason, generalNote, days }) {
  return api
    .put(`/api/planning/admin/${planningId}`, { change_reason: changeReason, general_note: generalNote, days })
    .then((res) => res.data);
}

export function createAdminPlanningForUser({ userId, weekStartDate }) {
  return api.post('/api/planning/admin', { user_id: userId, week_start_date: weekStartDate }).then((res) => res.data);
}

export function getAdminNonSubmitted(weekStartDate) {
  return api.get('/api/planning/admin/non-submitted', { params: { week_start_date: weekStartDate } }).then((res) => res.data);
}

export function searchAdminAvailability({ date, startTime, endTime }) {
  return api
    .get('/api/planning/admin/availability', { params: { date, start_time: startTime, end_time: endTime } })
    .then((res) => res.data);
}

export function getAdminPlanningHistory(planningId, params = {}) {
  return api.get(`/api/planning/admin/${planningId}/history`, { params }).then((res) => res.data);
}
