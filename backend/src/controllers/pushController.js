const env = require('../config/env');
const pushModel = require('../models/pushSubscription.model');

// Clé publique VAPID nécessaire au navigateur pour créer un abonnement (PushManager.subscribe).
// Non secrète : peut être exposée. Renvoie null si le push n'est pas configuré côté serveur.
function getPublicKey(req, res) {
  res.status(200).json({ publicKey: env.vapidPublicKey || null });
}

async function subscribe(req, res, next) {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ error: 'Abonnement invalide' });
    }
    await pushModel.upsert(req.user.id, subscription, req.headers['user-agent']);
    res.status(201).json({ status: 'subscribed' });
  } catch (err) {
    next(err);
  }
}

async function unsubscribe(req, res, next) {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint requis' });
    }
    await pushModel.removeByEndpoint(endpoint);
    res.status(200).json({ status: 'unsubscribed' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPublicKey, subscribe, unsubscribe };
