const fs = require('fs');
const { sendFileOr404 } = require('../utils/sendFile');
const db = require('../config/database');
const messageModel = require('../models/message.model');
const userModel = require('../models/user.model');
const sessionModel = require('../models/session.model');
const realtime = require('../realtime/io');
const pushService = require('../services/push.service');

const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

// Supprime un fichier best-effort (ancienne photo de groupe) sans jamais faire échouer la requête.
function safeUnlink(filePath) {
  if (filePath) fs.promises.unlink(filePath).catch(() => {});
}

// Droit de gérer un groupe : le créateur ou un administrateur.
function canManageGroup(group, user) {
  return group.created_by === user.id || user.role === 'ADMIN';
}

// Construit l'objet pièce jointe à partir du fichier multer (ou null).
function attachmentFrom(req) {
  if (!req.file) return null;
  return { path: req.file.path, name: req.file.originalname, type: req.file.mimetype, size: req.file.size };
}

function hasBody(req) {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  return content.length > 0 || Boolean(req.file);
}

// Retire le HTML (les messages peuvent être mis en forme) pour un aperçu texte propre.
function stripHtml(value) {
  return (value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Aperçu court pour le corps de la notification push : le texte, ou une mention de la pièce jointe.
function pushPreview(content, hasAttachment) {
  const text = stripHtml(content);
  if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  return hasAttachment ? '📎 Pièce jointe' : 'Nouveau message';
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
      return res.status(400).json({ error: 'Le message ne peut pas être vide' });
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
      return res.status(400).json({ error: 'Le message ne peut pas être vide' });
    }
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Impossible de vous envoyer un message à vous-même' });
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
    // Notification push au destinataire (fonctionne même app fermée). Best-effort : n'interrompt
    // jamais la réponse. Le nom de l'expéditeur vient de son profil pour un libellé lisible.
    const author = await userModel.findById(req.user.id).catch(() => null);
    pushService
      .notifyUsers([userId], {
        title: author?.full_name || author?.username || 'Nouveau message',
        body: pushPreview(content, Boolean(req.file)),
        url: '/messaging',
        tag: `private-${req.user.id}`,
      })
      .catch(() => {});
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
      return res.status(400).json({ error: 'Le nom du groupe doit contenir entre 2 et 100 caractères' });
    }

    const memberIds = [...new Set(requestedMemberIds.filter((id) => typeof id === 'string' && id !== req.user.id))];
    if (memberIds.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins une personne pour créer le groupe' });
    }
    if (memberIds.length > 50) {
      return res.status(400).json({ error: 'Un groupe ne peut pas contenir plus de 50 personnes' });
    }

    const activeUsers = await userModel.findActiveExcept(req.user.id);
    const activeUserIds = new Set(activeUsers.map((user) => user.id));
    const invalidMemberIds = memberIds.filter((id) => !activeUserIds.has(id));
    if (invalidMemberIds.length > 0) {
      return res.status(400).json({ error: 'Une ou plusieurs personnes sélectionnées ne sont plus disponibles' });
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
      return res.status(404).json({ error: 'Groupe introuvable ou accès refusé' });
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
      return res.status(400).json({ error: 'Le message ne peut pas être vide' });
    }

    const group = await messageModel.findGroupForUser(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable ou accès refusé' });
    }

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    const message = await db.withTransaction((client) =>
      messageModel.createGroupMessage(groupId, req.user.id, content, attachmentFrom(req), client)
    );
    // Temps réel : prévenir tous les membres du groupe.
    const memberIds = await messageModel.findGroupMemberIds(groupId);
    realtime.emitToUsers(memberIds, 'message:new', { scope: 'group', groupId, authorId: req.user.id });
    // Notification push aux membres (sauf l'auteur). Best-effort.
    const author = await userModel.findById(req.user.id).catch(() => null);
    const authorName = author?.full_name || author?.username || "Quelqu'un";
    pushService
      .notifyUsers(
        memberIds,
        {
          title: group.name ? `${group.name}` : 'Nouveau message de groupe',
          body: `${authorName}: ${pushPreview(content, Boolean(req.file))}`,
          url: '/messaging',
          tag: `group-${groupId}`,
        },
        req.user.id
      )
      .catch(() => {});
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
    if (raw.deleted_at) return res.status(400).json({ error: 'Message supprimé' });
    if (raw.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres messages' });
    }
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ error: 'Le message ne peut pas être vide' });
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
      return res.status(403).json({ error: 'Suppression non autorisée' });
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
      return res.status(400).json({ error: 'Réaction non autorisée' });
    }
    const raw = await messageModel.findRawMessageById(req.params.id);
    if (!raw || raw.deleted_at) return res.status(404).json({ error: 'Message introuvable' });
    if (!(await canAccessMessage(raw, req.user))) {
      return res.status(403).json({ error: 'Accès refusé' });
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
      return res.status(404).json({ error: 'Pièce jointe introuvable' });
    }
    if (!(await canAccessMessage(raw, req.user))) {
      return res.status(403).json({ error: 'Accès refusé' });
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
    return sendFileOr404(res, avatarPath, 'Avatar introuvable');
  } catch (err) {
    next(err);
  }
}

// Renommer le groupe et/ou changer sa photo (créateur ou admin). Multipart : name en champ, photo en fichier.
async function updateGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await messageModel.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!canManageGroup(group, req.user)) {
      return res.status(403).json({ error: 'Seul le créateur ou un administrateur peut modifier le groupe' });
    }

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      const name = req.body.name.trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Le nom du groupe doit contenir entre 2 et 100 caractères' });
      }
      await messageModel.updateGroupName(groupId, name);
    }

    if (req.file) {
      await messageModel.updateGroupAvatar(groupId, req.file.path);
      safeUnlink(group.avatar_path); // supprime l'ancienne photo
    }

    const updated = await messageModel.findGroupForUser(groupId, req.user.id);
    const memberIds = await messageModel.findGroupMemberIds(groupId);
    realtime.emitToUsers(memberIds, 'group:changed', { groupId });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

// Supprimer le groupe (créateur ou admin). Cascade DB + suppression de la photo.
async function deleteGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await messageModel.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!canManageGroup(group, req.user)) {
      return res.status(403).json({ error: 'Seul le créateur ou un administrateur peut supprimer le groupe' });
    }
    const memberIds = await messageModel.findGroupMemberIds(groupId);
    await messageModel.deleteGroup(groupId);
    safeUnlink(group.avatar_path);
    realtime.emitToUsers(memberIds, 'group:deleted', { groupId });
    res.status(200).json({ deleted: true, groupId });
  } catch (err) {
    next(err);
  }
}

// Ajouter des membres (créateur ou admin).
async function addGroupMembers(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await messageModel.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!canManageGroup(group, req.user)) {
      return res.status(403).json({ error: 'Seul le créateur ou un administrateur peut ajouter des membres' });
    }
    let ids = req.body.member_ids;
    if (!Array.isArray(ids)) ids = [];
    const requested = [...new Set(ids.filter((id) => typeof id === 'string'))];
    if (requested.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez au moins une personne' });
    }
    const activeUsers = await userModel.findActiveExcept(req.user.id);
    const activeIds = new Set(activeUsers.map((user) => user.id));
    const valid = requested.filter((id) => activeIds.has(id));
    if (valid.length === 0) {
      return res.status(400).json({ error: 'Aucune personne valide sélectionnée' });
    }

    await messageModel.addGroupMembers(groupId, valid);
    const updated = await messageModel.findGroupForUser(groupId, req.user.id);
    // Prévenir tous les membres (y compris les nouveaux, dont la liste doit se rafraîchir).
    const memberIds = await messageModel.findGroupMemberIds(groupId);
    realtime.emitToUsers(memberIds, 'group:changed', { groupId });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

// Retirer un membre (créateur ou admin ; on ne peut pas retirer le créateur).
async function removeGroupMember(req, res, next) {
  try {
    const { groupId, userId } = req.params;
    const group = await messageModel.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!canManageGroup(group, req.user)) {
      return res.status(403).json({ error: 'Seul le créateur ou un administrateur peut retirer un membre' });
    }
    if (userId === group.created_by) {
      return res.status(400).json({ error: 'Impossible de retirer le créateur du groupe' });
    }
    // On récupère les membres AVANT retrait pour notifier aussi la personne retirée.
    const affected = await messageModel.findGroupMemberIds(groupId);
    await messageModel.removeGroupMember(groupId, userId);
    const updated = await messageModel.findGroupForUser(groupId, req.user.id);
    realtime.emitToUsers(affected, 'group:changed', { groupId });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

// Quitter un groupe (tout membre). Si le créateur quitte : transfert au plus ancien membre, ou suppression si plus personne.
async function leaveGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    const group = await messageModel.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'Groupe introuvable' });
    if (!(await messageModel.isGroupMember(groupId, req.user.id))) {
      return res.status(400).json({ error: "Vous n'êtes pas membre de ce groupe" });
    }
    const affected = await messageModel.findGroupMemberIds(groupId);

    if (group.created_by === req.user.id) {
      const newOwner = await messageModel.findOldestMember(groupId, req.user.id);
      if (!newOwner) {
        // Dernier membre : on supprime le groupe.
        await messageModel.deleteGroup(groupId);
        safeUnlink(group.avatar_path);
        realtime.emitToUsers(affected, 'group:deleted', { groupId });
        return res.status(200).json({ left: true, deleted: true, groupId });
      }
      await messageModel.setGroupCreator(groupId, newOwner);
    }

    await messageModel.removeGroupMember(groupId, req.user.id);
    realtime.emitToUsers(affected, 'group:changed', { groupId });
    res.status(200).json({ left: true, groupId });
  } catch (err) {
    next(err);
  }
}

// Transférer un message (texte + pièce jointe) vers une autre destination : global / privé / groupe.
async function forwardMessage(req, res, next) {
  try {
    const source = await messageModel.findMessageForForward(req.params.id);
    if (!source || source.deleted_at) return res.status(404).json({ error: 'Message introuvable' });
    if (!(await canAccessMessage(source, req.user))) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const targetType = req.body.target_type;
    const targetId = req.body.target_id;
    const content = source.content || '';
    const attachment = source.attachment_path
      ? {
          path: source.attachment_path,
          name: source.attachment_name,
          type: source.attachment_type,
          size: source.attachment_size,
        }
      : null;
    if (!content && !attachment) {
      return res.status(400).json({ error: 'Ce message ne peut pas être transféré' });
    }

    if (targetType === 'global') {
      const message = await messageModel.createGlobalMessage(req.user.id, content, attachment);
      realtime.broadcast('message:new', { scope: 'global', authorId: req.user.id });
      return res.status(201).json(message);
    }

    if (targetType === 'private') {
      if (!targetId || targetId === req.user.id) {
        return res.status(400).json({ error: 'Destinataire invalide' });
      }
      const recipient = await userModel.findById(targetId);
      if (!recipient) return res.status(404).json({ error: 'Destinataire introuvable' });
      const existing = await messageModel.findConversationBetween(req.user.id, targetId);
      if (!existing) await messageModel.createConversation(req.user.id, targetId);
      else await messageModel.touchConversation(existing.id);
      const message = await messageModel.createPrivateMessage(req.user.id, targetId, content, attachment);
      realtime.emitToUsers([targetId, req.user.id], 'message:new', {
        scope: 'private',
        authorId: req.user.id,
        recipientId: targetId,
      });
      return res.status(201).json(message);
    }

    if (targetType === 'group') {
      const group = await messageModel.findGroupForUser(targetId, req.user.id);
      if (!group) return res.status(404).json({ error: 'Groupe introuvable ou accès refusé' });
      const message = await db.withTransaction((client) =>
        messageModel.createGroupMessage(targetId, req.user.id, content, attachment, client)
      );
      const memberIds = await messageModel.findGroupMemberIds(targetId);
      realtime.emitToUsers(memberIds, 'message:new', { scope: 'group', groupId: targetId, authorId: req.user.id });
      return res.status(201).json(message);
    }

    return res.status(400).json({ error: 'Destination invalide' });
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
  updateGroup,
  deleteGroup,
  addGroupMembers,
  removeGroupMember,
  leaveGroup,
  forwardMessage,
  getOnlineUsers,
};
