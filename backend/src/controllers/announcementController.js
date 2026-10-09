const fs = require('fs');
const announcementModel = require('../models/announcement.model');
const taskModel = require('../models/task.model');
const realtime = require('../realtime/io');
const userModel = require('../models/user.model');
const mailService = require('../services/mail.service');
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

async function notifyTeamByEmail(announcement, author) {
  const [recipients, fullAuthor] = await Promise.all([
    userModel.findActiveExcept(author.id),
    userModel.findById(author.id),
  ]);
  const emails = recipients.map((u) => u.email).filter(Boolean);
  if (emails.length === 0) return;
  await mailService.sendAnnouncementToTeam(
    {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      authorName: fullAuthor?.full_name || author.username || null,
      isImportant: Boolean(announcement.is_important),
    },
    emails
  );
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
    realtime.broadcast('announcement:new', { id: created.id, title: created.title });

    try {
      await taskModel.recordAudit({
        userId: req.user.id,
        action: 'PUBLISH_ANNOUNCEMENT',
        entityType: 'announcement',
        entityId: created.id,
        details: { title: created.title },
      });
      realtime.broadcast('notification:new', { actorId: req.user.id });
    } catch (auditErr) {
      // eslint-disable-next-line no-console
      console.error('recordAudit(PUBLISH_ANNOUNCEMENT) a échoué:', auditErr);
    }

    notifyTeamByEmail(created, req.user).catch((mailErr) => {
      // eslint-disable-next-line no-console
      console.error("Email d'annonce : envoi échoué —", mailErr.message);
    });

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
      imagePath,
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
