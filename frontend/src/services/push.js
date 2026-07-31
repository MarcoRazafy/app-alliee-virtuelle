import api from './api';
import { PUSH_API_PATHS } from './pushPaths.js';

// Notifications push (Web Push). S'appuie sur le service worker de la PWA. Fonctionne sur
// Chrome/Edge/Firefox (PC + Android) et sur iPhone UNIQUEMENT en PWA installée (iOS 16.4+).

// Le push nécessite : un service worker, l'API Push et l'API Notification.
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPermission() {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

// Convertit la clé VAPID publique (base64 URL-safe) en Uint8Array attendu par PushManager.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration() {
  // La PWA (vite-plugin-pwa) enregistre déjà le SW ; on attend qu'il soit prêt.
  return navigator.serviceWorker.ready;
}

// Demande la permission puis crée/enregistre l'abonnement push côté serveur.
// Renvoie true si l'utilisateur est bien abonné. Jette une Error lisible en cas d'échec.
export async function enablePush() {
  if (!isPushSupported()) {
    throw new Error('Notifications non supportées sur cet appareil / ce navigateur.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permission de notification refusée.');
  }

  const { data } = await api.get(PUSH_API_PATHS.publicKey);
  const publicKey = data?.publicKey;
  if (!publicKey) {
    throw new Error('Notifications push non configurées sur le serveur.');
  }

  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api.post(PUSH_API_PATHS.subscribe, { subscription });
  return true;
}

// Désabonne l'appareil (localement + côté serveur).
export async function disablePush() {
  if (!isPushSupported()) return;
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {});
  await api.post(PUSH_API_PATHS.unsubscribe, { endpoint }).catch(() => {});
}

// Cet appareil est-il déjà abonné (un abonnement push existe) ?
export async function isSubscribed() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return Boolean(subscription);
}
