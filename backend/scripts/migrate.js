#!/usr/bin/env node
/*
 * Runner de migrations SQL.
 *
 * Applique automatiquement les migrations manquantes, dans le bon ordre, une seule fois
 * chacune. L'état est mémorisé dans la table `schema_migrations` : plus besoin de se
 * souvenir de ce qui a déjà été joué.
 *
 * Usage :
 *   node scripts/migrate.js            # applique les migrations en attente
 *   node scripts/migrate.js --status   # liste appliquées / en attente (n'exécute rien)
 *   node scripts/migrate.js --baseline # marque toutes les migrations comme déjà appliquées
 *                                       #   (pour une base existante, SANS les rejouer)
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// On ne gère QUE le schéma : init.sql + fichiers numérotés (002_x.sql…).
// Les fichiers seed_*.sql et autres sont ignorés (ce ne sont pas des migrations).
function isMigrationFile(name) {
  return name === 'init.sql' || /^\d+.*\.sql$/.test(name);
}

// Ordre d'application : init.sql en premier, puis par numéro croissant.
function migrationOrderKey(name) {
  if (name === 'init.sql') return -1;
  const match = name.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(isMigrationFile)
    .sort((a, b) => migrationOrderKey(a) - migrationOrderKey(b));
}

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedSet() {
  const { rows } = await db.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function runStatus() {
  const applied = await appliedSet();
  const files = listMigrationFiles();
  console.log('État des migrations :\n');
  for (const file of files) {
    console.log(`  ${applied.has(file) ? '✔ appliquée ' : '▶ en attente'}  ${file}`);
  }
  const pending = files.filter((f) => !applied.has(f));
  console.log(`\n${pending.length} en attente sur ${files.length}.`);
}

async function runBaseline() {
  const files = listMigrationFiles();
  for (const file of files) {
    await db.query(
      'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [file]
    );
  }
  console.log(`Base de référence posée : ${files.length} migration(s) marquée(s) comme appliquée(s) (sans les rejouer).`);
}

async function runMigrate() {
  const applied = await appliedSet();
  const pending = listMigrationFiles().filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Aucune migration en attente. Base à jour. ✅');
    return;
  }

  console.log(`${pending.length} migration(s) à appliquer :\n`);
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`  ▶ ${file} ... `);
    // Chaque migration est jouée dans sa propre transaction : en cas d'échec, rien n'est
    // laissé à moitié appliqué, et elle sera re-tentée au prochain lancement.
    await db.withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log('OK');
  }
  console.log('\nMigrations appliquées. ✅');
}

async function main() {
  const arg = process.argv[2];
  await ensureTable();
  if (arg === '--status') await runStatus();
  else if (arg === '--baseline') await runBaseline();
  else await runMigrate();
  await db.pool.end();
}

main().catch((err) => {
  console.error('\n❌ Échec des migrations :', err.message);
  db.pool.end().finally(() => process.exit(1));
});
