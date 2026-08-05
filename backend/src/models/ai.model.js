const db = require('../config/database');

async function createConversation({ adminId, sessionId, question, answer, contextData, attachment = null }) {
  const result = await db.query(
    `INSERT INTO ai_conversations (admin_id, session_id, question, answer, context_data, attachment_path, attachment_name, attachment_type)
     VALUES ($1, COALESCE($2, gen_random_uuid()), $3, $4, $5, $6, $7, $8)
     RETURNING id, session_id, question, answer, title, created_at,
               attachment_name, attachment_type, (attachment_path IS NOT NULL) AS has_attachment`,
    [adminId, sessionId || null, question, answer, contextData ? JSON.stringify(contextData) : null,
     attachment?.path || null, attachment?.name || null, attachment?.type || null]
  );
  return result.rows[0];
}

async function findConversations(adminId, limit = 200) {
  const result = await db.query(
    `SELECT id, session_id, question, answer, title, created_at,
            attachment_name, attachment_type, (attachment_path IS NOT NULL) AS has_attachment
     FROM ai_conversations
     WHERE admin_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [adminId, limit]
  );
  return result.rows;
}

// Derniers échanges d'une session (une discussion), dans l'ordre chronologique, pour donner
// de la MÉMOIRE au chatbot : on renvoie ces question/réponse au modèle avec la nouvelle question.
// excludeId permet d'ignorer l'échange en cours (cas de la ré-édition d'un message).
async function findSessionHistory(sessionId, adminId, { limit = 8, excludeId = null } = {}) {
  if (!sessionId) return [];
  const params = [sessionId, adminId];
  let where = 'session_id = $1 AND admin_id = $2';
  if (excludeId) {
    params.push(excludeId);
    where += ` AND id <> $${params.length}`;
  }
  params.push(limit);
  const result = await db.query(
    `SELECT question, answer FROM ai_conversations
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return result.rows.reverse(); // du plus ancien au plus récent
}

async function findConversationById(id, adminId) {
  const result = await db.query(
    `SELECT * FROM ai_conversations WHERE id = $1 AND admin_id = $2`,
    [id, adminId]
  );
  return result.rows[0] || null;
}

async function deleteConversation(id, adminId) {
  const result = await db.query(
    `DELETE FROM ai_conversations WHERE id = $1 AND admin_id = $2 RETURNING id`,
    [id, adminId]
  );
  return result.rowCount;
}

async function deleteSession(sessionId, adminId) {
  const result = await db.query(
    `DELETE FROM ai_conversations WHERE session_id = $1 AND admin_id = $2 RETURNING id`,
    [sessionId, adminId]
  );
  return result.rowCount;
}

async function updateConversation(id, adminId, { question, answer }) {
  const result = await db.query(
    `UPDATE ai_conversations SET question = $3, answer = $4
     WHERE id = $1 AND admin_id = $2
     RETURNING id, session_id, question, answer, title, created_at,
               attachment_name, attachment_type, (attachment_path IS NOT NULL) AS has_attachment`,
    [id, adminId, question, answer]
  );
  return result.rows[0] || null;
}

// Titre stocké sur toutes les lignes de la session (une discussion) pour rester cohérent.
async function renameSession(sessionId, adminId, title) {
  const result = await db.query(
    `UPDATE ai_conversations SET title = $3 WHERE session_id = $1 AND admin_id = $2 RETURNING id`,
    [sessionId, adminId, title]
  );
  return result.rowCount;
}

module.exports = {
  createConversation,
  findConversations,
  findSessionHistory,
  findConversationById,
  deleteConversation,
  deleteSession,
  updateConversation,
  renameSession,
};
