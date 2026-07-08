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

module.exports = { findByEmail, findById, create, USER_STATUS, USER_ROLE };
