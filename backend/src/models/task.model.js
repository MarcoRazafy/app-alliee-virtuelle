const db = require('../config/database');
const sessionModel = require('./session.model');
const realtime = require('../realtime/io');
const { computeCompletionRate } = require('../utils/kpi');

const TASK_STATUS = {
  DECLARED: 'DECLAREE',
  VALIDATED: 'VALIDEE',
  IN_PROGRESS: 'EN_COURS',
  DONE: 'TERMINEE',
  CONFIRMED: 'CONFIRMEE',
};

// DECLAREE n'est pas encore visible à l'employé (DECISIONS.md)
async function findAssignedTasks(userId, { status, priority, deadline, listId } = {}) {
  // Les propositions DECLAREE restent masquées jusqu'à l'approbation admin.
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
  if (listId) {
    params.push(listId);
    conditions.push(`list_id = $${params.length}`);
  }

  const result = await db.query(
    `SELECT t.id, t.title, t.description, t.priority, t.status, t.deadline, t.list_id, t.parent_task_id,
            t.client_name, t.client_email, tl.name AS list_name
     FROM tasks t
     LEFT JOIN task_lists tl ON tl.id = t.list_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.deadline ASC`,
    params
  );
  return result.rows;
}

// Vue admin : toutes les tâches, tous employés confondus (nécessaire pour confirm/reject)
async function findAllTasks({ status, priority, deadline, listId, activeOnly = false } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (priority) {
    params.push(priority);
    conditions.push(`t.priority = $${params.length}`);
  }
  if (deadline) {
    params.push(deadline);
    conditions.push(`t.deadline = $${params.length}`);
  }
  if (listId) {
    params.push(listId);
    conditions.push(`t.list_id = $${params.length}`);
  }
  if (activeOnly) {
    conditions.push(`(t.status != 'CONFIRMEE' OR t.updated_at > now() - INTERVAL '5 days')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT t.id, t.title, t.description, t.priority, t.status, t.deadline, t.assigned_to, t.list_id,
            t.parent_task_id, t.client_name, t.client_email, t.updated_at,
            CASE WHEN t.status = 'CONFIRMEE' THEN t.updated_at + INTERVAL '5 days' END AS auto_hide_at,
            u.full_name AS assigned_to_name
     FROM tasks t
     JOIN users u ON u.id = t.assigned_to
     ${where}
     ORDER BY t.deadline ASC`,
    params
  );
  return result.rows;
}

async function findById(taskId) {
  const result = await db.query(
    `SELECT t.id, t.title, t.description, t.assigned_to, t.created_by, t.priority, t.status,
            t.start_date, t.deadline, t.list_id, t.parent_task_id, t.client_name, t.client_email,
            u.full_name AS assignee_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.id = $1`,
    [taskId]
  );
  return result.rows[0] || null;
}

async function create({
  title,
  description,
  assignedTo,
  createdBy,
  priority,
  deadline,
  startDate,
  listId,
  parentTaskId,
  clientName,
  clientEmail,
  status,
}) {
  const result = await db.query(
    `INSERT INTO tasks (
       title, description, assigned_to, created_by, priority, deadline, start_date, status,
       list_id, parent_task_id, client_name, client_email
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, status`,
    [
      title,
      description,
      assignedTo,
      createdBy,
      priority,
      deadline,
      startDate || null,
      status || TASK_STATUS.DECLARED,
      listId || null,
      parentTaskId || null,
      clientName || null,
      clientEmail || null,
    ]
  );
  return result.rows[0];
}

// Sous-tâches d'une tâche parente
async function findSubtasks(parentTaskId) {
  const result = await db.query(
    `SELECT id, title, priority, status, deadline
     FROM tasks WHERE parent_task_id = $1 ORDER BY created_at ASC`,
    [parentTaskId]
  );
  return result.rows;
}

// Vue détail "ClickUp" : tâche + fil d'Ariane (space/folder/list) + sous-tâches + temps total
async function getTaskDetail(taskId) {
  const taskResult = await db.query(
    `SELECT t.id, t.title, t.description, t.assigned_to, t.created_by, t.priority, t.status,
            t.start_date, t.deadline, t.list_id, t.parent_task_id, t.client_name, t.client_email,
            u.full_name AS assigned_to_name,
            tl.id AS list_id_ref, tl.name AS list_name,
            tf.id AS folder_id, tf.name AS folder_name,
            ts.id AS space_id, ts.name AS space_name
     FROM tasks t
     JOIN users u ON u.id = t.assigned_to
     LEFT JOIN task_lists tl ON tl.id = t.list_id
     LEFT JOIN task_folders tf ON tf.id = tl.folder_id
     LEFT JOIN task_spaces ts ON ts.id = tf.space_id
     WHERE t.id = $1`,
    [taskId]
  );

  const task = taskResult.rows[0];
  if (!task) return null;

  const [subtasks, timeResult] = await Promise.all([
    findSubtasks(taskId),
    db.query('SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT AS total_seconds FROM timelog WHERE task_id = $1', [
      taskId,
    ]),
  ]);

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assigned_to: task.assigned_to,
    assigned_to_name: task.assigned_to_name,
    priority: task.priority,
    status: task.status,
    start_date: task.start_date,
    deadline: task.deadline,
    client_name: task.client_name,
    client_email: task.client_email,
    breadcrumb: task.space_id
      ? { space: { id: task.space_id, name: task.space_name }, folder: { id: task.folder_id, name: task.folder_name }, list: { id: task.list_id_ref, name: task.list_name } }
      : null,
    subtasks,
    total_duration_seconds: Number(timeResult.rows[0].total_seconds),
  };
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
  // Temps réel : signale une nouvelle activité pour rafraîchir les notifications. Chaque
  // client re-fetch (la visibilité par utilisateur, dont l'exclusion de ses propres actions,
  // reste appliquée côté serveur). actorId permet à l'auteur d'ignorer sa propre action.
  realtime.broadcast('notification:new', { actorId: userId, action, entityType });
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

// Saisie manuelle d'un temps de travail (admin) : chrono oublié, on enregistre a posteriori
// une plage début→fin déjà terminée. La durée est calculée par la BD.
async function addManualTimelog(taskId, employeeId, startTime, endTime, client = db) {
  const result = await client.query(
    `INSERT INTO timelog (task_id, employee_id, start_time, end_time, duration_seconds)
     VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM ($4::timestamp - $3::timestamp))::INTEGER)
     RETURNING id, task_id, start_time, end_time, duration_seconds`,
    [taskId, employeeId, startTime, endTime]
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
            t.title, t.description, t.priority, t.status, t.deadline, t.list_id, tl.name AS list_name
     FROM user_daily_selection s
     JOIN tasks t ON t.id = s.task_id
     LEFT JOIN task_lists tl ON tl.id = t.list_id
     WHERE s.user_id = $1 AND s.date = $2
     ORDER BY s.selected_order ASC`,
    [userId, date]
  );
  return result.rows;
}

async function validateDailySelection(userId, date) {
  const result = await db.query(
    `UPDATE user_daily_selection SET validated_at = now()
     WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
  return result.rowCount;
}

// Remplace la sélection du jour par la liste ordonnée reçue (drag-drop côté front)
async function replaceDailySelection(userId, date, taskIds) {
  return db.withTransaction(async (client) => {
    await client.query('DELETE FROM user_daily_selection WHERE user_id = $1 AND date = $2', [userId, date]);

    if (taskIds.length === 0) return;

    const params = [];
    const placeholders = taskIds.map((taskId, i) => {
      params.push(userId, taskId, i + 1, date);
      const offset = i * 4;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    });

    await client.query(
      `INSERT INTO user_daily_selection (user_id, task_id, selected_order, date) VALUES ${placeholders.join(', ')}`,
      params
    );
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

// Suppression d'une tâche (admin). Les tables liées (historique, commentaires, pièces jointes,
// chronos, demandes, sous-tâches via parent_task_id) sont supprimées en cascade par la BD.
async function deleteTask(taskId, client = db) {
  await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
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
    `SELECT a.action, a.entity_type, a.entity_id, a.timestamp, t.title AS task_title
     FROM audit_log a
     LEFT JOIN tasks t ON a.entity_type = 'task' AND t.id = a.entity_id
     WHERE a.user_id = $1
     ORDER BY a.timestamp DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

// Suivi en temps réel : employés actifs, tâches réellement en cours (session active), tâches en retard
async function computeRealtimeDashboard() {
  const employeesResult = await db.query(
    `SELECT u.id, u.full_name, u.position,
            EXISTS (SELECT 1 FROM user_avatars ua WHERE ua.user_id = u.id) AS has_avatar
     FROM users u WHERE u.role = 'EMPLOYEE' AND u.status = 'ACTIF' ORDER BY u.full_name ASC`
  );

  const statsResult = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM tasks t WHERE t.status = 'EN_COURS'
       AND EXISTS (SELECT 1 FROM timelog tl WHERE tl.task_id = t.id AND tl.end_time IS NULL))::INTEGER AS tasks_in_progress,
      (SELECT COUNT(*) FROM tasks WHERE deadline < CURRENT_DATE AND status != 'CONFIRMEE')::INTEGER AS tasks_late
  `);

  // 3 requêtes groupées sur tous les employés plutôt que 3 requêtes par employé (N+1)
  const employeeIds = employeesResult.rows.map((employee) => employee.id);

  const [todoResult, inProgressResult, doneResult, connectedUserIds] = await Promise.all([
    db.query(
      // Uniquement les tâches que l'employé a sélectionnées dans « Ma journée » aujourd'hui.
      `SELECT id, assigned_to, title, priority FROM tasks
       WHERE assigned_to = ANY($1::uuid[]) AND status = 'VALIDEE'
         AND EXISTS (SELECT 1 FROM user_daily_selection uds
                     WHERE uds.task_id = tasks.id AND uds.user_id = tasks.assigned_to AND uds.date = CURRENT_DATE)
       ORDER BY deadline ASC`,
      [employeeIds]
    ),
    db.query(
      // Toutes les tâches EN_COURS de la sélection du jour (LEFT JOIN : qu'un chrono soit
      // actif ou non). session_start_time n'est renseigné que si un chrono tourne réellement.
      `SELECT t.id, t.assigned_to, t.title, t.priority, tl.start_time AS session_start_time
       FROM tasks t
       LEFT JOIN timelog tl ON tl.task_id = t.id AND tl.end_time IS NULL
       WHERE t.assigned_to = ANY($1::uuid[]) AND t.status = 'EN_COURS'
         AND EXISTS (SELECT 1 FROM user_daily_selection uds
                     WHERE uds.task_id = t.id AND uds.user_id = t.assigned_to AND uds.date = CURRENT_DATE)`,
      [employeeIds]
    ),
    db.query(
      `SELECT t.id, t.assigned_to, t.title,
              COALESCE((SELECT SUM(duration_seconds) FROM timelog WHERE task_id = t.id), 0)::BIGINT AS total_duration_seconds
       FROM tasks t
       WHERE t.assigned_to = ANY($1::uuid[]) AND t.status IN ('TERMINEE', 'CONFIRMEE')
         AND EXISTS (SELECT 1 FROM user_daily_selection uds
                     WHERE uds.task_id = t.id AND uds.user_id = t.assigned_to AND uds.date = CURRENT_DATE)`,
      [employeeIds]
    ),
    // "Actif" = réellement en ligne (définition partagée : session ouverte, pas de
    // déconnexion signalée, heartbeat récent) — pas juste logout_at NULL.
    sessionModel.findLiveUserIds(employeeIds),
  ]);

  const connectedIds = new Set(connectedUserIds);

  function groupByAssignee(rows) {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.assigned_to)) map.set(row.assigned_to, []);
      map.get(row.assigned_to).push(row);
    });
    return map;
  }

  const todoByEmployee = groupByAssignee(todoResult.rows);
  const inProgressByEmployee = groupByAssignee(inProgressResult.rows);
  const doneByEmployee = groupByAssignee(doneResult.rows);

  const employees = employeesResult.rows.map((employee) => ({
    id: employee.id,
    full_name: employee.full_name,
    position: employee.position,
    is_connected: connectedIds.has(employee.id),
    todo: (todoByEmployee.get(employee.id) || []).map((row) => ({
      id: row.id,
      title: row.title,
      priority: row.priority,
    })),
    in_progress: (inProgressByEmployee.get(employee.id) || []).map((row) => ({
      id: row.id,
      title: row.title,
      priority: row.priority,
      session_start_time: row.session_start_time,
    })),
    done: (doneByEmployee.get(employee.id) || []).map((row) => ({
      id: row.id,
      title: row.title,
      total_duration_seconds: Number(row.total_duration_seconds),
    })),
  }));

  const stats = statsResult.rows[0];

  return {
    stats: {
      active_employees: connectedIds.size,
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
  findSubtasks,
  getTaskDetail,
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
  deleteTask,
  addManualTimelog,
  findLateTasks,
  findTasksForEmployee,
  computeEmployeeStats,
  findRecentAuditForUser,
  computeRealtimeDashboard,
  findAuditLog,
};
