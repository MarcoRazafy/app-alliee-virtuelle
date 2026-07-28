const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt.util');

// Serveur temps réel (WebSockets via Socket.IO). Remplace le polling pour pousser
// les événements (nouveaux messages…) instantanément aux bons utilisateurs.
let io = null;

// Room dédiée par utilisateur → permet d'envoyer un événement à une personne précise.
function userRoom(userId) {
  return `user:${userId}`;
}

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    // Même politique permissive que l'API REST (cors() global). À restreindre en prod.
    cors: { origin: '*' },
  });

  // Authentification par JWT dès la poignée de main : un socket non authentifié est rejeté.
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return next(new Error('Token manquant'));
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(userRoom(socket.user.id));
  });

  return io;
}

// Envoi ciblé à un utilisateur (toutes ses connexions ouvertes : onglets, mobile…).
function emitToUser(userId, event, payload) {
  if (io && userId) io.to(userRoom(userId)).emit(event, payload);
}

// Envoi à plusieurs utilisateurs (ex. membres d'un groupe).
function emitToUsers(userIds, event, payload) {
  if (!io || !Array.isArray(userIds)) return;
  const rooms = [...new Set(userIds.filter(Boolean))].map(userRoom);
  if (rooms.length) io.to(rooms).emit(event, payload);
}

// Diffusion à tous les utilisateurs connectés (ex. salon global).
function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { initRealtime, emitToUser, emitToUsers, broadcast, getIo: () => io };
