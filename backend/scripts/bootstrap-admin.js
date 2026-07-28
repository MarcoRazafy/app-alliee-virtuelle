/*
 * Amorçage automatique du 1er administrateur au démarrage (déploiement).
 * Piloté par variables d'environnement — le mot de passe NE doit JAMAIS être commité :
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME  (et ADMIN_USERNAME facultatif)
 *
 * Comportement (toujours sûr, ne bloque jamais le boot — sort en code 0) :
 *   - variables absentes         → ignoré silencieusement
 *   - compte déjà présent         → ignoré (pas de doublon, pas de réinitialisation)
 *   - sinon                        → crée l'administrateur (rôle ADMIN, statut ACTIF)
 */
const bcrypt = require('bcrypt');
const db = require('../src/config/database');
const { isValidEmail, isValidPassword } = require('../src/utils/validators');

const SALT_ROUNDS = 10;

async function resolveUsername(preferred, email) {
  const base = (preferred || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 45) || 'admin';
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while ((await db.query('SELECT 1 FROM users WHERE username = $1', [candidate])).rowCount > 0) {
    n += 1;
    candidate = `${base}${n}`.slice(0, 50);
  }
  return candidate;
}

async function run() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || '').trim();

  if (!email && !password && !name) {
    console.log('bootstrap-admin : ADMIN_* non définies → ignoré.');
    return;
  }
  if (!isValidEmail(email) || !isValidPassword(password) || !name) {
    console.warn('⚠️  bootstrap-admin : ADMIN_EMAIL / ADMIN_PASSWORD (≥8) / ADMIN_NAME requis et valides → ignoré.');
    return;
  }

  const existing = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    console.log(`bootstrap-admin : le compte ${email} existe déjà → ignoré.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const username = await resolveUsername(process.env.ADMIN_USERNAME, email);
  await db.query(
    `INSERT INTO users (email, password_hash, full_name, username, role, status)
     VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIF')`,
    [email, passwordHash, name, username]
  );
  console.log(`✅ bootstrap-admin : administrateur créé (${email}, username: ${username}).`);
}

run()
  .catch((err) => {
    // Ne jamais bloquer le démarrage du serveur à cause de l'amorçage admin.
    console.error('⚠️  bootstrap-admin : erreur non bloquante :', err.message);
  })
  .finally(async () => {
    await db.pool.end().catch(() => {});
    process.exit(0);
  });
