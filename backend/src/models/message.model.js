const db = require('../config/database');

async function findGlobalMessages() {
  const result = await db.query(
    `SELECT m.id, m.content, m.created_at, m.author_id, u.full_name AS author_name
     FROM messages m
     JOIN users u ON u.id = m.author_id
     WHERE m.channel_type = 'GLOBAL'
     ORDER BY m.created_at ASC`
  );
  return result.rows;
}

async function createGlobalMessage(authorId, content) {
  const result = await db.query(
    `INSERT INTO messages (author_id, content, channel_type)
     VALUES ($1, $2, 'GLOBAL')
     RETURNING id, content, created_at, author_id`,
    [authorId, content]
  );
  return result.rows[0];
}

async function findConversationsForUser(userId) {
  const result = await db.query(
    `SELECT
       c.id AS conversation_id,
       other.id AS other_user_id,
       other.full_name AS other_user_name,
       c.last_message_at,
       (SELECT content FROM messages
        WHERE channel_type = 'PRIVATE'
          AND ((author_id = $1 AND recipient_id = other.id) OR (author_id = other.id AND recipient_id = $1))
        ORDER BY created_at DESC LIMIT 1) AS last_message_content,
       (SELECT COUNT(*)::INTEGER FROM messages
        WHERE channel_type = 'PRIVATE' AND recipient_id = $1 AND author_id = other.id AND is_read = FALSE) AS unread_count
     FROM message_conversations c
     JOIN users other ON other.id = CASE WHEN c.participant1_id = $1 THEN c.participant2_id ELSE c.participant1_id END
     WHERE c.participant1_id = $1 OR c.participant2_id = $1
     ORDER BY c.last_message_at DESC`,
    [userId]
  );
  return result.rows;
}

async function findConversationBetween(userId1, userId2) {
  const result = await db.query(
    `SELECT id FROM message_conversations
     WHERE (participant1_id = $1 AND participant2_id = $2)
        OR (participant1_id = $2 AND participant2_id = $1)`,
    [userId1, userId2]
  );
  return result.rows[0] || null;
}

async function createConversation(userId1, userId2) {
  const result = await db.query(
    `INSERT INTO message_conversations (participant1_id, participant2_id, last_message_at)
     VALUES ($1, $2, now())
     RETURNING id`,
    [userId1, userId2]
  );
  return result.rows[0];
}

async function touchConversation(conversationId) {
  await db.query(`UPDATE message_conversations SET last_message_at = now() WHERE id = $1`, [conversationId]);
}

async function findPrivateMessages(userId, otherUserId) {
  const result = await db.query(
    `SELECT m.id, m.content, m.created_at, m.author_id, m.is_read, u.full_name AS author_name
     FROM messages m
     JOIN users u ON u.id = m.author_id
     WHERE m.channel_type = 'PRIVATE'
       AND ((m.author_id = $1 AND m.recipient_id = $2) OR (m.author_id = $2 AND m.recipient_id = $1))
     ORDER BY m.created_at ASC`,
    [userId, otherUserId]
  );
  return result.rows;
}

async function markAsRead(userId, otherUserId) {
  await db.query(
    `UPDATE messages SET is_read = TRUE
     WHERE channel_type = 'PRIVATE' AND recipient_id = $1 AND author_id = $2 AND is_read = FALSE`,
    [userId, otherUserId]
  );
}

async function createPrivateMessage(authorId, recipientId, content) {
  const result = await db.query(
    `INSERT INTO messages (author_id, recipient_id, content, channel_type, is_read)
     VALUES ($1, $2, $3, 'PRIVATE', FALSE)
     RETURNING id, content, created_at, author_id, recipient_id`,
    [authorId, recipientId, content]
  );
  return result.rows[0];
}

module.exports = {
  findGlobalMessages,
  createGlobalMessage,
  findConversationsForUser,
  findConversationBetween,
  createConversation,
  touchConversation,
  findPrivateMessages,
  markAsRead,
  createPrivateMessage,
};
