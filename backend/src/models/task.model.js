const db = require('../config/database');
const { computeCompletionRate } = require('../utils/kpi');

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

// --- Commentaires & notes ---

// onlyType filtre strictement côté serveur : jamais confié au frontend de séparer NOTE/COMMENT
async function findComments(taskId, { onlyType } = {}) {
  const conditions = ['c.task_id = $1'];
  const params = [taskId];
  if (onlyType) {
    params.push(onlyType);
    conditions.push(`c.type = $${params.length}`);
  }

  const result = await db.query(
    `SELECT c.id, c.content, c.type, c.is_visible_to_employee, c.created_at, c.author_id, u.full_name AS author_name
     FROM task_comments c
     JOIN users u ON u.id = c.author_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.created_at ASC`,
    params
  );
  return result.rows;
}

async function createComment({ taskId, authorId, content, type, isVisibleToEmployee }) {
  const result = await db.query(
    `INSERT INTO task_comments (task_id, author_id, content, type, is_visible_to_employee)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, content, type, is_visible_to_employee, created_at, author_id`,
    [taskId, authorId, content, type, isVisibleToEmployee]
  );
  return result.rows[0];
}

// --- Pièces jointes ---

async function findAttachments(taskId) {
  const result = await db.query(
    `SELECT a.id, a.file_name, a.file_size, a.file_type, a.created_at, a.uploaded_by, u.full_name AS uploaded_by_name
     FROM task_attachments a
     JOIN users u ON u.id = a.uploaded_by
     WHERE a.task_id = $1
     ORDER BY a.created_at DESC`,
    [taskId]
  );
  return result.rows;
}

async function findAttachmentById(attachmentId) {
  const result = await db.query('SELECT * FROM task_attachments WHERE id = $1', [attachmentId]);
  return result.rows[0] || null;
}

async function createAttachment({ taskId, fileName, filePath, fileSize, fileType, uploadedBy }) {
  const result = await db.query(
    `INSERT INTO task_attachments (task_id, file_name, file_path, file_size, file_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, file_name, file_size, file_type, created_at, uploaded_by`,
    [taskId, fileName, filePath, fileSize, fileType, uploadedBy]
  );
  return result.rows[0];
}

async function deleteAttachment(attachmentId) {
  await db.query('DELETE FROM task_attachments WHERE id = $1', [attachmentId]);
}

// --- Admin : supervision ---

// Tâches en retard : deadline dépassée ET pas confirmée (une CONFIRMEE n'est jamais en retard - DECISIONS.md)
async function findLateTasks() {
  const result = await db.query(
    `SELECT t.id, t.title, t.priority, t.status, t.deadline, t.assigned_to,
            u.full_name AS assigned_to_name,
            (CURRENT_DATE - t.deadline) AS days_late
     FROM tasks t
     JOIN users u ON u.id = t.assigned_to
     WHERE t.deadline < CURRENT_DATE AND t.status != 'CONFIRMEE'
     ORDER BY t.deadline ASC`
  );
  return result.rows;
}

// Vue admin : toutes les tâches d'un employé, y compris DECLAREE (l'admin voit tout)
async function findTasksForEmployee(userId) {
  const result = await db.query(
    `SELECT id, title, priority, status, deadline
     FROM tasks WHERE assigned_to = $1 ORDER BY deadline ASC`,
    [userId]
  );
  return result.rows;
}

async function computeEmployeeStats(userId) {
  const taskResult = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'CONFIRMEE')::INTEGER AS tasks_confirmed,
       COUNT(*)::INTEGER AS tasks_assigned,
       COUNT(*) FILTER (WHERE deadline < CURRENT_DATE AND status != 'CONFIRMEE')::INTEGER AS tasks_late
     FROM tasks WHERE assigned_to = $1`,
    [userId]
  );
  const hoursResult = await db.query(
    `SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT AS hours_worked_seconds
     FROM timelog WHERE employee_id = $1`,
    [userId]
  );

  const row = taskResult.rows[0];

  return {
    tasks_confirmed: row.tasks_confirmed,
    tasks_assigned: row.tasks_assigned,
    completion_rate: computeCompletionRate(row.tasks_confirmed, row.tasks_assigned),
    hours_worked_seconds: Number(hoursResult.rows[0].hours_worked_seconds),
    tasks_late: row.tasks_late,
  };
}

async function findRecentAuditForUser(userId, limit = 10) {
  const result = await db.query(
    `SELECT action, entity_id, timestamp FROM audit_log WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

// Suivi en temps réel : employés actifs, tâches réellement en cours (session active), tâches en retard
async function computeRealtimeDashboard() {
  const employeesResult = await db.query(
    `SELECT id, full_name, position FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIF' ORDER BY full_name ASC`
  );

  const statsResult = await db.query(`
    SELECT
      (SELECT COUNT(DISTINCT employee_id) FROM timelog
       WHERE end_time IS NULL AND start_time::date = CURRENT_DATE)::INTEGER AS active_employees,
      (SELECT COUNT(*) FROM tasks t WHERE t.status = 'EN_COURS'
       AND EXISTS (SELECT 1 FROM timelog tl WHERE tl.task_id = t.id AND tl.end_time IS NULL))::INTEGER AS tasks_in_progress,
      (SELECT COUNT(*) FROM tasks WHERE deadline < CURRENT_DATE AND status != 'CONFIRMEE')::INTEGER AS tasks_late
  `);

  const employees = await Promise.all(
    employeesResult.rows.map(async (employee) => {
      const todoResult = await db.query(
        `SELECT id, title, priority FROM tasks WHERE assigned_to = $1 AND status = 'VALIDEE' ORDER BY deadline ASC`,
        [employee.id]
      );

      const inProgressResult = await db.query(
        `SELECT t.id, t.title, t.priority, tl.start_time AS session_start_time
         FROM tasks t
         JOIN timelog tl ON tl.task_id = t.id AND tl.end_time IS NULL
         WHERE t.assigned_to = $1 AND t.status = 'EN_COURS'`,
        [employee.id]
      );

      const doneResult = await db.query(
        `SELECT t.id, t.title,
                COALESCE((SELECT SUM(duration_seconds) FROM timelog WHERE task_id = t.id), 0)::BIGINT AS total_duration_seconds
         FROM tasks t
         WHERE t.assigned_to = $1 AND t.status IN ('TERMINEE', 'CONFIRMEE')`,
        [employee.id]
      );

      return {
        id: employee.id,
        full_name: employee.full_name,
        position: employee.position,
        todo: todoResult.rows,
        in_progress: inProgressResult.rows,
        done: doneResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          total_duration_seconds: Number(row.total_duration_seconds),
        })),
      };
    })
  );

  const stats = statsResult.rows[0];

  return {
    stats: {
      active_employees: stats.active_employees,
      tasks_in_progress: stats.tasks_in_progress,
      tasks_late: stats.tasks_late,
    },
    employees,
  };
}

async function findAuditLog({ entityType, userId, limit = 50 } = {}) {
  const conditions = [];
  const params = [];

  if (entityType) {
    params.push(entityType);
    conditions.push(`a.entity_type = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`a.user_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const result = await db.query(
    `SELECT a.id, a.user_id, u.full_name AS user_name, a.action, a.entity_type, a.entity_id, a.details, a.timestamp
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.timestamp DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
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
  findComments,
  createComment,
  findAttachments,
  findAttachmentById,
  createAttachment,
  deleteAttachment,
  findLateTasks,
  findTasksForEmployee,
  computeEmployeeStats,
  findRecentAuditForUser,
  computeRealtimeDashboard,
  findAuditLog,
};
