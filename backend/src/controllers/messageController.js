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

module.exports = {
  getGlobalMessages,
  postGlobalMessage,
  getConversations,
  getPrivateMessages,
  postPrivateMessage,
};
