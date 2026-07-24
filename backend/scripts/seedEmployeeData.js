/**
 * Seed de démo (idempotent) pour peupler l'espace admin :
 *  1. Complète les profils employés INCOMPLETS (prénom/nom, adresse, date de naissance) — sans écraser l'existant.
 *  2. Génère un planning SOUMIS pour la semaine par défaut de l'admin (semaine prochaine) pour chaque employé actif.
 *  3. Ajoute un avatar DiceBear (téléchargé) aux employés qui n'en ont pas,
 *     à l'exception explicite de Marco Razafimamonjy.
 *
 * Ne touche NI aux comptes utilisateurs, NI aux tâches/messages/ressources.
 * Lancer : node scripts/seedEmployeeData.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const db = require('../src/config/database');
const planningDates = require('../src/utils/planningDates');

const AVATAR_DIR = path.join(__dirname, '../uploads/avatars');

const STREETS = [
  '12 rue des Lilas', '8 avenue Victor Hugo', '25 boulevard Voltaire', '3 impasse des Roses',
  '47 rue de la République', '19 allée des Chênes', '5 place du Marché', '31 rue Gambetta',
  '14 chemin des Vignes', '90 avenue de la Liberté', '7 rue Jean Jaurès', '22 rue des Écoles',
];
const CITIES = [
  '75011 Paris', '69003 Lyon', '33000 Bordeaux', '44000 Nantes', '59000 Lille',
  '31000 Toulouse', '34000 Montpellier', '67000 Strasbourg', '13001 Marseille', '35000 Rennes',
];

function pick(arr, i) {
  return arr[i % arr.length];
}

function randomBirthDate(i) {
  // Dates déterministes entre 1985 et 1999 pour rester stable entre deux exécutions.
  const year = 1985 + (i % 15);
  const month = String(1 + (i * 3 + 2) % 12).padStart(2, '0');
  const day = String(1 + (i * 7 + 4) % 27).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 0) return ['', ''];
  if (parts.length === 1) return [parts[0], ''];
  return [parts[0], parts.slice(1).join(' ')];
}

function isAvatarExcluded(fullName) {
  return String(fullName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase() === 'marco razafimamonjy';
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

// Modèle de semaine : les 7 jours SONT requis (validation planningController).
// Lun→ven travaillés, samedi+dimanche UNAVAILABLE sans créneau. Un peu de variété.
// weekStartDT est un objet luxon DateTime (fuseau planning) → pas de décalage UTC.
function buildWeekDays(weekStartDT, empIndex) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const dayDT = weekStartDT.plus({ days: i });
    let availability = 'AVAILABLE';
    let slots = [
      ['09:00', '12:00'],
      ['14:00', '17:00'],
    ];

    if (i >= 5) {
      // Week-end : indisponible, aucun créneau.
      availability = 'UNAVAILABLE';
      slots = [];
    } else if (i === 2 && empIndex % 4 === 0) {
      availability = 'UNAVAILABLE';
      slots = [];
    } else if (i === 4 && empIndex % 3 === 0) {
      availability = 'PARTIALLY_AVAILABLE';
      slots = [['09:00', '12:00']];
    }

    days.push({ date: planningDates.formatDate(dayDT), availability, slots });
  }
  return days;
}

async function main() {
  const { rows: employees } = await db.query(
    `SELECT id, full_name, first_name, last_name, postal_address, birth_date
     FROM users WHERE role = 'EMPLOYEE' AND status = 'ACTIF' ORDER BY full_name`
  );

  // Semaine ciblée : 'current' (cette semaine) ou 'next' (semaine prochaine, défaut admin).
  // Usage : node scripts/seedEmployeeData.js [current|next]
  const target = (process.argv[2] || 'next').toLowerCase();
  const now = planningDates.nowInPlanningZone();
  const weekStartDT =
    target === 'current' ? planningDates.getCurrentWeekStart(now) : planningDates.getNextWeekStart(now);
  const weekStart = planningDates.formatDate(weekStartDT);
  const weekEnd = planningDates.formatDate(planningDates.getWeekEnd(weekStartDT));

  const report = { profiles: 0, plannings: 0, avatars: 0, avatarErrors: 0 };
  console.log(`Semaine ciblée : ${weekStart} → ${weekEnd} — ${employees.length} employé(s)`);

  let index = 0;
  for (const emp of employees) {
    index += 1;

    // 1) Complète uniquement les champs vides
    const [firstName, lastName] = splitName(emp.full_name);
    const sets = [];
    const values = [];
    function addSet(col, val) {
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    }
    if (!emp.first_name) addSet('first_name', firstName);
    if (!emp.last_name) addSet('last_name', lastName);
    if (!emp.postal_address) addSet('postal_address', `${pick(STREETS, index)}, ${pick(CITIES, index + 2)}`);
    if (!emp.birth_date) addSet('birth_date', randomBirthDate(index));
    if (sets.length > 0) {
      values.push(emp.id);
      await db.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
      report.profiles += 1;
    }

    // 2) Planning soumis pour la semaine prochaine
    const planningRes = await db.query(
      `INSERT INTO weekly_plannings (user_id, week_start_date, week_end_date, status, submitted_at, general_note)
       VALUES ($1, $2, $3, 'SUBMITTED', now(), $4)
       ON CONFLICT (user_id, week_start_date)
       DO UPDATE SET status = 'SUBMITTED', submitted_at = now(),
                     general_note = EXCLUDED.general_note, updated_at = now()
       RETURNING id`,
      [emp.id, weekStart, weekEnd, 'Disponibilités hebdomadaires']
    );
    const planningId = planningRes.rows[0].id;
    await db.query('DELETE FROM planning_days WHERE planning_id = $1', [planningId]);

    for (const day of buildWeekDays(weekStartDT, index)) {
      const dayRes = await db.query(
        `INSERT INTO planning_days (planning_id, planning_date, availability_status)
         VALUES ($1, $2, $3) RETURNING id`,
        [planningId, day.date, day.availability]
      );
      for (const [start, end] of day.slots) {
        await db.query(
          `INSERT INTO planning_time_slots (planning_day_id, start_time, end_time) VALUES ($1, $2, $3)`,
          [dayRes.rows[0].id, start, end]
        );
      }
    }
    report.plannings += 1;

    // 3) Avatar DiceBear si absent
    const hasAvatar = await db.query('SELECT 1 FROM user_avatars WHERE user_id = $1', [emp.id]);
    if (hasAvatar.rowCount === 0 && !isAvatarExcluded(emp.full_name)) {
      try {
        const url = `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(
          emp.full_name
        )}&size=256&backgroundType=gradientLinear&fontWeight=600`;
        const buffer = await fetchBuffer(url);
        fs.mkdirSync(AVATAR_DIR, { recursive: true });
        const fileName = `seed-${emp.id}.png`;
        const filePath = path.join(AVATAR_DIR, fileName);
        fs.writeFileSync(filePath, buffer);
        await db.query(
          `INSERT INTO user_avatars (user_id, file_name, file_path, file_size, file_type, uploaded_at)
           VALUES ($1, $2, $3, $4, 'image/png', now())
           ON CONFLICT (user_id) DO UPDATE
             SET file_name = EXCLUDED.file_name, file_path = EXCLUDED.file_path,
                 file_size = EXCLUDED.file_size, file_type = EXCLUDED.file_type, uploaded_at = now()`,
          [emp.id, fileName, filePath, buffer.length]
        );
        report.avatars += 1;
      } catch (err) {
        report.avatarErrors += 1;
        console.warn(`  ⚠ avatar échoué pour ${emp.full_name}: ${err.message}`);
      }
    }
  }

  console.log('Terminé :', report);
  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
