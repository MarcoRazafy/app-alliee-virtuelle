const db = require('../config/database');

// --- Spaces ---

async function findAllSpaces() {
  const result = await db.query('SELECT id, name, description, created_by, created_at FROM task_spaces ORDER BY name ASC');
  return result.rows;
}

async function findSpaceById(id) {
  const result = await db.query('SELECT id, name, description, created_by, created_at FROM task_spaces WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createSpace({ name, description, createdBy }) {
  const result = await db.query(
    `INSERT INTO task_spaces (name, description, created_by) VALUES ($1, $2, $3)
     RETURNING id, name, description, created_by, created_at`,
    [name, description || null, createdBy]
  );
  return result.rows[0];
}

async function updateSpace(id, { name, description }) {
  const result = await db.query(
    `UPDATE task_spaces SET name = $1, description = $2 WHERE id = $3
     RETURNING id, name, description, created_by, created_at`,
    [name, description || null, id]
  );
  return result.rows[0];
}

async function deleteSpace(id) {
  await db.query('DELETE FROM task_spaces WHERE id = $1', [id]);
}

// --- Folders ---

async function findFoldersBySpace(spaceId) {
  const result = await db.query(
    'SELECT id, space_id, name, created_at FROM task_folders WHERE space_id = $1 ORDER BY name ASC',
    [spaceId]
  );
  return result.rows;
}

async function findFolderById(id) {
  const result = await db.query('SELECT id, space_id, name, created_at FROM task_folders WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createFolder({ spaceId, name }) {
  const result = await db.query(
    `INSERT INTO task_folders (space_id, name) VALUES ($1, $2)
     RETURNING id, space_id, name, created_at`,
    [spaceId, name]
  );
  return result.rows[0];
}

async function updateFolder(id, name) {
  const result = await db.query(
    'UPDATE task_folders SET name = $1 WHERE id = $2 RETURNING id, space_id, name, created_at',
    [name, id]
  );
  return result.rows[0];
}

async function deleteFolder(id) {
  await db.query('DELETE FROM task_folders WHERE id = $1', [id]);
}

// --- Lists ---

async function findListsByFolder(folderId) {
  const result = await db.query(
    'SELECT id, folder_id, name, created_at FROM task_lists WHERE folder_id = $1 ORDER BY name ASC',
    [folderId]
  );
  return result.rows;
}

async function findListById(id) {
  const result = await db.query('SELECT id, folder_id, name, created_at FROM task_lists WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createList({ folderId, name }) {
  const result = await db.query(
    `INSERT INTO task_lists (folder_id, name) VALUES ($1, $2)
     RETURNING id, folder_id, name, created_at`,
    [folderId, name]
  );
  return result.rows[0];
}

async function updateList(id, name) {
  const result = await db.query(
    'UPDATE task_lists SET name = $1 WHERE id = $2 RETURNING id, folder_id, name, created_at',
    [name, id]
  );
  return result.rows[0];
}

async function deleteList(id) {
  await db.query('DELETE FROM task_lists WHERE id = $1', [id]);
}

// --- Arbre complet : spaces -> folders -> lists (+ nombre de tâches par liste) ---

async function getTree() {
  const result = await db.query(`
    SELECT
      s.id AS space_id, s.name AS space_name,
      f.id AS folder_id, f.name AS folder_name,
      l.id AS list_id, l.name AS list_name,
      (SELECT COUNT(*)::INTEGER FROM tasks WHERE tasks.list_id = l.id) AS task_count
    FROM task_spaces s
    LEFT JOIN task_folders f ON f.space_id = s.id
    LEFT JOIN task_lists l ON l.folder_id = f.id
    ORDER BY s.name ASC, f.name ASC, l.name ASC
  `);

  const spacesById = new Map();

  for (const row of result.rows) {
    if (!spacesById.has(row.space_id)) {
      spacesById.set(row.space_id, { id: row.space_id, name: row.space_name, folders: [] });
    }
    const space = spacesById.get(row.space_id);

    if (!row.folder_id) continue;
    let folder = space.folders.find((f) => f.id === row.folder_id);
    if (!folder) {
      folder = { id: row.folder_id, name: row.folder_name, lists: [] };
      space.folders.push(folder);
    }

    if (!row.list_id) continue;
    folder.lists.push({ id: row.list_id, name: row.list_name, task_count: row.task_count });
  }

  return Array.from(spacesById.values());
}

module.exports = {
  findAllSpaces,
  findSpaceById,
  createSpace,
  updateSpace,
  deleteSpace,
  findFoldersBySpace,
  findFolderById,
  createFolder,
  updateFolder,
  deleteFolder,
  findListsByFolder,
  findListById,
  createList,
  updateList,
  deleteList,
  getTree,
};
