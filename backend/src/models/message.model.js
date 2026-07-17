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

const GROUP_CARD_SELECT = `
  SELECT
    g.id,
    g.name,
    g.created_by,
    creator.full_name AS created_by_name,
    g.last_message_at,
    g.created_at,
    (SELECT COUNT(*)::INTEGER
     FROM message_group_members member_count
     WHERE member_count.group_id = g.id) AS member_count,
    COALESCE(
      (SELECT json_agg(
         json_build_object(
           'id', member_user.id,
           'full_name', member_user.full_name,
           'role', member_user.role,
           'has_avatar', EXISTS (
             SELECT 1 FROM user_avatars avatar WHERE avatar.user_id = member_user.id
           )
         )
         ORDER BY member_user.full_name
       )
       FROM message_group_members member_list
       JOIN users member_user ON member_user.id = member_list.user_id
       WHERE member_list.group_id = g.id),
      '[]'::json
    ) AS members,
    (SELECT group_message.content
     FROM messages group_message
     WHERE group_message.channel_type = 'GROUP' AND group_message.group_id = g.id
     ORDER BY group_message.created_at DESC
     LIMIT 1) AS last_message_content,
    (SELECT COUNT(*)::INTEGER
     FROM messages unread_message
     WHERE unread_message.channel_type = 'GROUP'
       AND unread_message.group_id = g.id
       AND unread_message.author_id != $1
       AND unread_message.created_at > membership.last_read_at) AS unread_count
  FROM message_groups g
  JOIN message_group_members membership
    ON membership.group_id = g.id AND membership.user_id = $1
  LEFT JOIN users creator ON creator.id = g.created_by`;

async function findGroupsForUser(userId) {
  const result = await db.query(
    `${GROUP_CARD_SELECT}
     ORDER BY g.last_message_at DESC, g.name ASC`,
    [userId]
  );
  return result.rows;
}

async function findGroupForUser(groupId, userId) {
  const result = await db.query(
    `${GROUP_CARD_SELECT}
     WHERE g.id = $2`,
    [userId, groupId]
  );
  return result.rows[0] || null;
}

async function createGroup({ name, creatorId, memberIds }, client = db) {
  const groupResult = await client.query(
    `INSERT INTO message_groups (name, created_by)
     VALUES ($1, $2)
     RETURNING id, name, created_by, last_message_at, created_at`,
    [name, creatorId]
  );
  const group = groupResult.rows[0];

  await client.query(
    `INSERT INTO message_group_members (group_id, user_id)
     SELECT $1, member_id
     FROM unnest($2::uuid[]) AS members(member_id)
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    [group.id, memberIds]
  );

  return group;
}

async function findGroupMessages(groupId) {
  const result = await db.query(
    `SELECT m.id, m.content, m.created_at, m.author_id, u.full_name AS author_name
     FROM messages m
     JOIN users u ON u.id = m.author_id
     WHERE m.channel_type = 'GROUP' AND m.group_id = $1
     ORDER BY m.created_at ASC`,
    [groupId]
  );
  return result.rows;
}

async function markGroupAsRead(groupId, userId) {
  await db.query(
    `UPDATE message_group_members
     SET last_read_at = now()
     WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId]
  );
}

async function createGroupMessage(groupId, authorId, content, client = db) {
  const result = await client.query(
    `WITH inserted AS (
       INSERT INTO messages (author_id, content, channel_type, group_id)
       VALUES ($1, $2, 'GROUP', $3)
       RETURNING id, content, created_at, author_id, group_id
     )
     SELECT inserted.*, author.full_name AS author_name
     FROM inserted
     JOIN users author ON author.id = inserted.author_id`,
    [authorId, content, groupId]
  );
  await client.query('UPDATE message_groups SET last_message_at = now(), updated_at = now() WHERE id = $1', [groupId]);
  await client.query(
    'UPDATE message_group_members SET last_read_at = now() WHERE group_id = $1 AND user_id = $2',
    [groupId, authorId]
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
  findGroupsForUser,
  findGroupForUser,
  createGroup,
  findGroupMessages,
  markGroupAsRead,
  createGroupMessage,
};
