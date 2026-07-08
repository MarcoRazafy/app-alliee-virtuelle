const db = require('../config/database');

const TASK_STATUS = {
  DECLARED: 'DECLAREE',
  VALIDATED: 'VALIDEE',
  IN_PROGRESS: 'EN_COURS',
  DONE: 'TERMINEE',
  CONFIRMED: 'CONFIRMEE',
};

// DECLAREE n'est pas encore visible à l'employé (DECISIONS.md)
async function findAssignedTasks(userId, { status, priority, deadline } = {}) {
  const conditions = ['assigned_to = $1', "status != 'DECLAREE'"];
  const params = [userId];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }
  if (deadline) {
    params.push(deadline);
    conditions.push(`deadline = $${params.length}`);
  }

  const result = await db.query(
    `SELECT id, title, description, priority, status, deadline
     FROM tasks
     WHERE ${conditions.join(' AND ')}
     ORDER BY deadline ASC`,
    params
  );
  return result.rows;
}

// Vue admin : toutes les tâches, tous employés confondus (nécessaire pour confirm/reject)
async function findAllTasks({ status, priority, deadline } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }
  if (deadline) {
    params.push(deadline);
    conditions.push(`deadline = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT id, title, description, priority, status, deadline, assigned_to
     FROM tasks
     ${where}
     ORDER BY deadline ASC`,
    params
  );
  return result.rows;
}

async function findById(taskId) {
  const result = await db.query(
    `SELECT id, title, description, assigned_to, created_by, priority, status, start_date, deadline
     FROM tasks WHERE id = $1`,
    [taskId]
  );
  return result.rows[0] || null;
}

async function create({ title, description, assignedTo, createdBy, priority, deadline, startDate }) {
  const result = await db.query(
    `INSERT INTO tasks (title, description, assigned_to, created_by, priority, deadline, start_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, status`,
    [title, description, assignedTo, createdBy, priority, deadline, startDate || null, TASK_STATUS.DECLARED]
  );
  return result.rows[0];
}

async function updateStatus(taskId, status, client = db) {
  const result = await client.query(
    `UPDATE tasks SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, status`,
    [status, taskId]
  );
  return result.rows[0];
}

async function recordHistory({ taskId, fieldChanged, oldValue, newValue, changedBy }, client = db) {
  await client.query(
    `INSERT INTO task_history (task_id, field_changed, old_value, new_value, changed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [taskId, fieldChanged, oldValue, newValue, changedBy]
  );
}

async function recordAudit({ userId, action, entityType, entityId, details }, client = db) {
  await client.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

// --- Timelog ---

async function findActiveSessionForEmployee(employeeId) {
  const result = await db.query(
    `SELECT id, task_id, start_time FROM timelog WHERE employee_id = $1 AND end_time IS NULL`,
    [employeeId]
  );
  return result.rows[0] || null;
}

async function findActiveSessionForTask(taskId, employeeId) {
  const result = await db.query(
    `SELECT id, start_time FROM timelog WHERE task_id = $1 AND employee_id = $2 AND end_time IS NULL`,
    [taskId, employeeId]
  );
  return result.rows[0] || null;
}

async function startSession(taskId, employeeId, client = db) {
  const result = await client.query(
    `INSERT INTO timelog (task_id, employee_id, start_time)
     VALUES ($1, $2, now())
     RETURNING id, task_id, start_time`,
    [taskId, employeeId]
  );
  return result.rows[0];
}

async function stopSession(sessionId, client = db) {
  const result = await client.query(
    `UPDATE timelog
     SET end_time = now(),
         duration_seconds = EXTRACT(EPOCH FROM (now() - start_time))::INTEGER
     WHERE id = $1
     RETURNING id, task_id, start_time, end_time, duration_seconds`,
    [sessionId]
  );
  return result.rows[0];
}

async function findTimelogHistory(taskId) {
  const result = await db.query(
    `SELECT start_time, end_time, duration_seconds
     FROM timelog WHERE task_id = $1 ORDER BY start_time DESC`,
    [taskId]
  );
  return result.rows;
}

// --- Ma journée ---

async function findDailySelection(userId, date) {
  const result = await db.query(
    `SELECT s.task_id, s.selected_order, s.validated_at,
            t.title, t.description, t.priority, t.status, t.deadline
     FROM user_daily_selection s
     JOIN tasks t ON t.id = s.task_id
     WHERE s.user_id = $1 AND s.date = $2
     ORDER BY s.selected_order ASC`,
    [userId, date]
  );
  return result.rows;
}

async function validateDailySelection(userId, date) {
  await db.query(
    `UPDATE user_daily_selection SET validated_at = now()
     WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
}

// Remplace la sélection du jour par la liste ordonnée reçue (drag-drop côté front)
async function replaceDailySelection(userId, date, taskIds) {
  return db.withTransaction(async (client) => {
    await client.query('DELETE FROM user_daily_selection WHERE user_id = $1 AND date = $2', [userId, date]);

    for (let i = 0; i < taskIds.length; i += 1) {
      await client.query(
        `INSERT INTO user_daily_selection (user_id, task_id, selected_order, date)
         VALUES ($1, $2, $3, $4)`,
        [userId, taskIds[i], i + 1, date]
      );
    }
  });
}

module.exports = {
  TASK_STATUS,
  findAssignedTasks,
  findAllTasks,
  findById,
  create,
  updateStatus,
  recordHistory,
  recordAudit,
  findActiveSessionForEmployee,
  findActiveSessionForTask,
  startSession,
  stopSession,
  findTimelogHistory,
  findDailySelection,
  validateDailySelection,
  replaceDailySelection,
};
