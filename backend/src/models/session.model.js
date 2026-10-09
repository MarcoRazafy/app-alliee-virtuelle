const db = require('../config/database');
const env = require('../config/env');
const realtime = require('../realtime/io');

const STALE_AFTER_SECONDS = env.presenceHeartbeatTimeoutSeconds;
const ABANDON_AFTER_SECONDS = env.sessionAbandonTimeoutSeconds;
const DISCONNECT_GRACE_SECONDS = env.presenceDisconnectGraceSeconds;

async function startSession(userId) {
  await expireStaleSessions({ userId });

  return db.withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO user_sessions (user_id, login_at, last_seen_at, disconnect_requested_at)
       VALUES ($1, now(), now(), NULL)
       ON CONFLICT (user_id) WHERE logout_at IS NULL
       DO UPDATE SET last_seen_at = now(), disconnect_requested_at = NULL
       RETURNING id, user_id, login_at, logout_at, last_seen_at, disconnect_requested_at`,
      [userId]
    );
    return result.rows[0];
  });
}

async function extendSession(userId) {
  const result = await db.query(
    `UPDATE user_sessions
     SET last_seen_at = now(), disconnect_requested_at = NULL
     WHERE user_id = $1 AND logout_at IS NULL
     RETURNING id, user_id, login_at, logout_at, last_seen_at, disconnect_requested_at`,
    [userId]
  );
  return result.rows[0] || null;
}

const heartbeatSession = extendSession;

async function requestDisconnect(userId) {
  const result = await db.query(
    `UPDATE user_sessions
     SET disconnect_requested_at = COALESCE(disconnect_requested_at, now())
     WHERE user_id = $1 AND logout_at IS NULL
     RETURNING id, disconnect_requested_at`,
    [userId]
  );
  if (result.rows[0]) realtime.broadcast('presence:update', {});
  return result.rows[0] || null;
}

async function expireStaleSessions({ userId = null } = {}) {
  const result = await db.withTransaction(async (client) => {
    const expiredResult = await client.query(
      `WITH candidates AS (
         SELECT id,
                CASE
                  WHEN disconnect_requested_at IS NOT NULL
                   AND disconnect_requested_at <= now() - make_interval(secs => $2)
                    THEN disconnect_requested_at
                  ELSE COALESCE(last_seen_at, login_at) + make_interval(secs => $1)
                END AS effective_logout_at
         FROM user_sessions
         WHERE logout_at IS NULL
           AND ($3::uuid IS NULL OR user_id = $3)
           AND (
             COALESCE(last_seen_at, login_at) < now() - make_interval(secs => $1)
             OR (
               disconnect_requested_at IS NOT NULL
               AND disconnect_requested_at <= now() - make_interval(secs => $2)
             )
           )
         FOR UPDATE
       )
       UPDATE user_sessions AS session
       SET logout_at = LEAST(now(), candidates.effective_logout_at)
       FROM candidates
       WHERE session.id = candidates.id
       RETURNING session.user_id, session.logout_at`,
      [ABANDON_AFTER_SECONDS, DISCONNECT_GRACE_SECONDS, userId]
    );

    return { sessionsClosed: expiredResult.rowCount, timelogsClosed: 0 };
  });

  if (result.sessionsClosed > 0) realtime.broadcast('presence:update', {});
  return result;
}

async function closeOpenSessions(userId) {
  const result = await db.query(
    `UPDATE user_sessions
     SET logout_at = now(), last_seen_at = now(), disconnect_requested_at = NULL
     WHERE user_id = $1 AND logout_at IS NULL
     RETURNING id, user_id, login_at, logout_at, last_seen_at, disconnect_requested_at`,
    [userId]
  );
  if (result.rows.length > 0) realtime.broadcast('presence:update', {});
  return result.rows;
}

async function findSessionsOverlappingRange(userId, rangeStartIso, rangeEndIso) {
  const result = await db.query(
    `SELECT id, login_at, logout_at, last_seen_at, disconnect_requested_at,
            LEAST(
              COALESCE(
                logout_at,
                disconnect_requested_at,
                COALESCE(last_seen_at, login_at) + make_interval(secs => $4)
              ),
              now()
            ) AS effective_logout_at,
            (logout_at IS NULL
             AND disconnect_requested_at IS NULL
             AND COALESCE(last_seen_at, login_at) >= now() - make_interval(secs => $5)) AS is_live
     FROM user_sessions
     WHERE user_id = $1
       AND login_at < $3
       AND LEAST(
             COALESCE(
               logout_at,
               disconnect_requested_at,
               COALESCE(last_seen_at, login_at) + make_interval(secs => $4)
             ),
             now()
           ) > $2
     ORDER BY login_at ASC`,
    [userId, rangeStartIso, rangeEndIso, ABANDON_AFTER_SECONDS, STALE_AFTER_SECONDS]
  );
  return result.rows;
}

async function findSessionsForUsersOverlapping(userIds, rangeStartIso, rangeEndIso) {
  if (!userIds || userIds.length === 0) return [];
  const result = await db.query(
    `SELECT user_id, login_at, logout_at, last_seen_at, disconnect_requested_at,
            LEAST(
              COALESCE(
                logout_at,
                disconnect_requested_at,
                COALESCE(last_seen_at, login_at) + make_interval(secs => $4)
              ),
              now()
            ) AS effective_logout_at,
            (logout_at IS NULL
             AND disconnect_requested_at IS NULL
             AND COALESCE(last_seen_at, login_at) >= now() - make_interval(secs => $5)) AS is_live
     FROM user_sessions
     WHERE user_id = ANY($1::uuid[])
       AND login_at < $3
       AND LEAST(
             COALESCE(
               logout_at,
               disconnect_requested_at,
               COALESCE(last_seen_at, login_at) + make_interval(secs => $4)
             ),
             now()
           ) > $2
     ORDER BY login_at ASC`,
    [userIds, rangeStartIso, rangeEndIso, ABANDON_AFTER_SECONDS, STALE_AFTER_SECONDS]
  );
  return result.rows;
}

async function findLiveUserIds(userIds = null) {
  const result = await db.query(
    `SELECT DISTINCT user_id FROM user_sessions
     WHERE logout_at IS NULL
       AND disconnect_requested_at IS NULL
       AND COALESCE(last_seen_at, login_at) >= now() - make_interval(secs => $1)
       AND ($2::uuid[] IS NULL OR user_id = ANY($2::uuid[]))`,
    [STALE_AFTER_SECONDS, userIds]
  );
  return result.rows.map((row) => row.user_id);
}

async function findOpenSession(userId) {
  const result = await db.query(
    `SELECT id, login_at, last_seen_at
     FROM user_sessions
     WHERE user_id = $1
       AND logout_at IS NULL
       AND disconnect_requested_at IS NULL
       AND COALESCE(last_seen_at, login_at) >= now() - make_interval(secs => $2)
     ORDER BY login_at DESC
     LIMIT 1`,
    [userId, STALE_AFTER_SECONDS]
  );
  return result.rows[0] || null;
}

async function findSessionsForUserRange(userId, startDate, endDate) {
  const result = await db.query(
    `SELECT id, login_at, logout_at, last_seen_at,
            EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))::int AS duration_seconds,
            (logout_at IS NULL) AS is_open
       FROM user_sessions
      WHERE user_id = $1
        AND login_at < ($3::date + 1)
        AND COALESCE(logout_at, now()) >= $2::date
      ORDER BY login_at DESC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

async function findSessionById(sessionId) {
  const result = await db.query('SELECT * FROM user_sessions WHERE id = $1', [sessionId]);
  return result.rows[0] || null;
}

async function updateSessionTimes(sessionId, loginAt, logoutAt) {
  const result = await db.query(
    `UPDATE user_sessions
        SET login_at = $2,
            logout_at = $3,
            last_seen_at = GREATEST($2::timestamptz, COALESCE($3::timestamptz, last_seen_at)),
            disconnect_requested_at = NULL
      WHERE id = $1
      RETURNING id, login_at, logout_at,
                EXTRACT(EPOCH FROM (COALESCE(logout_at, now()) - login_at))::int AS duration_seconds`,
    [sessionId, loginAt, logoutAt]
  );
  return result.rows[0] || null;
}

async function deleteSession(sessionId) {
  const result = await db.query('DELETE FROM user_sessions WHERE id = $1 RETURNING id', [sessionId]);
  return result.rows[0] || null;
}

module.exports = {
  findSessionsForUserRange,
  findSessionById,
  updateSessionTimes,
  deleteSession,
  startSession,
  heartbeatSession,
  extendSession,
  requestDisconnect,
  expireStaleSessions,
  closeOpenSessions,
  findLiveUserIds,
  findSessionsOverlappingRange,
  findSessionsForUsersOverlapping,
  findOpenSession,
};
