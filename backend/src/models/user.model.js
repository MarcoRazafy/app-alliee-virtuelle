const db = require('../config/database');

const USER_STATUS = {
  PENDING: 'EN_ATTENTE',
  ACTIVE: 'ACTIF',
  SUSPENDED: 'SUSPENDU',
  REJECTED: 'REFUSÉ',
};

const USER_ROLE = {
  EMPLOYEE: 'EMPLOYEE',
  ADMIN: 'ADMIN',
};

async function findByEmail(email) {
  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function create({ email, passwordHash, fullName, phone, position }) {
  const result = await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, position, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, full_name, phone_number, position, role, status, created_at`,
    [email, passwordHash, fullName, phone, position, USER_ROLE.EMPLOYEE, USER_STATUS.PENDING]
  );
  return result.rows[0];
}

async function updatePasswordHash(id, passwordHash) {
  await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, id]);
}

// Annuaire minimal pour démarrer une conversation : seuls les comptes actifs, sans données sensibles
async function findActiveExcept(userId) {
  const result = await db.query(
    `SELECT id, full_name, role FROM users WHERE id != $1 AND status = $2 ORDER BY full_name ASC`,
    [userId, USER_STATUS.ACTIVE]
  );
  return result.rows;
}

module.exports = { findByEmail, findById, create, updatePasswordHash, findActiveExcept, USER_STATUS, USER_ROLE };
