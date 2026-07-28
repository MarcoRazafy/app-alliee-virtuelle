// Prépare des utilisateurs connus dans la base de TEST. Suppose que setupTestDb a déjà
// basculé DATABASE_URL (donc require ce fichier APRÈS setupTestDb).
const bcrypt = require('bcrypt');
const db = require('../../src/config/database');

const PASSWORD = 'Test1234!';
const HASH = bcrypt.hashSync(PASSWORD, 10); // hashé une fois au chargement

const ADMIN = { email: 'itest.admin@alliee.test', username: 'itest_admin', role: 'ADMIN', status: 'ACTIF' };
const EMPLOYEE = { email: 'itest.employee@alliee.test', username: 'itest_employee', role: 'EMPLOYEE', status: 'ACTIF' };
const PENDING = { email: 'itest.pending@alliee.test', username: 'itest_pending', role: 'EMPLOYEE', status: 'EN_ATTENTE' };

async function insertUser(u, first, last) {
  const r = await db.query(
    `INSERT INTO users (email, password_hash, full_name, first_name, last_name, username, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [u.email, HASH, `${first} ${last}`, first, last, u.username, u.role, u.status]
  );
  return r.rows[0].id;
}

// Remet la base de test dans un état connu, puis crée admin + employé + compte en attente.
async function seedAll() {
  await db.query('TRUNCATE tasks, task_history, timelog, user_daily_selection, user_sessions, audit_log, users CASCADE');
  const adminId = await insertUser(ADMIN, 'Admin', 'Integration');
  const employeeId = await insertUser(EMPLOYEE, 'Employe', 'Integration');
  const pendingId = await insertUser(PENDING, 'Pending', 'Integration');
  return { adminId, employeeId, pendingId };
}

module.exports = { seedAll, PASSWORD, ADMIN, EMPLOYEE, PENDING };
