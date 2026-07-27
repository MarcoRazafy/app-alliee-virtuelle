import { io } from 'socket.io-client';
import { getToken } from './auth';
import { apiBaseUrl } from './api';

// Connexion WebSocket unique (Socket.IO) partagée par l'app, authentifiée par le JWT.
// Sert à recevoir les événements temps réel (nouveaux messages…) sans polling.
let socket = null;

export function getSocket() {
  if (socket) return socket;
  // URL vide → même origine que le front (le proxy Vite relaie /socket.io vers le backend).
  socket = io(apiBaseUrl || undefined, {
    auth: { token: getToken() },
    // Laisse Socket.IO choisir le meilleur transport (polling puis upgrade WebSocket),
    // ce qui reste robuste derrière un proxy.
    reconnection: true,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
