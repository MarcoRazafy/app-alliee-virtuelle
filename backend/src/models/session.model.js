const db = require('../config/database');
const env = require('../config/env');

const STALE_AFTER_SECONDS = env.presenceHeartbeatTimeoutSeconds;
const DISCONNECT_GRACE_SECONDS = env.presenceDisconnectGraceSeconds;

// Chrono de connexion (présence) : indépendant du chrono de tâche (table timelog).
// Une ligne = une période "connecté" (login -> déconnexion ou fermeture de l'application).

async function startSession(userId) {
  // Répare d'abord une éventuelle présence/tâche abandonnée lors d'une ancienne
  // fermeture brutale, avant de reprendre une session pour ce compte.
  await expireStaleSessions({ userId });

  return db.withTransaction(async (client) => {
    // Plusieurs onglets représentent une seule présence utilisateur : ils rafraîchissent
    // la même session ouverte au lieu de créer des intervalles qui se chevauchent.
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

const heartbeatSession = startSession;

// pagehide est envoyé aussi bien à la fermeture qu'au rechargement. On mémorise
// donc l'intention sans fermer immédiatement : un heartbeat du document rechargé
// l'annulera, tandis que le nettoyeur serveur la confirmera après la tolérance.
async function requestDisconnect(userId) {
  const result = await db.query(
    `UPDATE user_sessions
     SET disconnect_requested_at = COALESCE(disconnect_requested_at, now())
     WHERE user_id = $1 AND logout_at IS NULL
     RETURNING id, disconnect_requested_at`,
    [userId]
  );
  return result.rows[0] || null;
}

// Clôture les présences sans heartbeat et, dans la même transaction, tout chrono
// de tâche devenu orphelin. Le serveur appelle cette fonction périodiquement : la
// correction ne dépend donc pas de la réouverture du navigateur ni de la page admin.
async function expireStaleSessions({ userId = null } = {}) {
  return db.withTransaction(async (client) => {
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
      [STALE_AFTER_SECONDS, DISCONNECT_GRACE_SECONDS, userId]
    );

    let timelogsClosed = 0;
    for (const expired of expiredResult.rows) {
      const stoppedResult = await client.query(
        `UPDATE timelog
         SET end_time = GREATEST(
               start_time,
               $2::timestamptz AT TIME ZONE current_setting('TIMEZONE')
             ),
             duration_seconds = GREATEST(
               0,
               EXTRACT(EPOCH FROM (
                 ($2::timestamptz AT TIME ZONE current_setting('TIMEZONE')) - start_time
               ))::INTEGER
             )
         WHERE employee_id = $1 AND end_time IS NULL
         RETURNING id, task_id, duration_seconds`,
        [expired.user_id, expired.logout_at]
      );

      timelogsClosed += stoppedResult.rowCount;
      for (const stopped of stoppedResult.rows) {
        await client.query(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
           VALUES ($1, 'AUTO_STOP_TIMELOG_DISCONNECT', 'task', $2, $3::jsonb)`,
          [
            expired.user_id,
            stopped.task_id,
            JSON.stringify({
              sessionId: stopped.id,
              durationSeconds: stopped.duration_seconds,
              reason: 'presence_heartbeat_expired',
            }),
          ]
        );
      }
    }

    return { sessionsClosed: expiredResult.rowCount, timelogsClosed };
  });
}

// Ferme toute session restée ouverte pour cet utilisateur (défensif : gère aussi le cas
// de plusieurs onglets ou d'une session jamais fermée proprement lors d'une session précédente).
async function closeOpenSessions(userId) {
  const result = await db.query(
    `UPDATE user_sessions
     SET logout_at = now(), last_seen_at = now(), disconnect_requested_at = NULL
     WHERE user_id = $1 AND logout_at IS NULL
     RETURNING id, user_id, login_at, logout_at, last_seen_at, disconnect_requested_at`,
    [userId]
  );
  return result.rows;
}

// Sessions qui chevauchent au moins partiellement [rangeStartIso, rangeEndIso[.
// Une session ouverte ne s'étend que jusqu'au dernier heartbeat + délai de tolérance.
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
             AND COALESCE(last_seen_at, login_at) >= now() - make_interval(secs => $4)) AS is_live
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
    [userId, rangeStartIso, rangeEndIso, STALE_AFTER_SECONDS]
  );
  return result.rows;
}

// Version groupée de findSessionsOverlappingRange pour plusieurs utilisateurs (page présence).
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
             AND COALESCE(last_seen_at, login_at) >= now() - make_interval(secs => $4)) AS is_live
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
    [userIds, rangeStartIso, rangeEndIso, STALE_AFTER_SECONDS]
  );
  return result.rows;
}

// Session actuellement ouverte (s'il y en a une) : utilisé pour le chrono flottant, qui
// affiche la durée de connexion écoulée depuis login_at.
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

module.exports = {
  startSession,
  heartbeatSession,
  requestDisconnect,
  expireStaleSessions,
  closeOpenSessions,
  findSessionsOverlappingRange,
  findSessionsForUsersOverlapping,
  findOpenSession,
};
