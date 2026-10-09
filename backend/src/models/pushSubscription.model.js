const db = require('../config/database');

async function upsert(userId, subscription, userAgent) {
  const { endpoint, keys } = subscription;
  const result = await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent
     RETURNING id`,
    [userId, endpoint, keys.p256dh, keys.auth, userAgent || null]
  );
  return result.rows[0];
}

async function findByUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return [];
  const result = await db.query(
    `SELECT id, user_id, endpoint, p256dh, auth
       FROM push_subscriptions
      WHERE user_id = ANY($1::uuid[])`,
    [ids]
  );
  return result.rows;
}

async function removeByEndpoint(endpoint) {
  await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

async function removeById(id) {
  await db.query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
}

module.exports = { upsert, findByUserIds, removeByEndpoint, removeById };
