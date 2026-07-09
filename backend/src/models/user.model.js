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

// Gestion admin : liste complète avec filtres
async function findAllFiltered({ status, role, search } = {}) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.query(
    `SELECT id, email, full_name, position, role, status, created_at
     FROM users
     ${where}
     ORDER BY full_name ASC`,
    params
  );
  return result.rows;
}

async function findPending() {
  const result = await db.query(
    `SELECT id, email, full_name, position, phone_number, role, status, created_at
     FROM users WHERE status = $1 ORDER BY created_at ASC`,
    [USER_STATUS.PENDING]
  );
  return result.rows;
}

async function updateStatus(id, status, client = db) {
  const result = await client.query(
    'UPDATE users SET status = $1, updated_at = now() WHERE id = $2 RETURNING id, status',
    [status, id]
  );
  return result.rows[0];
}

async function promoteToAdmin(id, client = db) {
  const result = await client.query(
    "UPDATE users SET role = 'ADMIN', updated_at = now() WHERE id = $1 RETURNING id, role",
    [id]
  );
  return result.rows[0];
}

module.exports = {
  findByEmail,
  findById,
  create,
  updatePasswordHash,
  findActiveExcept,
  findAllFiltered,
  findPending,
  updateStatus,
  promoteToAdmin,
  USER_STATUS,
  USER_ROLE,
};
