const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt.util');
const { AUTH_COOKIE, parseCookieHeader } = require('../utils/cookies');

let io = null;

function userRoom(userId) {
  return `user:${userId}`;
}

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      parseCookieHeader(socket.handshake.headers.cookie)[AUTH_COOKIE];
    if (!token) return next(new Error('Jeton manquant'));
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error('Token invalide ou expiré'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.user.id));
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (io && userId) io.to(userRoom(userId)).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  if (!io || !Array.isArray(userIds)) return;
  const rooms = [...new Set(userIds.filter(Boolean))].map(userRoom);
  if (rooms.length) io.to(rooms).emit(event, payload);
}

function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { initRealtime, emitToUser, emitToUsers, broadcast, getIo: () => io };
