const announcementModel = require('../models/announcement.model');
const realtime = require('../realtime/io');

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

    const created = await announcementModel.create({ authorId: req.user.id, title, body });
    // Temps réel : déclenche le popup + la pastille chez tous les utilisateurs connectés.
    realtime.broadcast('announcement:new', { id: created.id, title: created.title });
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
    const updated = await announcementModel.update(req.params.id, { title, body });
    if (!updated) return res.status(404).json({ error: 'Annonce introuvable' });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

async function deleteAnnouncement(req, res, next) {
  try {
    await announcementModel.remove(req.params.id);
    res.status(200).json({ deleted: true });
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
  markRead,
  getReaders,
};
