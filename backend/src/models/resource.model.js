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
  const result = await db.query('SELECT id, name, type, parent_folder_id FROM resources_folders WHERE id = $1', [
    folderId,
  ]);
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
     WHERE f.folder_id = $1
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
    `UPDATE resources_folders SET name = $1, updated_at = now() WHERE id = $2 RETURNING id, name`,
    [name, id]
  );
  return result.rows[0];
}

async function countFilesInFolder(folderId) {
  const result = await db.query('SELECT COUNT(*)::INTEGER AS count FROM resources_files WHERE folder_id = $1', [
    folderId,
  ]);
  return result.rows[0].count;
}

async function deleteFolder(id) {
  await db.query('DELETE FROM resources_folders WHERE id = $1', [id]);
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
     WHERE id = $1 AND kind = 'DOCUMENT'
     RETURNING id, file_name, file_type, file_size, kind, content, created_at, updated_at`,
    [id, fileName ?? null, content ?? null]
  );
  return result.rows[0] || null;
}

async function findFileById(id) {
  const result = await db.query(
    `SELECT f.*, u.full_name AS created_by_name
     FROM resources_files f
     JOIN users u ON u.id = f.created_by
     WHERE f.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function deleteFile(id) {
  await db.query('DELETE FROM resources_files WHERE id = $1', [id]);
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
  createShares,
  findSharesForFolder,
  findShareById,
  deleteShare,
};
