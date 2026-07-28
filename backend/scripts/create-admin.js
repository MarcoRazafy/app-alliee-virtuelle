/*
 * Crée (ou met à jour) un compte ADMINISTRATEUR — utile pour amorcer une base de PRODUCTION
 * fraîche, où aucun seed de test n'est appliqué (les seed_*.sql sont ignorés par migrate.js).
 *
 * Usage :
 *   node scripts/create-admin.js --email admin@exemple.com --password 'MotDePasseFort' --name "Prénom Nom" [--username admin]
 *   node scripts/create-admin.js --email admin@exemple.com --password '...' --name "..." --reset-password  # met à jour un compte existant
 *
 * Ou via variables d'environnement : ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_USERNAME.
 * Respecte DATABASE_URL / DATABASE_SSL comme le reste de l'app.
 */
const bcrypt = require('bcrypt');
const db = require('../src/config/database');
const { isValidEmail, isValidPassword } = require('../src/utils/validators');

const SALT_ROUNDS = 10;

function parseArgs(argv) {
  const args = { resetPassword: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--reset-password') args.resetPassword = true;
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--password') args.password = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--username') args.username = argv[++i];
  }
  return args;
}

function usageAndExit(message) {
  if (message) console.error(`\n❌ ${message}`);
  console.error(
    '\nUsage : node scripts/create-admin.js --email <email> --password <mot de passe> --name "<Prénom Nom>" [--username <username>] [--reset-password]\n' +
      '        (ou variables d\'env ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME / ADMIN_USERNAME)\n'
  );
  process.exit(1);
}

// username unique (index partiel WHERE username IS NOT NULL) : on dérive un candidat depuis
// l'email et on ajoute un suffixe numérique tant qu'il est déjà pris.
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = (args.email || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = args.password || process.env.ADMIN_PASSWORD || '';
  const name = (args.name || process.env.ADMIN_NAME || '').trim();
  const wantedUsername = (args.username || process.env.ADMIN_USERNAME || '').trim();

  if (!isValidEmail(email)) usageAndExit('Email manquant ou invalide.');
  if (!isValidPassword(password)) usageAndExit('Mot de passe manquant ou trop court (8 caractères minimum).');

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const existing = await db.query('SELECT id, role, status FROM users WHERE email = $1', [email]);

  if (existing.rowCount > 0) {
    if (!args.resetPassword) {
      usageAndExit(
        `Un compte existe déjà avec ${email} (rôle ${existing.rows[0].role}). ` +
          'Relance avec --reset-password pour le promouvoir ADMIN + réinitialiser son mot de passe.'
      );
    }
    await db.query(
      "UPDATE users SET password_hash = $1, role = 'ADMIN', status = 'ACTIF', updated_at = now() WHERE email = $2",
      [passwordHash, email]
    );
    console.log(`✅ Compte existant mis à jour : ${email} est désormais ADMIN (ACTIF) avec un nouveau mot de passe.`);
    return;
  }

  if (!name) usageAndExit('Nom complet requis (--name "Prénom Nom") pour créer un nouveau compte.');
  const username = await resolveUsername(wantedUsername, email);

  const inserted = await db.query(
    `INSERT INTO users (email, password_hash, full_name, username, role, status)
     VALUES ($1, $2, $3, $4, 'ADMIN', 'ACTIF')
     RETURNING id, email, username, full_name, role, status`,
    [email, passwordHash, name, username]
  );
  const u = inserted.rows[0];
  console.log(`✅ Administrateur créé : ${u.full_name} <${u.email}> (username: ${u.username}) — rôle ${u.role}, statut ${u.status}.`);
  console.log('   Connecte-toi avec cet email (ou username) et le mot de passe fourni.');
}

main()
  .catch((err) => {
    console.error('\n❌ Échec de la création de l\'administrateur :', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end().catch(() => {});
  });
