const fs = require('fs');
const announcementModel = require('../models/announcement.model');
const taskModel = require('../models/task.model');
const realtime = require('../realtime/io');
const { sendFileOr404 } = require('../utils/sendFile');

function safeUnlink(filePath) {
  if (filePath) fs.promises.unlink(filePath).catch(() => {});
}

async function listAnnouncements(req, res, next) {
  try {
    const [items, unread] = await Promise.all([
      announcementModel.list(req.user.id),
      announcementModel.unreadCount(req.user.id),
    ]);
    res.status(200).json({ items, unread_count: unread });
  } catch (err) {
    next(err);
  }
}

// Pastille + popup : nombre non lu + l'annonce non lue la plus récente (ou null).
async function getUnread(req, res, next) {
  try {
    const [unread, latest] = await Promise.all([
      announcementModel.unreadCount(req.user.id),
      announcementModel.findLatestUnread(req.user.id),
    ]);
    res.status(200).json({ unread_count: unread, latest });
  } catch (err) {
    next(err);
  }
}

async function getAnnouncement(req, res, next) {
  try {
    const announcement = await announcementModel.findById(req.params.id, req.user.id);
    if (!announcement) return res.status(404).json({ error: 'Annonce introuvable' });
    res.status(200).json(announcement);
  } catch (err) {
    next(err);
  }
}

async function createAnnouncement(req, res, next) {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'Le titre est requis (max 200 caractères)' });
    }
    if (!body) {
      return res.status(400).json({ error: 'Le contenu est requis' });
    }

    const created = await announcementModel.create({
      authorId: req.user.id,
      title,
      body,
      isImportant: req.body.is_important === true || req.body.is_important === 'true',
      isPinned: req.body.is_pinned === true || req.body.is_pinned === 'true',
      imagePath: req.file ? req.file.path : null,
    });
    // Trace dans le journal → apparaît dans le centre de notifications de chacun.
    await taskModel.recordAudit({
      userId: req.user.id,
      action: 'PUBLISH_ANNOUNCEMENT',
      entityType: 'announcement',
      entityId: created.id,
      details: { title: created.title },
    });
    // Temps réel : popup + pastille annonces, et rafraîchissement du centre de notifications.
    realtime.broadcast('announcement:new', { id: created.id, title: created.title });
    realtime.broadcast('notification:new', { actorId: req.user.id });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

async function updateAnnouncement(req, res, next) {
  try {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'Le titre est requis (max 200 caractères)' });
    }
    if (!body) {
      return res.status(400).json({ error: 'Le contenu est requis' });
    }
    // Nouvelle image uploadée : on remplace et on supprime l'ancien fichier ; sinon on conserve.
    let imagePath;
    if (req.file) {
      const oldPath = await announcementModel.findImagePath(req.params.id);
      imagePath = req.file.path;
      safeUnlink(oldPath);
    }

    const updated = await announcementModel.update(req.params.id, {
      title,
      body,
      isImportant: req.body.is_important === true || req.body.is_important === 'true',
      isPinned: req.body.is_pinned === true || req.body.is_pinned === 'true',
      imagePath, // undefined si pas de nouveau fichier → l'image existante est conservée
    });
    if (!updated) return res.status(404).json({ error: 'Annonce introuvable' });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteAnnouncement(req, res, next) {
  try {
    const imagePath = await announcementModel.findImagePath(req.params.id);
    await announcementModel.remove(req.params.id);
    safeUnlink(imagePath);
    res.status(200).json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// Sert l'image uploadée d'une annonce (accessible à tout utilisateur authentifié).
async function getAnnouncementImage(req, res, next) {
  try {
    const imagePath = await announcementModel.findImagePath(req.params.id);
    if (!imagePath) return res.status(404).json({ error: 'Image introuvable' });
    return sendFileOr404(res, imagePath, 'Image introuvable');
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    await announcementModel.markRead(req.params.id, req.user.id);
    res.status(200).json({ read: true });
  } catch (err) {
    next(err);
  }
}

async function getReaders(req, res, next) {
  try {
    const readers = await announcementModel.findReaders(req.params.id);
    res.status(200).json(readers);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAnnouncements,
  getUnread,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncementImage,
  markRead,
  getReaders,
};
