const db = require('../config/database');
const messageModel = require('../models/message.model');
const userModel = require('../models/user.model');
const sessionModel = require('../models/session.model');
const realtime = require('../realtime/io');

const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

// Construit l'objet pièce jointe à partir du fichier multer (ou null).
function attachmentFrom(req) {
  if (!req.file) return null;
  return { path: req.file.path, name: req.file.originalname, type: req.file.mimetype, size: req.file.size };
}

function hasBody(req) {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  return content.length > 0 || Boolean(req.file);
}

async function getGlobalMessages(req, res, next) {
  try {
    const messages = await messageModel.findGlobalMessages(req.user.id);
    res.status(200).json(messages);
  } catch (err) {
    next(err);
  }
}

async function postGlobalMessage(req, res, next) {
  try {
    if (!hasBody(req)) {
      return res.status(400).json({ error: 'The message cannot be empty' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const message = await messageModel.createGlobalMessage(req.user.id, content, attachmentFrom(req));
    // Temps réel : prévenir tout le monde qu'un message a été posté dans le salon global.
    realtime.broadcast('message:new', { scope: 'global', authorId: req.user.id });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function getConversations(req, res, next) {
  try {
    const conversations = await messageModel.findConversationsForUser(req.user.id);
    res.status(200).json(conversations);
  } catch (err) {
    next(err);
  }
}

async function getPrivateMessages(req, res, next) {
  try {
    const { userId } = req.params;

    const otherUser = await userModel.findById(userId);
    if (!otherUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    const messages = await messageModel.findPrivateMessages(req.user.id, userId);
    await messageModel.markAsRead(req.user.id, userId);

    res.status(200).json(messages);
  } catch (err) {
    next(err);
  }
}

async function postPrivateMessage(req, res, next) {
  try {
    const { userId } = req.params;
    if (!hasBody(req)) {
      return res.status(400).json({ error: 'The message cannot be empty' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot send a message to yourself' });
    }

    const recipient = await userModel.findById(userId);
    if (!recipient) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    let conversation = await messageModel.findConversationBetween(req.user.id, userId);
    if (!conversation) {
      conversation = await messageModel.createConversation(req.user.id, userId);
    } else {
      await messageModel.touchConversation(conversation.id);
    }

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const message = await messageModel.createPrivateMessage(req.user.id, userId, content, attachmentFrom(req));
    // Temps réel : prévenir le destinataire (et les autres onglets de l'auteur).
    realtime.emitToUsers([userId, req.user.id], 'message:new', {
      scope: 'private',
      authorId: req.user.id,
      recipientId: userId,
    });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function getGroups(req, res, next) {
  try {
    const groups = await messageModel.findGroupsForUser(req.user.id);
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
}

async function createGroup(req, res, next) {
  try {
    const normalizedName = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
    // En multipart (avec photo), member_ids arrive en chaîne JSON ; sinon en tableau.
    let requestedMemberIds = req.body.member_ids;
    if (typeof requestedMemberIds === 'string') {
      try { requestedMemberIds = JSON.parse(requestedMemberIds); } catch { requestedMemberIds = []; }
    }
    if (!Array.isArray(requestedMemberIds)) requestedMemberIds = [];

    if (normalizedName.length < 2 || normalizedName.length > 100) {
      return res.status(400).json({ error: 'The group name must be between 2 and 100 characters' });
    }

    const memberIds = [...new Set(requestedMemberIds.filter((id) => typeof id === 'string' && id !== req.user.id))];
    if (memberIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one person to create the group' });
    }
    if (memberIds.length > 50) {
      return res.status(400).json({ error: 'Un groupe ne peut pas contenir plus de 50 personnes' });
    }

    const activeUsers = await userModel.findActiveExcept(req.user.id);
    const activeUserIds = new Set(activeUsers.map((user) => user.id));
    const invalidMemberIds = memberIds.filter((id) => !activeUserIds.has(id));
    if (invalidMemberIds.length > 0) {
      return res.status(400).json({ error: 'One or more selected people are no longer available' });
    }

    const avatarPath = req.file ? req.file.path : null;
    const group = await db.withTransaction((client) =>
      messageModel.createGroup(
        {
          name: normalizedName,
          creatorId: req.user.id,
          memberIds: [req.user.id, ...memberIds],
          avatarPath,
        },
        client
      )
    );

    const createdGroup = await messageModel.findGroupForUser(group.id, req.user.id);
    res.status(201).json(createdGroup);
  } catch (err) {
    next(err);
  }
}

async function getGroupMessages(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await messageModel.findGroupForUser(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found or access denied' });
    }

    const messages = await messageModel.findGroupMessages(groupId, req.user.id);
    await messageModel.markGroupAsRead(groupId, req.user.id);
    res.status(200).json(messages);
  } catch (err) {
    next(err);
  }
}

async function postGroupMessage(req, res, next) {
  try {
    const { groupId } = req.params;
    if (!hasBody(req)) {
      return res.status(400).json({ error: 'The message cannot be empty' });
    }

    const group = await messageModel.findGroupForUser(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found or access denied' });
    }

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const message = await db.withTransaction((client) =>
      messageModel.createGroupMessage(groupId, req.user.id, content, attachmentFrom(req), client)
    );
    // Temps réel : prévenir tous les membres du groupe.
    const memberIds = await messageModel.findGroupMemberIds(groupId);
    realtime.emitToUsers(memberIds, 'message:new', { scope: 'group', groupId, authorId: req.user.id });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

// --- Vérifie que l'utilisateur a accès au message (même canal). ---
async function canAccessMessage(raw, user) {
  if (raw.channel_type === 'GLOBAL') return true;
  if (raw.channel_type === 'PRIVATE') return raw.author_id === user.id || raw.recipient_id === user.id;
  if (raw.channel_type === 'GROUP') {
    const group = await messageModel.findGroupForUser(raw.group_id, user.id);
    return Boolean(group);
  }
  return false;
}

async function editMessage(req, res, next) {
  try {
    const raw = await messageModel.findRawMessageById(req.params.id);
    if (!raw) return res.status(404).json({ error: 'Message introuvable' });
    if (raw.deleted_at) return res.status(400).json({ error: 'Message deleted' });
    if (raw.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres messages' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ error: 'The message cannot be empty' });
    const message = await messageModel.updateMessageContent(req.params.id, content, req.user.id);
    res.status(200).json(message);
  } catch (err) {
    next(err);
  }
}

async function deleteMessage(req, res, next) {
  try {
    const raw = await messageModel.findRawMessageById(req.params.id);
    if (!raw) return res.status(404).json({ error: 'Message introuvable' });
    // L'auteur ou un administrateur peut supprimer.
    if (raw.author_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Deletion not allowed' });
    }
    await messageModel.softDeleteMessage(req.params.id);
    res.status(200).json({ deleted: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
}

async function reactMessage(req, res, next) {
  try {
    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji : '';
    if (!ALLOWED_REACTIONS.includes(emoji)) {
      return res.status(400).json({ error: 'Reaction not allowed' });
    }
    const raw = await messageModel.findRawMessageById(req.params.id);
    if (!raw || raw.deleted_at) return res.status(404).json({ error: 'Message introuvable' });
    if (!(await canAccessMessage(raw, req.user))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const message = await messageModel.toggleReaction(req.params.id, req.user.id, emoji);
    res.status(200).json(message);
  } catch (err) {
    next(err);
  }
}

async function getMessageAttachment(req, res, next) {
  try {
    const raw = await messageModel.findRawMessageById(req.params.id);
    if (!raw || raw.deleted_at || !raw.attachment_path) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    if (!(await canAccessMessage(raw, req.user))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.download(raw.attachment_path, raw.attachment_name || 'piece-jointe');
  } catch (err) {
    next(err);
  }
}

async function getGroupAvatar(req, res, next) {
  try {
    const avatarPath = await messageModel.findGroupAvatarForMember(req.params.groupId, req.user.id);
    if (!avatarPath) return res.status(404).json({ error: 'Avatar introuvable' });
    res.sendFile(avatarPath);
  } catch (err) {
    next(err);
  }
}

// Ids des utilisateurs actuellement connectés (session ouverte) — pour le statut « en ligne ».
async function getOnlineUsers(req, res, next) {
  try {
    // Présence "temps réel" : uniquement les utilisateurs réellement en ligne (définition
    // partagée) — plus de pastille verte qui reste allumée après la fermeture du navigateur.
    res.status(200).json(await sessionModel.findLiveUserIds());
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getGlobalMessages,
  postGlobalMessage,
  getConversations,
  getPrivateMessages,
  postPrivateMessage,
  getGroups,
  createGroup,
  getGroupMessages,
  postGroupMessage,
  editMessage,
  deleteMessage,
  reactMessage,
  getMessageAttachment,
  getGroupAvatar,
  getOnlineUsers,
};
