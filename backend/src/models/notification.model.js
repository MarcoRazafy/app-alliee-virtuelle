const db = require('../config/database');

const MESSAGE_FILTER = `
  a.entity_type NOT IN ('message', 'messages', 'message_conversation', 'message_group')
  AND a.action NOT ILIKE '%MESSAGE%'
`;

// Seules ces actions produisent une notification. Le centre de notifications ne doit contenir
// que ce qui APPELLE UNE ACTION ou informe directement la personne — sinon il se remplit de
// télémétrie (démarrages de chrono, modifications de tâche, validations de journée) et le
// badge devient un bruit qu'on cesse de lire.
//
// Le journal d'audit, lui, reste COMPLET : il assure la traçabilité et alimente
// « Activité récente » de la fiche employé. On filtre uniquement l'affichage.
const NOTIFIABLE_ACTIONS = [
  // --- Une décision est attendue ---
  'CREATE_TASK', // tâche assignée, ou proposition d'employé à valider
  'REQUEST_EXTRA_TASK',
  'APPROVE_EXTRA_TASK',
  'REJECT_EXTRA_TASK',
  'COMPLETE_TASK', // travail terminé, à confirmer
  'SUBMIT_WEEKLY_PLANNING',
  'REGISTER_USER',

  // --- Le sort de mon travail ---
  'VALIDATE_TASK',
  'CONFIRM_TASK',
  'REJECT_TASK', // renvoyée : je dois la reprendre
  'UPDATE_TASK_STATUS',
  'REASSIGN_TASK', // une tâche m'est confiée
  'DELETE_TASK',
  'MENTION_IN_COMMENT',

  // --- Mon compte / mon temps (corrections faites par un admin) ---
  'APPROVE_USER',
  'REJECT_USER',
  'SUSPEND_USER',
  'ACTIVATE_USER',
  'PROMOTE_USER',
  'ADMIN_UPDATE_WEEKLY_PLANNING',
  'SET_ATTENDANCE_OVERRIDE',
  'UPDATE_TIMELOG',
  'DELETE_TIMELOG',
  'UPDATE_USER_SESSION',
  'DELETE_USER_SESSION',

  // --- Diffusion / partage ---
  'PUBLISH_ANNOUNCEMENT',
  'SHARE_FOLDER',
];

function visibilityClause(role) {
  if (role === 'ADMIN') return 'TRUE';

  return `(
    a.user_id = $1
    OR task.assigned_to = $1
    OR planning.user_id = $1
    OR extra_request.user_id = $1
    OR a.details->>'target_user' = $1::text
    OR a.details->>'target_user_id' = $1::text
    OR a.details->>'employee_id' = $1::text
    OR a.entity_type = 'announcement'
    OR EXISTS (
      SELECT 1
      FROM tasks attachment_task
      WHERE a.entity_type = 'task_attachment'
        AND attachment_task.id::text = a.details->>'task_id'
        AND attachment_task.assigned_to = $1
    )
  )`;
}

async function findForUser({ userId, role, limit = 30 }) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const result = await db.query(
    `SELECT
       a.id,
       a.action,
       a.entity_type,
       a.entity_id,
       a.details,
       a.timestamp,
       actor.full_name AS actor_name,
       COALESCE(
         task.title,
         resource_folder.name,
         resource_file.file_name,
         task_list.name,
         task_folder.name,
         task_space.name,
         announcement.title
       ) AS entity_name,
       (a.timestamp > COALESCE(read_state.last_read_at, TIMESTAMP '1970-01-01 00:00:00')) AS is_unread
     FROM audit_log a
     LEFT JOIN users actor ON actor.id = a.user_id
     LEFT JOIN tasks task ON a.entity_type = 'task' AND task.id = a.entity_id
     LEFT JOIN weekly_plannings planning
       ON a.entity_type = 'weekly_planning' AND planning.id = a.entity_id
     LEFT JOIN extra_task_requests extra_request
       ON a.entity_type = 'extra_task_requests' AND extra_request.id = a.entity_id
     LEFT JOIN resources_folders resource_folder
       ON a.entity_type = 'resources_folder' AND resource_folder.id = a.entity_id
     LEFT JOIN resources_files resource_file
       ON a.entity_type = 'resources_file' AND resource_file.id = a.entity_id
     LEFT JOIN task_lists task_list
       ON a.entity_type = 'task_list' AND task_list.id = a.entity_id
     LEFT JOIN task_folders task_folder
       ON a.entity_type = 'task_folder' AND task_folder.id = a.entity_id
     LEFT JOIN task_spaces task_space
       ON a.entity_type = 'task_space' AND task_space.id = a.entity_id
     LEFT JOIN announcements announcement
       ON a.entity_type = 'announcement' AND announcement.id = a.entity_id
     LEFT JOIN notification_read_state read_state ON read_state.user_id = $1
     WHERE ${MESSAGE_FILTER}
       -- On ne notifie jamais quelqu'un de ses propres actions (bruit + badge gonflé).
       AND a.user_id IS DISTINCT FROM $1
       AND a.action = ANY($3)
       AND ${visibilityClause(role)}
     ORDER BY a.timestamp DESC
     LIMIT $2`,
    [userId, safeLimit, NOTIFIABLE_ACTIONS]
  );

  return {
    items: result.rows,
    unread_count: result.rows.reduce((count, item) => count + (item.is_unread ? 1 : 0), 0),
  };
}

async function markAllRead(userId) {
  const result = await db.query(
    `INSERT INTO notification_read_state (user_id, last_read_at, updated_at)
     VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id)
     DO UPDATE SET last_read_at = EXCLUDED.last_read_at, updated_at = CURRENT_TIMESTAMP
     RETURNING last_read_at`,
    [userId]
  );
  return result.rows[0];
}

module.exports = { findForUser, markAllRead };
