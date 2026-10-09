const webpush = require('web-push');
const env = require('../config/env');
const pushModel = require('../models/pushSubscription.model');

const enabled = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
if (enabled) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
} else {
  console.warn('⚠️  VAPID non configuré : notifications push désactivées (VAPID_PUBLIC_KEY/PRIVATE_KEY manquants).');
}

function isEnabled() {
  return enabled;
}

async function notifyUsers(userIds, payload, exceptUserId = null) {
  if (!enabled) return;
  const targetIds = [...new Set((userIds || []).filter(Boolean))].filter((id) => id !== exceptUserId);
  if (targetIds.length === 0) return;

  let subscriptions;
  try {
    subscriptions = await pushModel.findByUserIds(targetIds);
  } catch (err) {
    console.error('Push : lecture des abonnements impossible', err);
    return;
  }

  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSubscription, body);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pushModel.removeById(sub.id).catch(() => {});
        } else {
          console.error('Push : envoi échoué', err.statusCode || err.message);
        }
      }
    })
  );
}

module.exports = { isEnabled, notifyUsers };
