const db = require('../config/database');
const taskModel = require('./task.model');
const { getWeekDates, formatDbDate } = require('../utils/planningDates');

// Réutilise la fonction d'audit déjà utilisée par le module tâches (table audit_log).
const recordAudit = taskModel.recordAudit;

function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

// Total d'heures disponibles sur un ensemble de jours (utilisé côté employé et admin).
function computeTotalHours(days) {
  let totalMinutes = 0;
  for (const day of days) {
    for (const slot of day.time_slots || []) {
      totalMinutes += timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time);
    }
  }
  return Math.round((totalMinutes / 60) * 100) / 100;
}

// Squelette des 7 jours d'une semaine sans planning existant : days vides côté API/UI.
function buildEmptyWeekDays(weekStartDate) {
  return getWeekDates(weekStartDate).map((date) => ({
    id: null,
    planning_date: date,
    availability_status: null,
    note: null,
    time_slots: [],
  }));
}

async function findPlanningByUserAndWeek(userId, weekStartDate, client = db) {
  const result = await client.query(
    `SELECT wp.*, mod_user.full_name AS last_modified_by_name
     FROM weekly_plannings wp
     LEFT JOIN users mod_user ON mod_user.id = wp.last_modified_by
     WHERE wp.user_id = $1 AND wp.week_start_date = $2`,
    [userId, weekStartDate]
  );
  return result.rows[0] || null;
}

async function findPlanningById(planningId, client = db) {
  const result = await client.query(
    `SELECT wp.*, mod_user.full_name AS last_modified_by_name, u.full_name AS user_full_name, u.position AS user_position
     FROM weekly_plannings wp
     JOIN users u ON u.id = wp.user_id
     LEFT JOIN users mod_user ON mod_user.id = wp.last_modified_by
     WHERE wp.id = $1`,
    [planningId]
  );
  return result.rows[0] || null;
}

async function findDaysWithSlots(planningId, client = db) {
  const daysResult = await client.query(
    `SELECT id, planning_date, availability_status, note
     FROM planning_days WHERE planning_id = $1 ORDER BY planning_date ASC`,
    [planningId]
  );
  const days = daysResult.rows;
  if (days.length === 0) return [];

  const slotsResult = await client.query(
    `SELECT id, planning_day_id, start_time, end_time
     FROM planning_time_slots WHERE planning_day_id = ANY($1::uuid[]) ORDER BY start_time ASC`,
    [days.map((day) => day.id)]
  );

  const slotsByDay = new Map();
  slotsResult.rows.forEach((slot) => {
    if (!slotsByDay.has(slot.planning_day_id)) slotsByDay.set(slot.planning_day_id, []);
    slotsByDay.get(slot.planning_day_id).push({ id: slot.id, start_time: slot.start_time, end_time: slot.end_time });
  });

  return days.map((day) => ({ ...day, time_slots: slotsByDay.get(day.id) || [] }));
}

async function createPlanning({ userId, weekStartDate, weekEndDate }, client = db) {
  const result = await client.query(
    `INSERT INTO weekly_plannings (user_id, week_start_date, week_end_date, status)
     VALUES ($1, $2, $3, 'DRAFT')
     RETURNING *`,
    [userId, weekStartDate, weekEndDate]
  );
  return result.rows[0];
}

async function getOrCreatePlanning({ userId, weekStartDate, weekEndDate }, client = db) {
  const existing = await findPlanningByUserAndWeek(userId, weekStartDate, client);
  if (existing) return existing;
  return createPlanning({ userId, weekStartDate, weekEndDate }, client);
}

async function fullSnapshot(planningId, client = db) {
  const planning = await findPlanningById(planningId, client);
  if (!planning) return null;
  const days = await findDaysWithSlots(planningId, client);
  return {
    general_note: planning.general_note,
    status: planning.status,
    days: days.map((day) => ({
      date: formatDbDate(day.planning_date),
      availability_status: day.availability_status,
      note: day.note,
      time_slots: day.time_slots.map((slot) => ({ start_time: slot.start_time, end_time: slot.end_time })),
    })),
  };
}

// Remplace intégralement les jours/plages d'un planning (transaction fournie par l'appelant).
async function replacePlanningDays(client, planningId, days) {
  await client.query('DELETE FROM planning_days WHERE planning_id = $1', [planningId]);

  const insertedDays = [];
  for (const day of days) {
    const dayResult = await client.query(
      `INSERT INTO planning_days (planning_id, planning_date, availability_status, note)
       VALUES ($1, $2, $3, $4) RETURNING id, planning_date, availability_status, note`,
      [planningId, day.date, day.availability_status, day.note || null]
    );
    const dayRow = dayResult.rows[0];
    const insertedSlots = [];
    for (const slot of day.time_slots || []) {
      const slotResult = await client.query(
        `INSERT INTO planning_time_slots (planning_day_id, start_time, end_time)
         VALUES ($1, $2, $3) RETURNING id, start_time, end_time`,
        [dayRow.id, slot.start_time, slot.end_time]
      );
      insertedSlots.push(slotResult.rows[0]);
    }
    insertedDays.push({ ...dayRow, time_slots: insertedSlots });
  }
  return insertedDays;
}

async function updatePlanningMeta(client, planningId, fields) {
  const columns = [];
  const params = [];

  Object.entries(fields).forEach(([column, value]) => {
    params.push(value);
    columns.push(`${column} = $${params.length}`);
  });
  params.push(planningId);

  const result = await client.query(
    `UPDATE weekly_plannings SET ${columns.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0];
}

async function recordPlanningHistory(client, { planningId, action, oldValue, newValue, changedBy, changeReason }) {
  await client.query(
    `INSERT INTO planning_history (planning_id, action, old_value, new_value, changed_by, change_reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      planningId,
      action,
      oldValue !== undefined && oldValue !== null ? JSON.stringify(oldValue) : null,
      newValue !== undefined && newValue !== null ? JSON.stringify(newValue) : null,
      changedBy,
      changeReason || null,
    ]
  );
}

async function findPlanningHistory(planningId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [rows, countResult] = await Promise.all([
    db.query(
      `SELECT ph.id, ph.action, ph.old_value, ph.new_value, ph.change_reason, ph.changed_at, ph.changed_by,
              u.full_name AS changed_by_name
       FROM planning_history ph
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE ph.planning_id = $1
       ORDER BY ph.changed_at DESC
       LIMIT $2 OFFSET $3`,
      [planningId, limit, offset]
    ),
    db.query('SELECT COUNT(*)::INTEGER AS total FROM planning_history WHERE planning_id = $1', [planningId]),
  ]);
  return { items: rows.rows, total: countResult.rows[0].total, page, limit };
}

async function findEmployeeHistory(userId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [rows, countResult] = await Promise.all([
    db.query(
      `SELECT ph.id, ph.action, ph.old_value, ph.new_value, ph.change_reason, ph.changed_at, ph.changed_by,
              u.full_name AS changed_by_name, wp.week_start_date, wp.week_end_date
       FROM planning_history ph
       JOIN weekly_plannings wp ON wp.id = ph.planning_id
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE wp.user_id = $1
       ORDER BY ph.changed_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*)::INTEGER AS total FROM planning_history ph
       JOIN weekly_plannings wp ON wp.id = ph.planning_id
       WHERE wp.user_id = $1`,
      [userId]
    ),
  ]);
  return { items: rows.rows, total: countResult.rows[0].total, page, limit };
}

async function listPlanningsForAdmin(filters = {}) {
  const { weekStartDate, userId, status, search, availabilityStatus, submitted } = filters;
  const conditions = [];
  const params = [];

  if (weekStartDate) {
    params.push(weekStartDate);
    conditions.push(`wp.week_start_date = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`wp.user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`wp.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (availabilityStatus) {
    params.push(availabilityStatus);
    conditions.push(`EXISTS (SELECT 1 FROM planning_days pd2 WHERE pd2.planning_id = wp.id AND pd2.availability_status = $${params.length})`);
  }
  if (submitted === 'true') {
    conditions.push('wp.submitted_at IS NOT NULL');
  } else if (submitted === 'false') {
    conditions.push('wp.submitted_at IS NULL');
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT wp.id AS planning_id, wp.user_id, u.full_name, u.position, wp.week_start_date, wp.week_end_date,
            wp.status, wp.general_note, wp.submitted_at, wp.updated_at, wp.last_modified_by,
            mod_user.full_name AS last_modified_by_name, wp.admin_modified_at, wp.last_admin_change_reason,
            COALESCE(hours.total_hours, 0) AS total_hours
     FROM weekly_plannings wp
     JOIN users u ON u.id = wp.user_id
     LEFT JOIN users mod_user ON mod_user.id = wp.last_modified_by
     LEFT JOIN (
       SELECT pd.planning_id, SUM(EXTRACT(EPOCH FROM (pts.end_time - pts.start_time))) / 3600 AS total_hours
       FROM planning_days pd
       JOIN planning_time_slots pts ON pts.planning_day_id = pd.id
       GROUP BY pd.planning_id
     ) hours ON hours.planning_id = wp.id
     ${where}
     ORDER BY wp.week_start_date DESC, u.full_name ASC`,
    params
  );
  return result.rows;
}

async function findActiveEmployees() {
  const result = await db.query(
    `SELECT id, full_name, position,
            EXISTS (SELECT 1 FROM user_avatars ua WHERE ua.user_id = users.id) AS has_avatar
     FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIF' ORDER BY full_name ASC`
  );
  return result.rows;
}

// Détail jour par jour d'une semaine (pour l'assistant IA) : une ligne par (employé, jour)
// avec la disponibilité et les créneaux horaires. Une seule requête pour toute la semaine.
async function listDayAvailabilityForWeek(weekStartDate) {
  const result = await db.query(
    `SELECT u.full_name, pd.planning_date, pd.availability_status,
            COALESCE(
              json_agg(
                json_build_object('debut', to_char(pts.start_time, 'HH24:MI'), 'fin', to_char(pts.end_time, 'HH24:MI'))
                ORDER BY pts.start_time
              ) FILTER (WHERE pts.id IS NOT NULL),
              '[]'
            ) AS creneaux
     FROM weekly_plannings wp
     JOIN users u ON u.id = wp.user_id
     JOIN planning_days pd ON pd.planning_id = wp.id
     LEFT JOIN planning_time_slots pts ON pts.planning_day_id = pd.id
     WHERE wp.week_start_date = $1
     GROUP BY u.full_name, pd.planning_date, pd.availability_status
     ORDER BY u.full_name ASC, pd.planning_date ASC`,
    [weekStartDate]
  );
  return result.rows;
}

// Disponibilité déclarée d'un jour donné, par utilisateur (page présence) : statut + créneaux.
async function findDayAvailabilityByUserForDate(dateString) {
  const result = await db.query(
    `SELECT wp.user_id, pd.availability_status,
            COALESCE(
              json_agg(
                json_build_object('start', to_char(pts.start_time, 'HH24:MI'), 'end', to_char(pts.end_time, 'HH24:MI'))
                ORDER BY pts.start_time
              ) FILTER (WHERE pts.id IS NOT NULL),
              '[]'
            ) AS slots
     FROM weekly_plannings wp
     JOIN planning_days pd ON pd.planning_id = wp.id AND pd.planning_date = $1
     LEFT JOIN planning_time_slots pts ON pts.planning_day_id = pd.id
     GROUP BY wp.user_id, pd.availability_status`,
    [dateString]
  );
  return result.rows;
}

// Même projection que ci-dessus, mais bornée à un employé et une période pour la
// fiche statistique mensuelle de présence.
async function findDayAvailabilityForUserRange(userId, startDate, endDate) {
  const result = await db.query(
    `SELECT pd.planning_date, pd.availability_status,
            COALESCE(
              json_agg(
                json_build_object('start', to_char(pts.start_time, 'HH24:MI'), 'end', to_char(pts.end_time, 'HH24:MI'))
                ORDER BY pts.start_time
              ) FILTER (WHERE pts.id IS NOT NULL),
              '[]'
            ) AS slots
     FROM weekly_plannings wp
     JOIN planning_days pd ON pd.planning_id = wp.id
     LEFT JOIN planning_time_slots pts ON pts.planning_day_id = pd.id
     WHERE wp.user_id = $1
       AND pd.planning_date >= $2
       AND pd.planning_date < $3
     GROUP BY pd.planning_date, pd.availability_status
     ORDER BY pd.planning_date ASC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

async function findAttendanceOverridesForDate(dateString) {
  const result = await db.query(
    `SELECT ao.id, ao.user_id, ao.attendance_date, ao.status, ao.late_minutes,
            ao.reason, ao.corrected_by, ao.corrected_at, ao.updated_at,
            admin.full_name AS corrected_by_name
     FROM attendance_overrides ao
     LEFT JOIN users admin ON admin.id = ao.corrected_by
     WHERE ao.attendance_date = $1`,
    [dateString]
  );
  return result.rows;
}

async function findAttendanceOverridesForUserRange(userId, startDate, endDate) {
  const result = await db.query(
    `SELECT ao.id, ao.user_id, ao.attendance_date, ao.status, ao.late_minutes,
            ao.reason, ao.corrected_by, ao.corrected_at, ao.updated_at,
            admin.full_name AS corrected_by_name
     FROM attendance_overrides ao
     LEFT JOIN users admin ON admin.id = ao.corrected_by
     WHERE ao.user_id = $1
       AND ao.attendance_date >= $2
       AND ao.attendance_date < $3
     ORDER BY ao.attendance_date DESC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

async function upsertAttendanceOverride(
  { userId, date, status, lateMinutes, reason, correctedBy },
  client = db
) {
  const result = await client.query(
    `INSERT INTO attendance_overrides (
       user_id, attendance_date, status, late_minutes, reason, corrected_by
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, attendance_date)
     DO UPDATE SET status = EXCLUDED.status,
                   late_minutes = EXCLUDED.late_minutes,
                   reason = EXCLUDED.reason,
                   corrected_by = EXCLUDED.corrected_by,
                   corrected_at = now(),
                   updated_at = now()
     RETURNING id, user_id, attendance_date, status, late_minutes, reason,
               corrected_by, corrected_at, updated_at`,
    [userId, date, status, lateMinutes, reason || null, correctedBy]
  );
  return result.rows[0];
}

async function deleteAttendanceOverride(userId, date, client = db) {
  const result = await client.query(
    `DELETE FROM attendance_overrides
     WHERE user_id = $1 AND attendance_date = $2
     RETURNING id, status, late_minutes, reason`,
    [userId, date]
  );
  return result.rows[0] || null;
}

async function countActiveEmployees() {
  const result = await db.query(`SELECT COUNT(*)::INTEGER AS total FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIF'`);
  return result.rows[0].total;
}

async function countSubmittedForWeek(weekStartDate) {
  const result = await db.query(
    `SELECT COUNT(*)::INTEGER AS total FROM weekly_plannings WHERE week_start_date = $1 AND submitted_at IS NOT NULL`,
    [weekStartDate]
  );
  return result.rows[0].total;
}

async function countAvailableToday(dateString) {
  const result = await db.query(
    `SELECT COUNT(DISTINCT wp.user_id)::INTEGER AS total
     FROM weekly_plannings wp
     JOIN planning_days pd ON pd.planning_id = wp.id
     JOIN users u ON u.id = wp.user_id
     WHERE pd.planning_date = $1
       AND pd.availability_status IN ('AVAILABLE', 'PARTIALLY_AVAILABLE')
       AND u.role = 'EMPLOYEE' AND u.status = 'ACTIF'`,
    [dateString]
  );
  return result.rows[0].total;
}

// Inclut les employés actifs sans aucun enregistrement weekly_plannings pour la semaine donnée.
async function findNonSubmittedEmployees(weekStartDate) {
  const result = await db.query(
    `SELECT u.id AS user_id, u.full_name, u.position, wp.id AS planning_id, wp.status, wp.submitted_at
     FROM users u
     LEFT JOIN weekly_plannings wp ON wp.user_id = u.id AND wp.week_start_date = $1
     WHERE u.role = 'EMPLOYEE' AND u.status = 'ACTIF'
       AND (wp.id IS NULL OR (wp.submitted_at IS NULL AND wp.status != 'ADMIN_MODIFIED'))
     ORDER BY u.full_name ASC`,
    [weekStartDate]
  );
  return result.rows;
}

// Un employé est disponible seulement si une de ses plages couvre entièrement la période demandée.
async function findAvailableEmployees({ date, startTime, endTime }) {
  const result = await db.query(
    `SELECT DISTINCT u.id AS user_id, u.full_name, u.position
     FROM users u
     JOIN weekly_plannings wp ON wp.user_id = u.id
     JOIN planning_days pd ON pd.planning_id = wp.id AND pd.planning_date = $1
     JOIN planning_time_slots pts ON pts.planning_day_id = pd.id
     WHERE u.role = 'EMPLOYEE' AND u.status = 'ACTIF'
       AND pd.availability_status IN ('AVAILABLE', 'PARTIALLY_AVAILABLE')
       AND pts.start_time <= $2 AND pts.end_time >= $3
     ORDER BY u.full_name ASC`,
    [date, startTime, endTime]
  );
  return result.rows;
}

module.exports = {
  recordAudit,
  computeTotalHours,
  buildEmptyWeekDays,
  findPlanningByUserAndWeek,
  findPlanningById,
  findDaysWithSlots,
  createPlanning,
  getOrCreatePlanning,
  fullSnapshot,
  replacePlanningDays,
  updatePlanningMeta,
  recordPlanningHistory,
  findPlanningHistory,
  findEmployeeHistory,
  listPlanningsForAdmin,
  findActiveEmployees,
  listDayAvailabilityForWeek,
  findDayAvailabilityByUserForDate,
  findDayAvailabilityForUserRange,
  findAttendanceOverridesForDate,
  findAttendanceOverridesForUserRange,
  upsertAttendanceOverride,
  deleteAttendanceOverride,
  countActiveEmployees,
  countSubmittedForWeek,
  countAvailableToday,
  findNonSubmittedEmployees,
  findAvailableEmployees,
};
