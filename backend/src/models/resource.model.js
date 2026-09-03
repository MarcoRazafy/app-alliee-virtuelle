const db = require('../config/database');

async function findFolders(type) {
  const result = await db.query(
    `SELECT f.id, f.name, f.type,
            (SELECT COUNT(*)::INTEGER
               FROM resources_files
              WHERE folder_id = f.id AND deleted_at IS NULL) AS file_count
     FROM resources_folders f
     WHERE f.type = $1
       AND f.parent_folder_id IS NULL
       AND f.deleted_at IS NULL
     ORDER BY f.name ASC`,
    [type]
  );
  return result.rows;
}

async function findFolderById(folderId) {
  const result = await db.query(
    `SELECT id, name, type, parent_folder_id, created_by, created_at, deleted_at, deleted_by
     FROM resources_folders
     WHERE id = $1`,
    [folderId]
  );
  return result.rows[0] || null;
}

async function findFilesByFolder(folderId) {
  // On ne remonte pas la colonne content (potentiellement lourde) dans la liste :
  // le contenu d'un document est chargé à la demande via findFileById.
  const result = await db.query(
    `SELECT f.id, f.file_name, f.file_type, f.file_size, f.kind, f.mime_type,
            f.created_at, f.updated_at, f.created_by, u.full_name AS created_by_name
     FROM resources_files f
     JOIN users u ON u.id = f.created_by
     WHERE f.folder_id = $1 AND f.deleted_at IS NULL
     ORDER BY f.kind DESC, f.file_name ASC`,
    [folderId]
  );
  return result.rows;
}

async function createFolder({ name, type, parentFolderId, createdBy }) {
  const result = await db.query(
    `INSERT INTO resources_folders (name, type, parent_folder_id, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, type, parent_folder_id`,
    [name, type, parentFolderId || null, createdBy]
  );
  return result.rows[0];
}

async function renameFolder(id, name) {
  const result = await db.query(
    `UPDATE resources_folders
     SET name = $1, updated_at = now()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, name`,
    [name, id]
  );
  return result.rows[0] || null;
}

async function countFilesInFolder(folderId) {
  const result = await db.query(
    'SELECT COUNT(*)::INTEGER AS count FROM resources_files WHERE folder_id = $1 AND deleted_at IS NULL',
    [folderId]
  );
  return result.rows[0].count;
}

async function deleteFolder(id, deletedBy) {
  const result = await db.query(
    `UPDATE resources_folders
     SET deleted_at = now(), deleted_by = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, name, type, deleted_at`,
    [id, deletedBy]
  );
  return result.rows[0] || null;
}

async function createFile({ folderId, fileName, filePath, fileType, fileSize, mimeType, createdBy }) {
  const result = await db.query(
    `INSERT INTO resources_files (folder_id, file_name, file_path, file_type, file_size, mime_type, kind, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'FILE', $7)
     RETURNING id, file_name, file_type, file_size, kind, mime_type, created_at, updated_at`,
    [folderId, fileName, filePath, fileType, fileSize, mimeType || null, createdBy]
  );
  return result.rows[0];
}

async function createDocument({ folderId, fileName, content, createdBy }) {
  const result = await db.query(
    `INSERT INTO resources_files (folder_id, file_name, file_type, kind, content, created_by)
     VALUES ($1, $2, 'Document', 'DOCUMENT', $3, $4)
     RETURNING id, file_name, file_type, file_size, kind, content, created_at, updated_at`,
    [folderId, fileName, content || '', createdBy]
  );
  return result.rows[0];
}

async function updateDocument(id, { fileName, content }) {
  const result = await db.query(
    `UPDATE resources_files
     SET file_name = COALESCE($2, file_name),
         content = COALESCE($3, content),
         updated_at = now()
     WHERE id = $1 AND kind = 'DOCUMENT' AND deleted_at IS NULL
     RETURNING id, file_name, file_type, file_size, kind, content, created_at, updated_at`,
    [id, fileName ?? null, content ?? null]
  );
  return result.rows[0] || null;
}

async function findFileById(id) {
  const result = await db.query(
    // folder.type est indispensable au contrôle d'accès : les routes de lecture sont
    // ouvertes à tout utilisateur connecté, c'est donc ici qu'on saura si le fichier
    // appartient à l'espace réservé aux administrateurs.
    `SELECT f.*, folder.deleted_at AS folder_deleted_at, folder.type AS folder_type,
            u.full_name AS created_by_name
     FROM resources_files f
     JOIN resources_folders folder ON folder.id = f.folder_id
     JOIN users u ON u.id = f.created_by
     WHERE f.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function deleteFile(id, deletedBy) {
  const result = await db.query(
    `UPDATE resources_files
     SET deleted_at = now(), deleted_by = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, folder_id, file_name, kind, deleted_at`,
    [id, deletedBy]
  );
  return result.rows[0] || null;
}

async function findTrash() {
  const [folders, files] = await Promise.all([
    db.query(
      `SELECT f.id, f.name, f.type, f.deleted_at,
              deleter.full_name AS deleted_by_name,
              (SELECT COUNT(*)::INTEGER FROM resources_files rf WHERE rf.folder_id = f.id) AS file_count
       FROM resources_folders f
       LEFT JOIN users deleter ON deleter.id = f.deleted_by
       WHERE f.deleted_at IS NOT NULL
       ORDER BY f.deleted_at DESC`
    ),
    db.query(
      `SELECT f.id, f.folder_id, f.file_name, f.file_type, f.file_size, f.kind,
              f.deleted_at, folder.name AS folder_name, folder.type AS folder_type,
              deleter.full_name AS deleted_by_name
       FROM resources_files f
       JOIN resources_folders folder ON folder.id = f.folder_id
       LEFT JOIN users deleter ON deleter.id = f.deleted_by
       WHERE f.deleted_at IS NOT NULL
         AND folder.deleted_at IS NULL
       ORDER BY f.deleted_at DESC`
    ),
  ]);
  return { folders: folders.rows, files: files.rows };
}

async function restoreFolder(id) {
  const result = await db.query(
    `UPDATE resources_folders
     SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING id, name, type, parent_folder_id`,
    [id]
  );
  return result.rows[0] || null;
}

async function restoreFile(id) {
  const result = await db.query(
    `UPDATE resources_files
     SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING id, folder_id, file_name, file_type, file_size, kind, created_at, updated_at`,
    [id]
  );
  return result.rows[0] || null;
}

async function findFilePathsInFolderTree(folderId) {
  const result = await db.query(
    `WITH RECURSIVE folder_tree AS (
       SELECT id FROM resources_folders WHERE id = $1
       UNION ALL
       SELECT child.id
       FROM resources_folders child
       JOIN folder_tree parent ON child.parent_folder_id = parent.id
     )
     SELECT file_path
     FROM resources_files
     WHERE folder_id IN (SELECT id FROM folder_tree)
       AND kind = 'FILE'
       AND file_path IS NOT NULL`,
    [folderId]
  );
  return result.rows.map((row) => row.file_path);
}

async function permanentlyDeleteFolder(id) {
  const result = await db.query(
    `DELETE FROM resources_folders
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING id, name, type`,
    [id]
  );
  return result.rows[0] || null;
}

async function permanentlyDeleteFile(id) {
  const result = await db.query(
    `DELETE FROM resources_files
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

async function createShares({ folderId, userIds, permissionType, expiresAt, sharedBy }, client = db) {
  const params = [];
  const placeholders = userIds.map((userId, i) => {
    params.push(folderId, userId, permissionType, sharedBy, expiresAt || null);
    const offset = i * 5;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
  });

  const result = await client.query(
    `INSERT INTO resources_shares (folder_id, shared_with_user_id, permission_type, shared_by_user_id, expires_at)
     VALUES ${placeholders.join(', ')}
     RETURNING id, shared_with_user_id, permission_type, expires_at`,
    params
  );
  return result.rows;
}

async function findSharesForFolder(folderId) {
  const result = await db.query(
    `SELECT s.id, s.shared_with_user_id, u.full_name AS shared_with_name, s.permission_type, s.expires_at, s.created_at
     FROM resources_shares s
     JOIN users u ON u.id = s.shared_with_user_id
     WHERE s.folder_id = $1
     ORDER BY s.created_at DESC`,
    [folderId]
  );
  return result.rows;
}

async function findShareById(id) {
  const result = await db.query('SELECT * FROM resources_shares WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function deleteShare(id, client = db) {
  await client.query('DELETE FROM resources_shares WHERE id = $1', [id]);
}

module.exports = {
  findFolders,
  findFolderById,
  findFilesByFolder,
  createFolder,
  renameFolder,
  countFilesInFolder,
  deleteFolder,
  createFile,
  createDocument,
  updateDocument,
  findFileById,
  deleteFile,
  findTrash,
  restoreFolder,
  restoreFile,
  findFilePathsInFolderTree,
  permanentlyDeleteFolder,
  permanentlyDeleteFile,
  createShares,
  findSharesForFolder,
  findShareById,
  deleteShare,
};
