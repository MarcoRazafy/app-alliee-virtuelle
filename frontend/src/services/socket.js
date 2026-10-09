import { io } from 'socket.io-client';
import { getToken } from './auth';
import { apiBaseUrl } from './api';

let socket = null;

export function getSocket() {
  if (socket) return socket;
  socket = io(apiBaseUrl || undefined, {
    auth: { token: getToken() },
    withCredentials: true,
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
