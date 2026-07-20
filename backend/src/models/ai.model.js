const db = require('../config/database');

async function createConversation({ adminId, sessionId, question, answer, contextData }) {
  const result = await db.query(
    `INSERT INTO ai_conversations (admin_id, session_id, question, answer, context_data)
     VALUES ($1, COALESCE($2, gen_random_uuid()), $3, $4, $5)
     RETURNING id, session_id, question, answer, created_at`,
    [adminId, sessionId || null, question, answer, contextData ? JSON.stringify(contextData) : null]
  );
  return result.rows[0];
}

async function findConversations(adminId, limit = 200) {
  const result = await db.query(
    `SELECT id, session_id, question, answer, created_at FROM ai_conversations
     WHERE admin_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [adminId, limit]
  );
  return result.rows;
}

module.exports = { createConversation, findConversations };
