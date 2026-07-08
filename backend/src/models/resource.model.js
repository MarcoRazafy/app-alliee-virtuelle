const db = require('../config/database');

async function findFolders(type) {
  const result = await db.query(
    `SELECT f.id, f.name, f.type,
            (SELECT COUNT(*)::INTEGER FROM resources_files WHERE folder_id = f.id) AS file_count
     FROM resources_folders f
     WHERE f.type = $1 AND f.parent_folder_id IS NULL
     ORDER BY f.name ASC`,
    [type]
  );
  return result.rows;
}

async function findFolderById(folderId) {
  const result = await db.query('SELECT id, name, type FROM resources_folders WHERE id = $1', [folderId]);
  return result.rows[0] || null;
}

async function findFilesByFolder(folderId) {
  const result = await db.query(
    `SELECT id, file_name, file_path, file_type, file_size, created_at
     FROM resources_files
     WHERE folder_id = $1
     ORDER BY file_name ASC`,
    [folderId]
  );
  return result.rows;
}

module.exports = { findFolders, findFolderById, findFilesByFolder };
