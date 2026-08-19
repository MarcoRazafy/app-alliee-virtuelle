const db = require('../config/database');

// Insère un email récupéré via IMAP. Ne fait rien s'il existe déjà (même compte + UID).
// Renvoie la ligne insérée (id, received_at…) ou null si c'était un doublon.
async function insertEmail(data) {
  const result = await db.query(
    `INSERT INTO emails (
       mailbox, account, imap_uid, message_id,
       from_name, from_address, to_addresses, subject, snippet,
       body_text, body_html, has_attachments, attachments, received_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
     ON CONFLICT (account, mailbox, imap_uid) DO NOTHING
     RETURNING id, imap_uid, from_name, from_address, subject, snippet, received_at, is_read, has_attachments`,
    [
      data.mailbox || 'INBOX',
      data.account,
      data.imap_uid,
      data.message_id || null,
      data.from_name || null,
      data.from_address || null,
      data.to_addresses || null,
      data.subject || null,
      data.snippet || null,
      data.body_text || null,
      data.body_html || null,
      Boolean(data.has_attachments),
      JSON.stringify(data.attachments || []),
      data.received_at || null,
    ]
  );
  return result.rows[0] || null;
}

// Liste paginée pour la vue « Boîte mail » (sans les corps, allégée).
async function listEmails({ limit = 30, offset = 0 } = {}) {
  const result = await db.query(
    `SELECT id, from_name, from_address, subject, snippet, received_at, is_read, has_attachments
       FROM emails
      ORDER BY received_at DESC NULLS LAST, created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

async function countEmails() {
  const result = await db.query('SELECT COUNT(*)::int AS total FROM emails');
  return result.rows[0].total;
}

async function countUnread() {
  const result = await db.query('SELECT COUNT(*)::int AS unread FROM emails WHERE is_read = false');
  return result.rows[0].unread;
}

// Détail complet d'un email (corps inclus).
async function getEmailById(id) {
  const result = await db.query('SELECT * FROM emails WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function setRead(id, isRead) {
  const result = await db.query(
    'UPDATE emails SET is_read = $2 WHERE id = $1 RETURNING id, is_read',
    [id, Boolean(isRead)]
  );
  return result.rows[0] || null;
}

// Plus grand UID déjà stocké pour un compte/boîte : sert de point de reprise à la synchro.
async function getMaxUid(account, mailbox = 'INBOX') {
  const result = await db.query(
    'SELECT COALESCE(MAX(imap_uid), 0) AS max_uid FROM emails WHERE account = $1 AND mailbox = $2',
    [account, mailbox]
  );
  return Number(result.rows[0].max_uid) || 0;
}

module.exports = {
  insertEmail,
  listEmails,
  countEmails,
  countUnread,
  getEmailById,
  setRead,
  getMaxUid,
};
