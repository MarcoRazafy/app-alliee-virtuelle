import api from './api';
import { PUSH_API_PATHS } from './pushPaths.js';

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

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration() {
  return navigator.serviceWorker.ready;
}

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

export async function disablePush() {
  if (!isPushSupported()) return;
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => {});
  await api.post(PUSH_API_PATHS.unsubscribe, { endpoint }).catch(() => {});
}

export async function isSubscribed() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return Boolean(subscription);
}
