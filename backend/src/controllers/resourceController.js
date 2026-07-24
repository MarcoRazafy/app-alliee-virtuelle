const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const resourceModel = require('../models/resource.model');
const taskModel = require('../models/task.model');
const userModel = require('../models/user.model');

const FOLDER_TYPES = ['INTERNE', 'CLIENT'];
const PERMISSION_TYPES = ['LECTURE_SEULE', 'LECTURE_ECRITURE'];

// Étiquette courte lisible (ex: "PDF", "PNG") dérivée de l'extension du fichier uploadé.
function labelFromFileName(fileName) {
  const ext = path.extname(fileName).replace('.', '').toUpperCase();
  return ext || 'Fichier';
}

// Assainissement minimal du HTML des documents (auteurs = admins, donc risque faible) :
// on retire les balises <script>, les gestionnaires on*, et les URLs javascript:.
function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*(iframe|object|embed|link|meta)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

async function getFolders(req, res, next) {
  try {
    const { type } = req.query;
    if (!FOLDER_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Le paramètre type doit être INTERNE ou CLIENT' });
    }

    const folders = await resourceModel.findFolders(type);
    res.status(200).json(folders);
  } catch (err) {
    next(err);
  }
}

async function getFolderFiles(req, res, next) {
  try {
    const { id } = req.params;

    const folder = await resourceModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const files = await resourceModel.findFilesByFolder(id);
    res.status(200).json(files);
  } catch (err) {
    next(err);
  }
}

async function createFolder(req, res, next) {
  try {
    const { name, type, parent_folder_id: parentFolderId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom du dossier est requis' });
    }
    if (!FOLDER_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Type de dossier invalide' });
    }

    const folder = await resourceModel.createFolder({
      name,
      type,
      parentFolderId,
      createdBy: req.user.id,
    });

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_RESOURCE_FOLDER',
      entityType: 'resources_folder',
      entityId: folder.id,
      details: { name, type, parent_folder_id: parentFolderId || null },
    });

    res.status(201).json(folder);
  } catch (err) {
    next(err);
  }
}

async function renameFolder(req, res, next) {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Le nom du dossier est requis' });
    }

    const folder = await resourceModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const updated = await resourceModel.renameFolder(id, name);
    if (!updated) {
      return res.status(409).json({ error: 'Ce dossier a déjà été supprimé' });
    }

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'RENAME_RESOURCE_FOLDER',
      entityType: 'resources_folder',
      entityId: id,
      details: { old_name: folder.name, new_name: name },
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteFolder(req, res, next) {
  try {
    const { id } = req.params;

    const folder = await resourceModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const deleted = await resourceModel.deleteFolder(id, req.user.id);
    if (!deleted) {
      return res.status(409).json({ error: 'Ce dossier se trouve déjà dans la corbeille' });
    }

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'TRASH_RESOURCE_FOLDER',
      entityType: 'resources_folder',
      entityId: id,
      details: { name: folder.name, type: folder.type, recoverable: true },
    });

    res.status(200).json({ deleted: true, recoverable: true });
  } catch (err) {
    next(err);
  }
}

// Upload réel d'un fichier (PDF, image, Word...) : le binaire est déjà écrit sur
// disque par multer (config/resourceUpload), on n'enregistre ici que les métadonnées.
async function uploadFile(req, res, next) {
  try {
    const { id } = req.params;

    const folder = await resourceModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis' });
    }

    const file = await resourceModel.createFile({
      folderId: id,
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileType: labelFromFileName(req.file.originalname),
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      createdBy: req.user.id,
    });

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'UPLOAD_RESOURCE_FILE',
      entityType: 'resources_file',
      entityId: file.id,
      details: { file_name: file.file_name, folder_id: id },
    });

    res.status(201).json(file);
  } catch (err) {
    next(err);
  }
}

// Création d'un document éditable (contenu HTML rédigé dans la plateforme).
async function createDocument(req, res, next) {
  try {
    const { id } = req.params;
    const { file_name: fileName, content } = req.body;

    if (!fileName || !fileName.trim()) {
      return res.status(400).json({ error: 'Le titre du document est requis' });
    }

    const folder = await resourceModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const document = await resourceModel.createDocument({
      folderId: id,
      fileName: fileName.trim(),
      content: sanitizeHtml(content),
      createdBy: req.user.id,
    });

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'CREATE_RESOURCE_DOCUMENT',
      entityType: 'resources_file',
      entityId: document.id,
      details: { file_name: document.file_name, folder_id: id },
    });

    res.status(201).json(document);
  } catch (err) {
    next(err);
  }
}

// Mise à jour d'un document (titre et/ou contenu).
async function updateDocument(req, res, next) {
  try {
    const { id } = req.params;
    const { file_name: fileName, content } = req.body;

    const existing = await resourceModel.findFileById(id);
    if (!existing || existing.deleted_at || existing.folder_deleted_at || existing.kind !== 'DOCUMENT') {
      return res.status(404).json({ error: 'Document introuvable' });
    }

    const document = await resourceModel.updateDocument(id, {
      fileName: fileName && fileName.trim() ? fileName.trim() : undefined,
      content: content !== undefined ? sanitizeHtml(content) : undefined,
    });

    res.status(200).json(document);
  } catch (err) {
    next(err);
  }
}

// Métadonnées + contenu d'un fichier/document (utilisé pour ouvrir un document en lecture/édition).
async function getFile(req, res, next) {
  try {
    const { id } = req.params;
    const file = await resourceModel.findFileById(id);
    if (!file || file.deleted_at || file.folder_deleted_at) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    // On n'expose jamais le chemin disque au client.
    const { file_path: _filePath, ...safe } = file;
    res.status(200).json(safe);
  } catch (err) {
    next(err);
  }
}

// Sert le binaire d'un fichier uploadé, en inline (aperçu) ou en attachment (téléchargement).
async function serveFile(req, res, next, { disposition }) {
  try {
    const { id } = req.params;
    const file = await resourceModel.findFileById(id);
    if (
      !file ||
      file.deleted_at ||
      file.folder_deleted_at ||
      file.kind !== 'FILE' ||
      !file.file_path
    ) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }
    if (!fs.existsSync(file.file_path)) {
      return res.status(404).json({ error: 'Fichier absent du stockage' });
    }

    if (file.mime_type) res.type(file.mime_type);
    const encoded = encodeURIComponent(file.file_name);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encoded}`);
    res.sendFile(path.resolve(file.file_path));
  } catch (err) {
    next(err);
  }
}

function previewFile(req, res, next) {
  return serveFile(req, res, next, { disposition: 'inline' });
}

function downloadFile(req, res, next) {
  return serveFile(req, res, next, { disposition: 'attachment' });
}

async function deleteFile(req, res, next) {
  try {
    const { id } = req.params;

    const file = await resourceModel.findFileById(id);
    if (!file || file.deleted_at || file.folder_deleted_at) {
      return res.status(404).json({ error: 'Fichier introuvable' });
    }

    const deleted = await resourceModel.deleteFile(id, req.user.id);
    if (!deleted) {
      return res.status(409).json({ error: 'Ce fichier se trouve déjà dans la corbeille' });
    }

    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'TRASH_RESOURCE_FILE',
      entityType: 'resources_file',
      entityId: id,
      details: { file_name: file.file_name, folder_id: file.folder_id, recoverable: true },
    });

    res.status(200).json({ deleted: true, recoverable: true });
  } catch (err) {
    next(err);
  }
}

async function getTrash(req, res, next) {
  try {
    const trash = await resourceModel.findTrash();
    res.status(200).json(trash);
  } catch (err) {
    next(err);
  }
}

async function restoreFolder(req, res, next) {
  try {
    const { id } = req.params;
    const folder = await resourceModel.findFolderById(id);
    if (!folder || !folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable dans la corbeille' });
    }
    if (folder.parent_folder_id) {
      const parent = await resourceModel.findFolderById(folder.parent_folder_id);
      if (!parent || parent.deleted_at) {
        return res.status(409).json({ error: 'Restaurez d’abord le dossier parent' });
      }
    }

    const restored = await resourceModel.restoreFolder(id);
    if (!restored) {
      return res.status(409).json({ error: 'Ce dossier a déjà été restauré' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'RESTORE_RESOURCE_FOLDER',
      entityType: 'resources_folder',
      entityId: id,
      details: { name: folder.name, type: folder.type },
    });
    res.status(200).json(restored);
  } catch (err) {
    next(err);
  }
}

async function restoreFile(req, res, next) {
  try {
    const { id } = req.params;
    const file = await resourceModel.findFileById(id);
    if (!file || !file.deleted_at) {
      return res.status(404).json({ error: 'Fichier introuvable dans la corbeille' });
    }
    if (file.folder_deleted_at) {
      return res.status(409).json({ error: 'Restaurez d’abord le dossier contenant ce fichier' });
    }
    if (file.kind === 'FILE' && file.file_path && !fs.existsSync(file.file_path)) {
      return res.status(410).json({ error: 'Le fichier physique n’est plus disponible' });
    }

    const restored = await resourceModel.restoreFile(id);
    if (!restored) {
      return res.status(409).json({ error: 'Ce fichier a déjà été restauré' });
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'RESTORE_RESOURCE_FILE',
      entityType: 'resources_file',
      entityId: id,
      details: { file_name: file.file_name, folder_id: file.folder_id },
    });
    res.status(200).json(restored);
  } catch (err) {
    next(err);
  }
}

async function permanentlyDeleteFolder(req, res, next) {
  try {
    const { id } = req.params;
    const folder = await resourceModel.findFolderById(id);
    if (!folder || !folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable dans la corbeille' });
    }

    const filePaths = await resourceModel.findFilePathsInFolderTree(id);
    const deleted = await resourceModel.permanentlyDeleteFolder(id);
    if (!deleted) {
      return res.status(409).json({ error: 'Ce dossier ne peut plus être supprimé' });
    }
    for (const filePath of filePaths) {
      fs.unlink(filePath, () => {});
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'PERMANENT_DELETE_RESOURCE_FOLDER',
      entityType: 'resources_folder',
      entityId: id,
      details: { name: folder.name, type: folder.type, removed_files: filePaths.length },
    });
    res.status(200).json({ deleted: true, removed_files: filePaths.length });
  } catch (err) {
    next(err);
  }
}

async function permanentlyDeleteFile(req, res, next) {
  try {
    const { id } = req.params;
    const file = await resourceModel.findFileById(id);
    if (!file || !file.deleted_at) {
      return res.status(404).json({ error: 'Fichier introuvable dans la corbeille' });
    }

    const deleted = await resourceModel.permanentlyDeleteFile(id);
    if (!deleted) {
      return res.status(409).json({ error: 'Ce fichier ne peut plus être supprimé' });
    }
    if (file.kind === 'FILE' && file.file_path) {
      fs.unlink(file.file_path, () => {});
    }
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'PERMANENT_DELETE_RESOURCE_FILE',
      entityType: 'resources_file',
      entityId: id,
      details: { file_name: file.file_name, folder_id: file.folder_id },
    });
    res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

async function shareFolder(req, res, next) {
  try {
    const { id } = req.params;
    const { user_ids: userIds, permission_type: permissionType, expires_at: expiresAt } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins un employé' });
    }
    if (!PERMISSION_TYPES.includes(permissionType)) {
      return res.status(400).json({ error: 'Permission invalide' });
    }

    const folder = await resourceModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const existingIds = await userModel.findExistingIds(userIds);
    const missingIds = userIds.filter((userId) => !existingIds.includes(userId));
    if (missingIds.length > 0) {
      return res.status(400).json({ error: `Utilisateur(s) introuvable(s) : ${missingIds.join(', ')}` });
    }

    const shares = await db.withTransaction(async (client) => {
      const created = await resourceModel.createShares(
        { folderId: id, userIds, permissionType, expiresAt, sharedBy: req.user.id },
        client
      );
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'SHARE_FOLDER',
          entityType: 'resources_folder',
          entityId: id,
          details: { user_ids: userIds, permission_type: permissionType },
        },
        client
      );
      return created;
    });

    res.status(201).json(shares);
  } catch (err) {
    next(err);
  }
}

async function getFolderShares(req, res, next) {
  try {
    const { id } = req.params;

    const folder = await resourceModel.findFolderById(id);
    if (!folder || folder.deleted_at) {
      return res.status(404).json({ error: 'Dossier introuvable' });
    }

    const shares = await resourceModel.findSharesForFolder(id);
    res.status(200).json(shares);
  } catch (err) {
    next(err);
  }
}

async function revokeShare(req, res, next) {
  try {
    const { id } = req.params;

    const share = await resourceModel.findShareById(id);
    if (!share) {
      return res.status(404).json({ error: 'Partage introuvable' });
    }

    await db.withTransaction(async (client) => {
      await resourceModel.deleteShare(id, client);
      await taskModel.recordAudit(
        {
          userId: req.user.id,
          action: 'REVOKE_SHARE',
          entityType: 'resources_share',
          entityId: id,
          details: { folder_id: share.folder_id, shared_with_user_id: share.shared_with_user_id },
        },
        client
      );
    });

    res.status(200).json({ revoked: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFolders,
  getFolderFiles,
  createFolder,
  renameFolder,
  deleteFolder,
  uploadFile,
  createDocument,
  updateDocument,
  getFile,
  previewFile,
  downloadFile,
  deleteFile,
  getTrash,
  restoreFolder,
  restoreFile,
  permanentlyDeleteFolder,
  permanentlyDeleteFile,
  shareFolder,
  getFolderShares,
  revokeShare,
};
