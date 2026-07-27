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

async function findByUsername(username) {
  const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0] || null;
}

// Login : accepte indifféremment un email ou un nom d'utilisateur
async function findByEmailOrUsername(identifier) {
  const result = await db.query('SELECT * FROM users WHERE email = $1 OR username = $1', [identifier]);
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// Renvoie le sous-ensemble des ids fournis qui correspond à des utilisateurs existants
async function findExistingIds(ids) {
  if (ids.length === 0) return [];
  const result = await db.query('SELECT id FROM users WHERE id = ANY($1::uuid[])', [ids]);
  return result.rows.map((row) => row.id);
}

async function create({
  email,
  passwordHash,
  firstName,
  lastName,
  username,
  phone,
  position,
  postalAddress,
  birthDate,
  fullName,
}) {
  // full_name reste alimenté (beaucoup de code existant s'appuie dessus) : dérivé de
  // firstName + lastName si fournis, sinon on retombe sur fullName (rétrocompatibilité)
  const resolvedFullName = firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : fullName;

  const result = await db.query(
    `INSERT INTO users (
       email, password_hash, full_name, first_name, last_name, username,
       phone_number, position, postal_address, birth_date, role, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, email, full_name, first_name, last_name, username, phone_number, position, role, status, created_at`,
    [
      email,
      passwordHash,
      resolvedFullName,
      firstName || null,
      lastName || null,
      username || null,
      phone,
      position,
      postalAddress || null,
      birthDate || null,
      USER_ROLE.EMPLOYEE,
      USER_STATUS.PENDING,
    ]
  );
  return result.rows[0];
}

async function updatePasswordHash(id, passwordHash) {
  await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, id]);
}

// full_name reste dérivé de first_name + last_name pour rester cohérent avec create()
async function updateProfile(id, { firstName, lastName, phone, postalAddress, birthDate }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const result = await db.query(
    `UPDATE users
     SET first_name = $1, last_name = $2, full_name = $3, phone_number = $4,
         postal_address = $5, birth_date = $6, updated_at = now()
     WHERE id = $7
     RETURNING id, email, username, first_name, last_name, full_name, phone_number, position, postal_address, birth_date, role, status`,
    [firstName, lastName, fullName, phone, postalAddress || null, birthDate || null, id]
  );
  return result.rows[0];
}

// Annuaire minimal pour démarrer une conversation : seuls les comptes actifs, sans données sensibles
async function findActiveExcept(userId) {
  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.role, (a.id IS NOT NULL) AS has_avatar
     FROM users u
     LEFT JOIN user_avatars a ON a.user_id = u.id
     WHERE u.id != $1 AND u.status = $2
     ORDER BY u.full_name ASC`,
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
    `SELECT id, email, full_name, first_name, last_name, username,
            phone_number, position, postal_address, birth_date, role, status, created_at,
            EXISTS (SELECT 1 FROM user_avatars av WHERE av.user_id = users.id) AS has_avatar
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
  findByUsername,
  findByEmailOrUsername,
  findById,
  findExistingIds,
  create,
  updatePasswordHash,
  updateProfile,
  findActiveExcept,
  findAllFiltered,
  findPending,
  updateStatus,
  promoteToAdmin,
  USER_STATUS,
  USER_ROLE,
};
