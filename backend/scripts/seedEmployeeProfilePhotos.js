/**
 * Associe les portraits générés de frontend/public/employer aux profils employés.
 *
 * Les fichiers sont copiés dans uploads/avatars, puis servis par les routes
 * d'avatar authentifiées existantes. Marco Razafimamonjy est volontairement
 * exclu et son avatar éventuel n'est jamais modifié.
 *
 * Lancer : npm run seed:employee-photos
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

const SOURCE_DIR = path.resolve(__dirname, '../../frontend/public/employer');
const AVATAR_DIR = path.resolve(__dirname, '../uploads/avatars');

const PHOTO_BY_EMPLOYEE = new Map([
  ['clara faure', 'call_ubk8a9rl7ly0RW7gv4yiB70N.png'],
  ['hugo moreau', 'call_e1GusJKHXKHKSLavXEeRyKgD.png'],
  ['julien petit', 'call_FG11o7Wp3fbwDEt8y5pnChif.png'],
  ['karim haddad', 'call_KG0dCoOgVqYMyMqhFeWyyM5N.png'],
  ['lea bernard', 'call_6Ka7A4CT7A9h5PW3esM5ViXf.png'],
  ['marie dupont', 'call_kNXtcTBEksx9SFyOl5A2iMpo.png'],
  ['nadia cherif', 'call_b2rYPrF1SUxLMEgpsfbhkQ6J.png'],
  ['sophie martin', 'call_1ttROLONjw3deiSB7iX52kj2.png'],
  ['thomas roux', 'call_ZlqdYpI1TlmayJPLv0PvQekt.png'],
  ['yanis benali', 'call_5Tao29Za3nrqTfGwdNzANzv8.png'],
]);

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function slugifyName(value) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isMarco(value) {
  return normalizeName(value) === 'marco razafimamonjy';
}

async function main() {
  const missingSources = [...PHOTO_BY_EMPLOYEE.values()].filter(
    (fileName) => !fs.existsSync(path.join(SOURCE_DIR, fileName))
  );
  if (missingSources.length > 0) {
    throw new Error(`Portrait(s) source introuvable(s) : ${missingSources.join(', ')}`);
  }

  const { rows: employees } = await db.query(
    `SELECT id, full_name
     FROM users
     WHERE role = 'EMPLOYEE'
     ORDER BY full_name`
  );

  fs.mkdirSync(AVATAR_DIR, { recursive: true });

  const report = { installed: [], skipped: [], unmapped: [] };
  for (const employee of employees) {
    if (isMarco(employee.full_name)) {
      report.skipped.push(employee.full_name);
      continue;
    }

    const sourceFileName = PHOTO_BY_EMPLOYEE.get(normalizeName(employee.full_name));
    if (!sourceFileName) {
      report.unmapped.push(employee.full_name);
      continue;
    }

    const sourcePath = path.join(SOURCE_DIR, sourceFileName);
    const storedFileName = `employee-${slugifyName(employee.full_name)}-${employee.id}.png`;
    const storedPath = path.join(AVATAR_DIR, storedFileName);
    fs.copyFileSync(sourcePath, storedPath);
    const { size } = fs.statSync(storedPath);

    await db.query(
      `INSERT INTO user_avatars (user_id, file_name, file_path, file_size, file_type, uploaded_at)
       VALUES ($1, $2, $3, $4, 'image/png', now())
       ON CONFLICT (user_id) DO UPDATE
         SET file_name = EXCLUDED.file_name,
             file_path = EXCLUDED.file_path,
             file_size = EXCLUDED.file_size,
             file_type = EXCLUDED.file_type,
             uploaded_at = now()`,
      [employee.id, `${slugifyName(employee.full_name)}.png`, storedPath, size]
    );

    report.installed.push(employee.full_name);
  }

  console.log(JSON.stringify(report, null, 2));
  await db.pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
