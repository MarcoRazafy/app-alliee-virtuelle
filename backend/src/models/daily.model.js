const db = require('../config/database');

// To Do d'un employé = sa sélection « Ma journée » validée (user_daily_selection).
// Daily  d'un employé = les tâches qu'il a glissées comme faites (user_daily_done).
// Chaque tâche porte le nom de son projet (liste) pour le regroupement côté front.

// --- Sélection Daily (tâches faites), par jour ---
async function findDailyDone(userId, date) {
  const result = await db.query(
    `SELECT d.task_id AS id, t.title, t.priority, t.deadline, d.created_at,
            tl.name AS list_name, tf.name AS folder_name, ts.name AS space_name
     FROM user_daily_done d
     JOIN tasks t ON t.id = d.task_id
     LEFT JOIN task_lists tl ON tl.id = t.list_id
     LEFT JOIN task_folders tf ON tf.id = tl.folder_id
     LEFT JOIN task_spaces ts ON ts.id = tf.space_id
     WHERE d.user_id = $1 AND d.date = $2
     ORDER BY d.selected_order ASC`,
    [userId, date]
  );
  return result.rows;
}

async function replaceDailyDone(userId, date, taskIds) {
  return db.withTransaction(async (client) => {
    await client.query('DELETE FROM user_daily_done WHERE user_id = $1 AND date = $2', [userId, date]);
    if (taskIds.length === 0) return;
    const params = [];
    const placeholders = taskIds.map((taskId, i) => {
      params.push(userId, taskId, i + 1, date);
      const o = i * 4;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
    });
    await client.query(
      `INSERT INTO user_daily_done (user_id, task_id, selected_order, date) VALUES ${placeholders.join(', ')}`,
      params
    );
  });
}

// --- Vue admin : par employé, To Do (jour validé) + Daily (tâches faites) pour la date ---
async function getDailyOverview(date) {
  const employees = (
    await db.query(`SELECT id, full_name, position FROM users WHERE role = 'EMPLOYEE' ORDER BY full_name ASC`)
  ).rows;

  const todos = (
    await db.query(
      `SELECT s.user_id, t.id AS task_id, t.title, tl.name AS list_name, s.validated_at
       FROM user_daily_selection s
       JOIN tasks t ON t.id = s.task_id
       LEFT JOIN task_lists tl ON tl.id = t.list_id
       WHERE s.date = $1 AND s.validated_at IS NOT NULL
       ORDER BY s.selected_order ASC`,
      [date]
    )
  ).rows;

  const dailies = (
    await db.query(
      `SELECT d.user_id, t.id AS task_id, t.title, tl.name AS list_name, d.created_at
       FROM user_daily_done d
       JOIN tasks t ON t.id = d.task_id
       LEFT JOIN task_lists tl ON tl.id = t.list_id
       WHERE d.date = $1
       ORDER BY d.selected_order ASC`,
      [date]
    )
  ).rows;

  const byUser = new Map(
    employees.map((e) => [e.id, { ...e, todo: [], daily: [], todo_submitted_at: null, daily_submitted_at: null }])
  );
  for (const r of todos) {
    const u = byUser.get(r.user_id);
    if (!u) continue;
    u.todo.push({ task_id: r.task_id, title: r.title, list_name: r.list_name });
    if (r.validated_at && (!u.todo_submitted_at || r.validated_at > u.todo_submitted_at)) u.todo_submitted_at = r.validated_at;
  }
  for (const r of dailies) {
    const u = byUser.get(r.user_id);
    if (!u) continue;
    u.daily.push({ task_id: r.task_id, title: r.title, list_name: r.list_name });
    if (r.created_at && (!u.daily_submitted_at || r.created_at > u.daily_submitted_at)) u.daily_submitted_at = r.created_at;
  }

  return [...byUser.values()].filter((u) => u.todo.length > 0 || u.daily.length > 0);
}

module.exports = { findDailyDone, replaceDailyDone, getDailyOverview };
