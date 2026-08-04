const db = require('../config/database');

// Liste des annonces (plus récentes d'abord) avec : nom de l'auteur, si l'utilisateur courant
// l'a lue, et le nombre total de lecteurs.
async function list(userId) {
  const result = await db.query(
    `SELECT a.id, a.title, a.body, a.created_at, a.updated_at, a.author_id,
            a.is_important, a.is_pinned, a.image_url,
            (a.image_path IS NOT NULL) AS has_image,
            EXISTS (SELECT 1 FROM user_avatars av WHERE av.user_id = a.author_id) AS author_has_avatar,
            author.full_name AS author_name, author.role AS author_role,
            (ar_me.user_id IS NOT NULL) AS is_read,
            (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id)::int AS read_count
       FROM announcements a
       LEFT JOIN users author ON author.id = a.author_id
       LEFT JOIN announcement_reads ar_me ON ar_me.announcement_id = a.id AND ar_me.user_id = $1
      ORDER BY a.is_pinned DESC, a.created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function findById(id, userId) {
  const result = await db.query(
    `SELECT a.id, a.title, a.body, a.created_at, a.updated_at, a.author_id,
            a.is_important, a.is_pinned, a.image_url, a.image_path,
            (a.image_path IS NOT NULL) AS has_image,
            author.full_name AS author_name, author.role AS author_role,
            (ar_me.user_id IS NOT NULL) AS is_read
       FROM announcements a
       LEFT JOIN users author ON author.id = a.author_id
       LEFT JOIN announcement_reads ar_me ON ar_me.announcement_id = a.id AND ar_me.user_id = $2
      WHERE a.id = $1`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function create({ authorId, title, body, isImportant = false, isPinned = false, imagePath = null }) {
  // Une seule annonce épinglée à la fois : on dépingle les autres avant.
  if (isPinned) await db.query('UPDATE announcements SET is_pinned = false WHERE is_pinned = true');
  const result = await db.query(
    `INSERT INTO announcements (author_id, title, body, is_important, is_pinned, image_path)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, title, body, is_important, is_pinned, created_at`,
    [authorId, title, body, isImportant, isPinned, imagePath]
  );
  return result.rows[0];
}

// imagePath : nouveau chemin de fichier, ou undefined pour conserver l'image existante.
async function update(id, { title, body, isImportant = false, isPinned = false, imagePath }) {
  if (isPinned) await db.query('UPDATE announcements SET is_pinned = false WHERE is_pinned = true AND id <> $1', [id]);
  const setImage = imagePath !== undefined;
  const result = await db.query(
    `UPDATE announcements
        SET title = $2, body = $3, is_important = $4, is_pinned = $5,
            image_path = CASE WHEN $6 THEN $7 ELSE image_path END,
            updated_at = now()
      WHERE id = $1
      RETURNING id, title, body, is_important, is_pinned, updated_at`,
    [id, title, body, isImportant, isPinned, setImage, setImage ? imagePath : null]
  );
  return result.rows[0] || null;
}

async function remove(id) {
  await db.query('DELETE FROM announcements WHERE id = $1', [id]);
}

// Chemin du fichier image uploadé (pour le servir ou supprimer l'ancien).
async function findImagePath(id) {
  const result = await db.query('SELECT image_path FROM announcements WHERE id = $1', [id]);
  return result.rows[0]?.image_path || null;
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
  findImagePath,
  markRead,
  findReaders,
  unreadCount,
  findLatestUnread,
};
