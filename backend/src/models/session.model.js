const db = require('../config/database');

// Chrono de connexion (présence) : indépendant du chrono de tâche (table timelog).
// Une ligne = une période "connecté" (login -> déconnexion ou fermeture de l'application).

async function startSession(userId) {
  const result = await db.query(
    `INSERT INTO user_sessions (user_id, login_at) VALUES ($1, now()) RETURNING id, user_id, login_at, logout_at`,
    [userId]
  );
  return result.rows[0];
}

// Ferme toute session restée ouverte pour cet utilisateur (défensif : gère aussi le cas
// de plusieurs onglets ou d'une session jamais fermée proprement lors d'une session précédente).
async function closeOpenSessions(userId) {
  const result = await db.query(
    `UPDATE user_sessions SET logout_at = now()
     WHERE user_id = $1 AND logout_at IS NULL
     RETURNING id, user_id, login_at, logout_at`,
    [userId]
  );
  return result.rows;
}

// Sessions qui chevauchent au moins partiellement [rangeStartIso, rangeEndIso[.
// Une session encore ouverte (logout_at IS NULL) est traitée comme "en cours jusqu'à maintenant".
async function findSessionsOverlappingRange(userId, rangeStartIso, rangeEndIso) {
  const result = await db.query(
    `SELECT id, login_at, logout_at
     FROM user_sessions
     WHERE user_id = $1
       AND login_at < $3
       AND COALESCE(logout_at, now()) > $2
     ORDER BY login_at ASC`,
    [userId, rangeStartIso, rangeEndIso]
  );
  return result.rows;
}

// Session actuellement ouverte (s'il y en a une) : utilisé pour le chrono flottant, qui
// affiche la durée de connexion écoulée depuis login_at.
async function findOpenSession(userId) {
  const result = await db.query(
    `SELECT id, login_at FROM user_sessions WHERE user_id = $1 AND logout_at IS NULL ORDER BY login_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = {
  startSession,
  closeOpenSessions,
  findSessionsOverlappingRange,
  findOpenSession,
};
