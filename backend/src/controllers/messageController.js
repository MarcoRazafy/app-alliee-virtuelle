const db = require('../config/database');
const messageModel = require('../models/message.model');
const userModel = require('../models/user.model');

async function getGlobalMessages(req, res, next) {
  try {
    const messages = await messageModel.findGlobalMessages();
    res.status(200).json(messages);
  } catch (err) {
    next(err);
  }
}

async function postGlobalMessage(req, res, next) {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Le message ne peut pas être vide' });
    }

    const message = await messageModel.createGlobalMessage(req.user.id, content);
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
    const { content } = req.body;

    if (!content || !content.trim()) {
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

    const message = await messageModel.createPrivateMessage(req.user.id, userId, content);
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
    const requestedMemberIds = Array.isArray(req.body.member_ids) ? req.body.member_ids : [];

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

    const group = await db.withTransaction((client) =>
      messageModel.createGroup(
        {
          name: normalizedName,
          creatorId: req.user.id,
          memberIds: [req.user.id, ...memberIds],
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

    const messages = await messageModel.findGroupMessages(groupId);
    await messageModel.markGroupAsRead(groupId, req.user.id);
    res.status(200).json(messages);
  } catch (err) {
    next(err);
  }
}

async function postGroupMessage(req, res, next) {
  try {
    const { groupId } = req.params;
    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';

    if (!content) {
      return res.status(400).json({ error: 'Le message ne peut pas être vide' });
    }

    const group = await messageModel.findGroupForUser(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ error: 'Groupe introuvable ou accès refusé' });
    }

    const message = await db.withTransaction((client) =>
      messageModel.createGroupMessage(groupId, req.user.id, content, client)
    );
    res.status(201).json(message);
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
};
