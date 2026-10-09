const env = require('../config/env');
const businessDay = require('../utils/businessDay');
const sessionModel = require('../models/session.model');
const taskModel = require('../models/task.model');
const db = require('../config/database');
const { connectedSecondsForDay, limitStatus, limitReachedMessage } = require('../utils/connectionLimit');

async function todayStatus(user) {
  const limitHours = env.employeeDailyConnectionLimitHours;
  if (!limitHours || user?.role !== 'EMPLOYEE') return null;

  const day = businessDay.businessDayNow();
  const alreadyCut = await db.query(
    'SELECT 1 FROM connection_limit_hits WHERE user_id = $1 AND business_day = $2',
    [user.id, day]
  );
  if (alreadyCut.rowCount > 0) return null;

  const start = businessDay.businessDayStart(day);
  const sessions = await sessionModel.findSessionsOverlappingRange(user.id, start.toISO(), start.plus({ days: 1 }).toISO());
  const status = limitStatus(connectedSecondsForDay(sessions, day), Math.round(limitHours * 3600));
  return { ...status, day, message: status.reached ? limitReachedMessage({ limitHours }) : null };
}

async function recordCut(userId, day) {
  const result = await db.query(
    `INSERT INTO connection_limit_hits (user_id, business_day) VALUES ($1, $2)
     ON CONFLICT (user_id, business_day) DO NOTHING`,
    [userId, day]
  );
  return result.rowCount > 0;
}

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

module.exports = { todayStatus, endPresence, recordCut };
