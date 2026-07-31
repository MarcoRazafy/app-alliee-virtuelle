const hierarchyModel = require('../models/hierarchy.model');
const taskModel = require('../models/task.model');

function validateName(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 150;
}

// --- Spaces ---

async function listSpaces(req, res, next) {
  try {
    const spaces = await hierarchyModel.findAllSpaces();
    res.status(200).json(spaces);
  } catch (err) {
    next(err);
  }
}

async function getSpacesTree(req, res, next) {
  try {
    const tree = await hierarchyModel.getTree();
    res.status(200).json(tree);
  } catch (err) {
    next(err);
  }
}

async function createSpace(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!validateName(name)) {
      return res.status(400).json({ error: 'Le nom de l’espace est requis (max 150 caractères)' });
    }
    const space = await hierarchyModel.createSpace({ name, description, createdBy: req.user.id });
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_SPACE',
      entityType: 'task_space',
      entityId: space.id,
      details: { name },
    });
    res.status(201).json(space);
  } catch (err) {
    next(err);
  }
}

async function updateSpace(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!validateName(name)) {
      return res.status(400).json({ error: 'Le nom de l’espace est requis (max 150 caractères)' });
    }
    const space = await hierarchyModel.findSpaceById(id);
    if (!space || space.deleted_at) {
      return res.status(404).json({ error: 'Espace introuvable' });
    }
    const updated = await hierarchyModel.updateSpace(id, { name, description });
    if (!updated) {
      return res.status(409).json({ error: 'Cet espace a déjà été supprimé' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_SPACE',
      entityType: 'task_space',
      entityId: id,
      details: { name },
    });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteSpace(req, res, next) {
  try {
    const { id } = req.params;
    const space = await hierarchyModel.findSpaceById(id);
    if (!space || space.deleted_at) {
      return res.status(404).json({ error: 'Espace introuvable' });
    }
    const deleted = await hierarchyModel.deleteSpace(id, req.user.id);
    if (!deleted) {
      return res.status(409).json({ error: 'Cet espace a déjà été supprimé' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_SPACE',
      entityType: 'task_space',
      entityId: id,
      details: { name: space.name, hierarchy_preserved: true },
    });
    res.status(200).json({ deleted: true, hierarchy_preserved: true });
  } catch (err) {
    next(err);
  }
}

// --- Folders ---

async function listFolders(req, res, next) {
  try {
    const { space_id: spaceId } = req.query;
    if (!spaceId) {
      return res.status(400).json({ error: 'Le paramètre space_id est requis' });
    }
    const folders = await hierarchyModel.findFoldersBySpace(spaceId);
    res.status(200).json(folders);
  } catch (err) {
    next(err);
  }
}

async function createFolder(req, res, next) {
  try {
    const { name, space_id: spaceId } = req.body;
    if (!validateName(name)) {
      return res.status(400).json({ error: 'Le nom du dossier est requis (max 150 caractères)' });
    }
    if (!spaceId) {
      return res.status(400).json({ error: 'space_id est requis' });
    }
    const space = await hierarchyModel.findSpaceById(spaceId);
    if (!space || space.deleted_at) {
      return res.status(400).json({ error: 'Espace introuvable' });
    }
    const folder = await hierarchyModel.createFolder({ spaceId, name });
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_FOLDER',
      entityType: 'task_folder',
      entityId: folder.id,
      details: { name, space_id: spaceId },
    });
    res.status(201).json(folder);
  } catch (err) {
    next(err);
  }
}

async function updateFolder(req, res, next) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!validateName(name)) {
      return res.status(400).json({ error: 'Le nom du dossier est requis (max 150 caractères)' });
    }
    const folder = await hierarchyModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    const updated = await hierarchyModel.updateFolder(id, name);
    if (!updated) {
      return res.status(409).json({ error: 'Ce dossier a déjà été supprimé' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_FOLDER',
      entityType: 'task_folder',
      entityId: id,
      details: { name },
    });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteFolder(req, res, next) {
  try {
    const { id } = req.params;
    const folder = await hierarchyModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    const deleted = await hierarchyModel.deleteFolder(id, req.user.id);
    if (!deleted) {
      return res.status(409).json({ error: 'Ce dossier a déjà été supprimé' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_FOLDER',
      entityType: 'task_folder',
      entityId: id,
      details: { name: folder.name, projects_preserved: true },
    });
    res.status(200).json({ deleted: true, projects_preserved: true });
  } catch (err) {
    next(err);
  }
}

// --- Lists ---

async function listLists(req, res, next) {
  try {
    const { folder_id: folderId } = req.query;
    if (!folderId) {
      return res.status(400).json({ error: 'Le paramètre folder_id est requis' });
    }
    const lists = await hierarchyModel.findListsByFolder(folderId);
    res.status(200).json(lists);
  } catch (err) {
    next(err);
  }
}

async function createList(req, res, next) {
  try {
    const { name, folder_id: folderId } = req.body;
    if (!validateName(name)) {
      return res.status(400).json({ error: 'Le nom de la liste est requis (max 150 caractères)' });
    }
    if (!folderId) {
      return res.status(400).json({ error: 'folder_id est requis' });
    }
    const folder = await hierarchyModel.findFolderById(folderId);
    if (!folder || folder.deleted_at) {
      return res.status(400).json({ error: 'Dossier introuvable' });
    }
    const list = await hierarchyModel.createList({ folderId, name });
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_LIST',
      entityType: 'task_list',
      entityId: list.id,
      details: { name, folder_id: folderId },
    });
    res.status(201).json(list);
  } catch (err) {
    next(err);
  }
}

async function updateList(req, res, next) {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!validateName(name)) {
      return res.status(400).json({ error: 'Le nom de la liste est requis (max 150 caractères)' });
    }
    const list = await hierarchyModel.findListById(id);
    if (!list) {
      return res.status(404).json({ error: 'Liste introuvable' });
    }
    const updated = await hierarchyModel.updateList(id, name);
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPDATE_LIST',
      entityType: 'task_list',
      entityId: id,
      details: { name },
    });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteList(req, res, next) {
  try {
    const { id } = req.params;
    const list = await hierarchyModel.findListById(id);
    if (!list || list.deleted_at) {
      return res.status(404).json({ error: 'Projet introuvable' });
    }
    const deleted = await hierarchyModel.deleteList(id, req.user.id);
    if (!deleted) {
      return res.status(409).json({ error: 'Ce projet a déjà été supprimé' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'DELETE_PROJECT',
      entityType: 'task_list',
      entityId: id,
      details: { name: list.name, tasks_preserved: true },
    });
    res.status(200).json({ deleted: true, tasks_preserved: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSpaces,
  getSpacesTree,
  createSpace,
  updateSpace,
  deleteSpace,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  listLists,
  createList,
  updateList,
  deleteList,
};
