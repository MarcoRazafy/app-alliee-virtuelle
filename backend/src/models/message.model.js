const db = require('../config/database');

// Colonnes d'un message enrichies pour l'affichage. Un message supprimé (deleted_at) masque
// son contenu et sa pièce jointe. `m` = alias de la table messages, `u` = auteur.
const MSG_COLS = `
  m.id, m.author_id, u.full_name AS author_name, m.channel_type,
  CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.content END AS content,
  m.created_at, m.edited_at, m.deleted_at,
  CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.attachment_name END AS attachment_name,
  CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.attachment_type END AS attachment_type,
  CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.attachment_size END AS attachment_size,
  (m.attachment_path IS NOT NULL AND m.deleted_at IS NULL) AS has_attachment
`;

// Réactions agrégées par emoji (count + mine = l'utilisateur courant a réagi). userParam = placeholder $N.
function reactionsSql(userParam) {
  return `COALESCE((
    SELECT json_agg(json_build_object('emoji', e.emoji, 'count', e.count, 'mine', e.mine) ORDER BY e.emoji)
    FROM (
      SELECT emoji, COUNT(*)::int AS count, bool_or(user_id = ${userParam}) AS mine
      FROM message_reactions WHERE message_id = m.id GROUP BY emoji
    ) e
  ), '[]'::json) AS reactions`;
}

// Aperçu de conversation : gère les messages supprimés et les pièces jointes seules.
function previewSql(subWhere) {
  return `(SELECT CASE
      WHEN deleted_at IS NOT NULL THEN 'Message supprimé'
      WHEN content IS NOT NULL AND content <> '' THEN content
      WHEN attachment_path IS NOT NULL THEN '📎 Pièce jointe'
      ELSE NULL END
    FROM messages WHERE ${subWhere} ORDER BY created_at DESC LIMIT 1)`;
}

async function findGlobalMessages(userId) {
  const result = await db.query(
    `SELECT ${MSG_COLS}, ${reactionsSql('$1')}
     FROM messages m
     JOIN users u ON u.id = m.author_id
     WHERE m.channel_type = 'GLOBAL'
     ORDER BY m.created_at ASC`,
    [userId]
  );
  return result.rows;
}

async function createGlobalMessage(authorId, content, attachment = null) {
  const result = await db.query(
    `INSERT INTO messages (author_id, content, channel_type, attachment_path, attachment_name, attachment_type, attachment_size)
     VALUES ($1, $2, 'GLOBAL', $3, $4, $5, $6)
     RETURNING id`,
    [authorId, content || null, attachment?.path || null, attachment?.name || null, attachment?.type || null, attachment?.size || null]
  );
  return findEnrichedMessageById(result.rows[0].id, authorId);
}

async function findConversationsForUser(userId) {
  const result = await db.query(
    `SELECT
       c.id AS conversation_id,
       other.id AS other_user_id,
       other.full_name AS other_user_name,
       c.last_message_at,
       ${previewSql(`channel_type = 'PRIVATE'
          AND ((author_id = $1 AND recipient_id = other.id) OR (author_id = other.id AND recipient_id = $1))`)} AS last_message_content,
       (SELECT COUNT(*)::INTEGER FROM messages
        WHERE channel_type = 'PRIVATE' AND recipient_id = $1 AND author_id = other.id AND is_read = FALSE AND deleted_at IS NULL) AS unread_count
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
    `SELECT ${MSG_COLS}, m.is_read, ${reactionsSql('$1')}
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

async function createPrivateMessage(authorId, recipientId, content, attachment = null) {
  const result = await db.query(
    `INSERT INTO messages (author_id, recipient_id, content, channel_type, is_read, attachment_path, attachment_name, attachment_type, attachment_size)
     VALUES ($1, $2, $3, 'PRIVATE', FALSE, $4, $5, $6, $7)
     RETURNING id`,
    [authorId, recipientId, content || null, attachment?.path || null, attachment?.name || null, attachment?.type || null, attachment?.size || null]
  );
  return findEnrichedMessageById(result.rows[0].id, authorId);
}

const GROUP_CARD_SELECT = `
  SELECT
    g.id,
    g.name,
    g.created_by,
    creator.full_name AS created_by_name,
    g.last_message_at,
    g.created_at,
    (g.avatar_path IS NOT NULL) AS has_avatar,
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
    ${previewSql(`channel_type = 'GROUP' AND group_id = g.id`)} AS last_message_content,
    (SELECT COUNT(*)::INTEGER
     FROM messages unread_message
     WHERE unread_message.channel_type = 'GROUP'
       AND unread_message.group_id = g.id
       AND unread_message.author_id != $1
       AND unread_message.deleted_at IS NULL
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

async function createGroup({ name, creatorId, memberIds, avatarPath = null }, client = db) {
  const groupResult = await client.query(
    `INSERT INTO message_groups (name, created_by, avatar_path)
     VALUES ($1, $2, $3)
     RETURNING id, name, created_by, last_message_at, created_at`,
    [name, creatorId, avatarPath]
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

// Chemin de l'avatar d'un groupe, uniquement si l'utilisateur en est membre.
async function findGroupAvatarForMember(groupId, userId) {
  const result = await db.query(
    `SELECT g.avatar_path
     FROM message_groups g
     JOIN message_group_members m ON m.group_id = g.id AND m.user_id = $2
     WHERE g.id = $1`,
    [groupId, userId]
  );
  return result.rows[0]?.avatar_path || null;
}

async function findGroupMessages(groupId, userId) {
  const result = await db.query(
    `SELECT ${MSG_COLS}, ${reactionsSql('$2')}
     FROM messages m
     JOIN users u ON u.id = m.author_id
     WHERE m.channel_type = 'GROUP' AND m.group_id = $1
     ORDER BY m.created_at ASC`,
    [groupId, userId]
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

async function createGroupMessage(groupId, authorId, content, attachment = null, client = db) {
  const inserted = await client.query(
    `INSERT INTO messages (author_id, content, channel_type, group_id, attachment_path, attachment_name, attachment_type, attachment_size)
     VALUES ($1, $2, 'GROUP', $3, $4, $5, $6, $7)
     RETURNING id`,
    [authorId, content || null, groupId, attachment?.path || null, attachment?.name || null, attachment?.type || null, attachment?.size || null]
  );
  await client.query('UPDATE message_groups SET last_message_at = now(), updated_at = now() WHERE id = $1', [groupId]);
  await client.query(
    'UPDATE message_group_members SET last_read_at = now() WHERE group_id = $1 AND user_id = $2',
    [groupId, authorId]
  );
  return findEnrichedMessageById(inserted.rows[0].id, authorId, client);
}

// --- Message unique (édition / suppression / réactions) ---

// Ligne brute (pour vérifier l'auteur, le type, le chemin de la pièce jointe).
async function findRawMessageById(id) {
  const result = await db.query(
    `SELECT id, author_id, channel_type, group_id, recipient_id, deleted_at, attachment_path, attachment_name, attachment_type
     FROM messages WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// Message enrichi (comme dans les listes) pour renvoyer après édition/réaction.
async function findEnrichedMessageById(id, userId, client = db) {
  const result = await client.query(
    `SELECT ${MSG_COLS}, ${reactionsSql('$2')}
     FROM messages m JOIN users u ON u.id = m.author_id
     WHERE m.id = $1`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function updateMessageContent(id, content, userId) {
  await db.query(
    `UPDATE messages SET content = $2, edited_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [id, content]
  );
  return findEnrichedMessageById(id, userId);
}

async function softDeleteMessage(id) {
  await db.query(`UPDATE messages SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
}

// Ajoute la réaction, ou la retire si elle existait déjà (toggle). Renvoie le message enrichi.
async function toggleReaction(messageId, userId, emoji) {
  const inserted = await db.query(
    `INSERT INTO message_reactions (message_id, user_id, emoji)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, user_id, emoji) DO NOTHING
     RETURNING id`,
    [messageId, userId, emoji]
  );
  if (inserted.rowCount === 0) {
    await db.query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
  }
  return findEnrichedMessageById(messageId, userId);
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
  findGroupAvatarForMember,
  findGroupMessages,
  markGroupAsRead,
  createGroupMessage,
  findRawMessageById,
  findEnrichedMessageById,
  updateMessageContent,
  softDeleteMessage,
  toggleReaction,
};
