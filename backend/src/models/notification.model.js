const db = require('../config/database');

const MESSAGE_FILTER = `
  a.entity_type NOT IN ('message', 'messages', 'message_conversation', 'message_group')
  AND a.action NOT ILIKE '%MESSAGE%'
`;

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
         task_space.name
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
     LEFT JOIN notification_read_state read_state ON read_state.user_id = $1
     WHERE ${MESSAGE_FILTER}
       -- On ne notifie jamais quelqu'un de ses propres actions (bruit + badge gonflé).
       AND a.user_id IS DISTINCT FROM $1
       AND ${visibilityClause(role)}
     ORDER BY a.timestamp DESC
     LIMIT $2`,
    [userId, safeLimit]
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
