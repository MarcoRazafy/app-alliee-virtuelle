const db = require('../config/database');

// Liste des annonces (plus récentes d'abord) avec : nom de l'auteur, si l'utilisateur courant
// l'a lue, et le nombre total de lecteurs.
async function list(userId) {
  const result = await db.query(
    `SELECT a.id, a.title, a.body, a.created_at, a.updated_at,
            author.full_name AS author_name,
            (ar_me.user_id IS NOT NULL) AS is_read,
            (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id)::int AS read_count
       FROM announcements a
       LEFT JOIN users author ON author.id = a.author_id
       LEFT JOIN announcement_reads ar_me ON ar_me.announcement_id = a.id AND ar_me.user_id = $1
      ORDER BY a.created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function findById(id, userId) {
  const result = await db.query(
    `SELECT a.id, a.title, a.body, a.created_at, a.updated_at, a.author_id,
            author.full_name AS author_name,
            (ar_me.user_id IS NOT NULL) AS is_read
       FROM announcements a
       LEFT JOIN users author ON author.id = a.author_id
       LEFT JOIN announcement_reads ar_me ON ar_me.announcement_id = a.id AND ar_me.user_id = $2
      WHERE a.id = $1`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function create({ authorId, title, body }) {
  const result = await db.query(
    `INSERT INTO announcements (author_id, title, body)
     VALUES ($1, $2, $3)
     RETURNING id, title, body, created_at`,
    [authorId, title, body]
  );
  return result.rows[0];
}

async function update(id, { title, body }) {
  const result = await db.query(
    `UPDATE announcements SET title = $2, body = $3, updated_at = now()
     WHERE id = $1
     RETURNING id, title, body, updated_at`,
    [id, title, body]
  );
  return result.rows[0] || null;
}

async function remove(id) {
  await db.query('DELETE FROM announcements WHERE id = $1', [id]);
}

// Accusé de lecture (idempotent : ne remet pas à jour la date si déjà lu).
async function markRead(announcementId, userId) {
  await db.query(
    `INSERT INTO announcement_reads (announcement_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (announcement_id, user_id) DO NOTHING`,
    [announcementId, userId]
  );
}

// Lecteurs d'une annonce (visible par tout le monde).
async function findReaders(announcementId) {
  const result = await db.query(
    `SELECT u.id, u.full_name, r.read_at
       FROM announcement_reads r
       JOIN users u ON u.id = r.user_id
      WHERE r.announcement_id = $1
      ORDER BY r.read_at ASC`,
    [announcementId]
  );
  return result.rows;
}

// Nombre d'annonces non lues par l'utilisateur (pour la pastille).
async function unreadCount(userId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM announcements a
      WHERE NOT EXISTS (
        SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1
      )`,
    [userId]
  );
  return result.rows[0].count;
}

// L'annonce non lue la plus récente (pour le popup).
async function findLatestUnread(userId) {
  const result = await db.query(
    `SELECT a.id, a.title, a.body, a.created_at, author.full_name AS author_name
       FROM announcements a
       LEFT JOIN users author ON author.id = a.author_id
      WHERE NOT EXISTS (
        SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1
      )
      ORDER BY a.created_at DESC
      LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = {
  list,
  findById,
  create,
  update,
  remove,
  markRead,
  findReaders,
  unreadCount,
  findLatestUnread,
};
