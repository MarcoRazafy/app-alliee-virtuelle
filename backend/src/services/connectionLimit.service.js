const env = require('../config/env');
const businessDay = require('../utils/businessDay');
const sessionModel = require('../models/session.model');
const taskModel = require('../models/task.model');
const { connectedSecondsForDay, limitStatus, limitReachedMessage } = require('../utils/connectionLimit');

// Limite quotidienne de connexion des employés (EMPLOYEE_DAILY_CONNECTION_LIMIT_HOURS).
// Les calculs purs vivent dans utils/connectionLimit ; ici, l'accès aux données.

// État de la journée de travail en cours pour cet utilisateur, ou null si la limite ne le
// concerne pas (admin) ou est désactivée.
async function todayStatus(user) {
  const limitHours = env.employeeDailyConnectionLimitHours;
  if (!limitHours || user?.role !== 'EMPLOYEE') return null;

  const day = businessDay.businessDayNow();
  const start = businessDay.businessDayStart(day);
  const sessions = await sessionModel.findSessionsOverlappingRange(user.id, start.toISO(), start.plus({ days: 1 }).toISO());
  const status = limitStatus(connectedSecondsForDay(sessions, day), Math.round(limitHours * 3600));
  return { ...status, day, message: status.reached ? limitReachedMessage({ limitHours, day }) : null };
}

// Fin de présence : exactement ce que fait une déconnexion. Partagé entre la déconnexion
// volontaire et la coupure automatique, pour qu'elles ne puissent pas diverger.
// - le chrono de tâche en cours est arrêté (sinon il tournerait toute la nuit) ;
// - la session de connexion est fermée.
async function endPresence(userId, { timelogAuditAction }) {
  const activeSession = await taskModel.findActiveSessionForEmployee(userId);
  if (activeSession) {
    const stopped = await taskModel.stopSession(activeSession.id);
    await taskModel.recordAudit({
      userId,
      action: timelogAuditAction,
      entityType: 'task',
      entityId: activeSession.task_id,
      details: { sessionId: stopped.id, duration_seconds: stopped.duration_seconds },
    });
  }
  await sessionModel.closeOpenSessions(userId);
}

module.exports = { todayStatus, endPresence };
