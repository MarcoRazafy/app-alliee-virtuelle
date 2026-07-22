const db = require('../config/database');

// Demandes de tâche supplémentaire (cf. migration 012). Un employé qui a validé sa
// journée demande une tâche précise ; l'admin approuve (→ tâche ajoutée à la sélection
// du jour) ou refuse.

async function create({ userId, taskId, date, message }) {
  const { rows } = await db.query(
    `INSERT INTO extra_task_requests (user_id, task_id, date, message)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, taskId, date, message || null]
  );
  return rows[0];
}

async function findPending(userId, taskId, date) {
  const { rows } = await db.query(
    `SELECT * FROM extra_task_requests
     WHERE user_id = $1 AND task_id = $2 AND date = $3 AND status = 'PENDING'`,
    [userId, taskId, date]
  );
  return rows[0] || null;
}

// Demandes d'un employé pour un jour donné (tous statuts), avec le titre de la tâche.
async function findByUserForDate(userId, date) {
  const { rows } = await db.query(
    `SELECT r.id, r.task_id, r.status, r.message, r.admin_note, r.reviewed_at, r.created_at,
            t.title, t.priority, t.deadline
     FROM extra_task_requests r
     JOIN tasks t ON t.id = r.task_id
     WHERE r.user_id = $1 AND r.date = $2
     ORDER BY r.created_at DESC`,
    [userId, date]
  );
  return rows;
}

// Liste pour l'admin, enrichie de l'employé et de la tâche. Filtrable par statut.
async function findForAdmin({ status } = {}) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE r.status = $1`;
  }
  const { rows } = await db.query(
    `SELECT r.id, r.status, r.message, r.admin_note, r.date, r.created_at, r.reviewed_at,
            r.user_id, u.full_name, u.position,
            EXISTS (SELECT 1 FROM user_avatars a WHERE a.user_id = u.id) AS has_avatar,
            r.task_id, t.title, t.description, t.priority, t.status AS task_status, t.deadline,
            t.list_id, tl.name AS list_name
     FROM extra_task_requests r
     JOIN users u ON u.id = r.user_id
     JOIN tasks t ON t.id = r.task_id
     LEFT JOIN task_lists tl ON tl.id = t.list_id
     ${where}
     ORDER BY r.status = 'PENDING' DESC, r.created_at DESC`,
    params
  );
  return rows;
}

async function countPending() {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM extra_task_requests WHERE status = 'PENDING'`
  );
  return rows[0].n;
}

async function findById(id) {
  const { rows } = await db.query(`SELECT * FROM extra_task_requests WHERE id = $1`, [id]);
  return rows[0] || null;
}

// Approuve la demande ET ajoute la tâche à la sélection du jour de l'employé (déjà validée),
// pour qu'elle apparaisse aussitôt dans « Mes tâches aujourd'hui ». Idempotent : ne double
// jamais la sélection si la tâche y est déjà.
async function approve(id, adminId) {
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE extra_task_requests
       SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING *`,
      [id, adminId]
    );
    if (rows.length === 0) return null;
    const req = rows[0];

    const exists = await client.query(
      `SELECT 1 FROM user_daily_selection WHERE user_id = $1 AND task_id = $2 AND date = $3`,
      [req.user_id, req.task_id, req.date]
    );
    if (exists.rowCount === 0) {
      const ord = await client.query(
        `SELECT COALESCE(MAX(selected_order), 0) + 1 AS next
         FROM user_daily_selection WHERE user_id = $1 AND date = $2`,
        [req.user_id, req.date]
      );
      await client.query(
        `INSERT INTO user_daily_selection (user_id, task_id, selected_order, date, validated_at)
         VALUES ($1, $2, $3, $4, now())`,
        [req.user_id, req.task_id, ord.rows[0].next, req.date]
      );
    }
    return req;
  });
}

async function reject(id, adminId, note) {
  const { rows } = await db.query(
    `UPDATE extra_task_requests
     SET status = 'REJECTED', reviewed_by = $2, reviewed_at = now(), admin_note = $3
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id, adminId, note || null]
  );
  return rows[0] || null;
}

module.exports = {
  create,
  findPending,
  findByUserForDate,
  findForAdmin,
  countPending,
  findById,
  approve,
  reject,
};
