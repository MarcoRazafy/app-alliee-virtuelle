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
async function updateProfile(id, { firstName, lastName, phone, postalAddress, birthDate, position, email, description }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const result = await db.query(
    `UPDATE users
     SET first_name = $1, last_name = $2, full_name = $3, phone_number = $4,
         postal_address = $5, birth_date = $6, position = $7, email = $8, description = $9,
         updated_at = now()
     WHERE id = $10
     RETURNING id, email, username, first_name, last_name, full_name, phone_number, position,
               postal_address, birth_date, description, role, status`,
    [firstName, lastName, fullName, phone, postalAddress || null, birthDate || null, position || null, email, description || null, id]
  );
  return result.rows[0];
}

// Vrai si l'email est déjà utilisé par un AUTRE utilisateur (pour la modification de profil).
async function emailTakenByOther(email, exceptUserId) {
  const result = await db.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2 LIMIT 1', [email, exceptUserId]);
  return result.rowCount > 0;
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

// Emails des administrateurs actifs — destinataires des notifications de nouvelle inscription.
async function findAdminEmails() {
  const result = await db.query(
    'SELECT email FROM users WHERE role = $1 AND status = $2',
    [USER_ROLE.ADMIN, USER_STATUS.ACTIVE]
  );
  return result.rows.map((row) => row.email);
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

// --- Notes internes admin sur un employé (fiche employé) ---
async function listNotes(userId) {
  const result = await db.query(
    `SELECT n.id, n.content, n.created_at, n.author_id, a.full_name AS author_name
       FROM user_notes n
       LEFT JOIN users a ON a.id = n.author_id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function createNote(userId, authorId, content) {
  const result = await db.query(
    `INSERT INTO user_notes (user_id, author_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, content, created_at, author_id`,
    [userId, authorId, content]
  );
  return result.rows[0];
}

async function deleteNote(noteId, userId) {
  const result = await db.query('DELETE FROM user_notes WHERE id = $1 AND user_id = $2 RETURNING id', [
    noteId,
    userId,
  ]);
  return result.rows[0] || null;
}

// --- Évaluations mensuelles -------------------------------------------------

const EVALUATION_COLUMNS = `id, user_id, to_char(period_month, 'YYYY-MM') AS month,
  visible_to_employee, global_comment,
  delais_items, qualite_items, autonomie_items, adaptabilite_items,
  forces_actuelles, competences_ameliorer, competences_developper, objectifs_professionnels,
  formations_recommandees, nouvelles_responsabilites, prochaine_etape,
  created_by, created_at, updated_at, updated_by`;

// Champs texte libre « développement / carrière » de l'évaluation.
const EVALUATION_TEXT_FIELDS = [
  'forces_actuelles',
  'competences_ameliorer',
  'competences_developper',
  'objectifs_professionnels',
  'formations_recommandees',
  'nouvelles_responsabilites',
  'prochaine_etape',
];

const EVALUATION_ITEM_KEYS = ['delais_items', 'qualite_items', 'autonomie_items', 'adaptabilite_items'];

// Les remarques portent l'id de leur auteur (dans le JSONB) : on résout les noms en une seule
// requête, plutôt que de figer le nom au moment de l'écriture (il suivrait alors mal un
// changement d'identité) ou d'imposer un appel par remarque côté client.
async function attachAuthorNames(rows) {
  const ids = new Set();
  rows.forEach((row) => {
    EVALUATION_ITEM_KEYS.forEach((key) => {
      (row[key] || []).forEach((item) => item?.author_id && ids.add(item.author_id));
    });
    if (row.updated_by) ids.add(row.updated_by);
  });
  if (ids.size === 0) return rows;

  const names = await db.query('SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])', [[...ids]]);
  const byId = new Map(names.rows.map((u) => [u.id, u.full_name]));

  return rows.map((row) => {
    const next = { ...row, updated_by_name: byId.get(row.updated_by) || null };
    EVALUATION_ITEM_KEYS.forEach((key) => {
      next[key] = (row[key] || []).map((item) => ({
        ...item,
        author_name: item?.author_id ? byId.get(item.author_id) || null : null,
      }));
    });
    return next;
  });
}

// Toutes les évaluations d'un employé, du mois le plus récent au plus ancien (vue admin, complète).
async function listEvaluations(userId) {
  const result = await db.query(
    `SELECT ${EVALUATION_COLUMNS} FROM employee_evaluations
      WHERE user_id = $1 ORDER BY period_month DESC`,
    [userId]
  );
  return attachAuthorNames(result.rows);
}

// Une évaluation précise (mois = 'YYYY-MM'), ou null.
async function getEvaluation(userId, month) {
  const result = await db.query(
    `SELECT ${EVALUATION_COLUMNS} FROM employee_evaluations
      WHERE user_id = $1 AND period_month = to_date($2, 'YYYY-MM')`,
    [userId, month]
  );
  return result.rows[0] || null;
}

// Crée ou met à jour l'évaluation d'un mois (unique par user_id + mois).
// data.*_items = tableaux [{ rating, comment }] (déjà validés par le contrôleur).
async function upsertEvaluation(userId, month, createdBy, data) {
  const result = await db.query(
    `INSERT INTO employee_evaluations (
       user_id, period_month, visible_to_employee, global_comment,
       delais_items, qualite_items, autonomie_items, adaptabilite_items,
       created_by, updated_by,
       forces_actuelles, competences_ameliorer, competences_developper, objectifs_professionnels,
       formations_recommandees, nouvelles_responsabilites, prochaine_etape,
       updated_at
     ) VALUES ($1, to_date($2, 'YYYY-MM'), $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $9,
       $10, $11, $12, $13, $14, $15, $16, now())
     ON CONFLICT (user_id, period_month) DO UPDATE SET
       visible_to_employee = EXCLUDED.visible_to_employee,
       global_comment = EXCLUDED.global_comment,
       delais_items = EXCLUDED.delais_items,
       qualite_items = EXCLUDED.qualite_items,
       autonomie_items = EXCLUDED.autonomie_items,
       adaptabilite_items = EXCLUDED.adaptabilite_items,
       updated_by = EXCLUDED.updated_by,
       forces_actuelles = EXCLUDED.forces_actuelles,
       competences_ameliorer = EXCLUDED.competences_ameliorer,
       competences_developper = EXCLUDED.competences_developper,
       objectifs_professionnels = EXCLUDED.objectifs_professionnels,
       formations_recommandees = EXCLUDED.formations_recommandees,
       nouvelles_responsabilites = EXCLUDED.nouvelles_responsabilites,
       prochaine_etape = EXCLUDED.prochaine_etape,
       updated_at = now()
     RETURNING ${EVALUATION_COLUMNS}`,
    [
      userId,
      month,
      Boolean(data.visible_to_employee),
      data.global_comment || null,
      JSON.stringify(data.delais_items || []),
      JSON.stringify(data.qualite_items || []),
      JSON.stringify(data.autonomie_items || []),
      JSON.stringify(data.adaptabilite_items || []),
      createdBy,
      ...EVALUATION_TEXT_FIELDS.map((f) => data[f] || null),
    ]
  );
  return result.rows[0];
}

// Évaluations visibles par l'employé lui-même : on renvoie toujours le mois + commentaire
// global ; le détail (les listes de remarques) n'est inclus que si visible_to_employee = true.
async function listEvaluationsForEmployee(userId) {
  const rows = await listEvaluations(userId);
  return rows
    .filter((r) => r.visible_to_employee || r.global_comment)
    .map((r) => {
      const base = {
        id: r.id,
        month: r.month,
        global_comment: r.global_comment,
        visible_to_employee: r.visible_to_employee,
        updated_at: r.updated_at,
        updated_by_name: r.updated_by_name || null,
      };
      if (!r.visible_to_employee) return { ...base, criteria_hidden: true };
      const extra = {};
      for (const f of EVALUATION_TEXT_FIELDS) extra[f] = r[f];
      return {
        ...base,
        delais_items: r.delais_items,
        qualite_items: r.qualite_items,
        autonomie_items: r.autonomie_items,
        adaptabilite_items: r.adaptabilite_items,
        ...extra,
      };
    });
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
  emailTakenByOther,
  findActiveExcept,
  findAllFiltered,
  findPending,
  findAdminEmails,
  updateStatus,
  promoteToAdmin,
  listNotes,
  createNote,
  deleteNote,
  listEvaluations,
  getEvaluation,
  upsertEvaluation,
  listEvaluationsForEmployee,
  USER_STATUS,
  USER_ROLE,
};
