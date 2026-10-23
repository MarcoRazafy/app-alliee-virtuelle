require('./setupTestDb');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, ADMIN, EMPLOYEE } = require('./seed');

const VIEWER = { email: 'itest.viewer@alliee.test', username: 'itest_viewer' };

let adminToken;
let employeeToken;
let viewerToken;
let employeeId;
let viewerId;
let taskId;

function futureDate(daysAhead = 7) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}

async function login(identifier) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD });
  return res.body.token;
}

const as = (token) => ({ Authorization: `Bearer ${token}` });

before(async () => {
  const ids = await seedAll();
  employeeId = ids.employeeId;
  const viewer = await db.query(
    `INSERT INTO users (email, password_hash, full_name, first_name, last_name, username, role, status)
     VALUES ($1, $2, 'Viewer Integration', 'Viewer', 'Integration', $3, 'EMPLOYEE', 'ACTIF') RETURNING id`,
    [VIEWER.email, bcrypt.hashSync(PASSWORD, 10), VIEWER.username]
  );
  viewerId = viewer.rows[0].id;

  const space = await db.query("INSERT INTO task_spaces (name) VALUES ('ITEST') RETURNING id");
  const folder = await db.query("INSERT INTO task_folders (space_id, name) VALUES ($1, 'Projet') RETURNING id", [
    space.rows[0].id,
  ]);
  const list = await db.query("INSERT INTO task_lists (folder_id, name) VALUES ($1, 'Liste') RETURNING id", [
    folder.rows[0].id,
  ]);

  adminToken = await login(ADMIN.email);
  employeeToken = await login(EMPLOYEE.email);
  viewerToken = await login(VIEWER.email);

  const created = await request(app)
    .post('/api/tasks')
    .set(as(adminToken))
    .send({
      title: 'Tâche de l’employé',
      priority: 'NORMALE',
      deadline: futureDate(),
      assigned_to: employeeId,
      list_id: list.rows[0].id,
    });
  assert.equal(created.status, 201);
  taskId = created.body.id;
});
after(async () => {
  await db.pool.end();
});

test('sans accès, un employé ne voit ni la liste complète ni la tâche d’un autre', async () => {
  assert.equal((await request(app).get('/api/tasks?scope=all').set(as(viewerToken))).status, 403);
  assert.equal((await request(app).get(`/api/tasks/${taskId}`).set(as(viewerToken))).status, 403);
  const patch = await request(app)
    .patch(`/api/tasks/${taskId}`)
    .set(as(viewerToken))
    .send({ title: 'Piraté', priority: 'NORMALE', deadline: futureDate() });
  assert.equal(patch.status, 403);
});

test('seul un admin peut donner l’accès, et seulement à un employé', async () => {
  const byEmployee = await request(app)
    .put(`/api/users/${viewerId}/all-tasks-access`)
    .set(as(employeeToken))
    .send({ enabled: true });
  assert.equal(byEmployee.status, 403);

  const admin = await db.query('SELECT id FROM users WHERE email = $1', [ADMIN.email]);
  const toAdmin = await request(app)
    .put(`/api/users/${admin.rows[0].id}/all-tasks-access`)
    .set(as(adminToken))
    .send({ enabled: true });
  assert.equal(toAdmin.status, 400);

  const badBody = await request(app)
    .put(`/api/users/${viewerId}/all-tasks-access`)
    .set(as(adminToken))
    .send({ enabled: 'oui' });
  assert.equal(badBody.status, 400);
});

test('l’admin donne l’accès : le profil et la fiche employé l’indiquent', async () => {
  const grant = await request(app)
    .put(`/api/users/${viewerId}/all-tasks-access`)
    .set(as(adminToken))
    .send({ enabled: true });
  assert.equal(grant.status, 200);
  assert.equal(grant.body.can_access_all_tasks, true);

  const me = await request(app).get('/api/auth/me').set(as(viewerToken));
  assert.equal(me.body.can_access_all_tasks, true);

  const detail = await request(app).get(`/api/users/${viewerId}/detail`).set(as(adminToken));
  assert.equal(detail.body.user.can_access_all_tasks, true);

  const relog = await request(app).post('/api/auth/login').send({ identifier: VIEWER.email, password: PASSWORD });
  assert.equal(relog.body.user.can_access_all_tasks, true);
});

test('avec l’accès : liste complète, fiche, historique et commentaires de la tâche d’un autre', async () => {
  const all = await request(app).get('/api/tasks?scope=all').set(as(viewerToken));
  assert.equal(all.status, 200);
  assert.ok(all.body.some((t) => t.id === taskId));

  const mine = await request(app).get('/api/tasks').set(as(viewerToken));
  assert.ok(!mine.body.some((t) => t.id === taskId), '« Mes tâches » reste limité aux tâches assignées');

  for (const path of [`/api/tasks/${taskId}`, `/api/tasks/${taskId}/detail`, `/api/timelog/${taskId}`, `/api/tasks/${taskId}/comments`]) {
    const res = await request(app).get(path).set(as(viewerToken));
    assert.equal(res.status, 200, path);
  }
  const comment = await request(app)
    .post(`/api/tasks/${taskId}/comments`)
    .set(as(viewerToken))
    .send({ content: 'Je reprends le titre' });
  assert.equal(comment.status, 201);
});

test('avec l’accès : titre, priorité, dates et description modifiables', async () => {
  const deadline = futureDate(10);
  const patch = await request(app)
    .patch(`/api/tasks/${taskId}`)
    .set(as(viewerToken))
    .send({ title: 'Titre corrigé', priority: 'HAUTE', deadline, start_date: futureDate(2) });
  assert.equal(patch.status, 200);

  const due = await request(app)
    .patch(`/api/tasks/${taskId}/deadline`)
    .set(as(viewerToken))
    .send({ deadline: futureDate(12) });
  assert.equal(due.status, 200);

  const desc = await request(app)
    .patch(`/api/tasks/${taskId}/description`)
    .set(as(viewerToken))
    .send({ description: '<p>Nouvelle description</p>' });
  assert.equal(desc.status, 200);

  const { rows } = await db.query(
    'SELECT title, priority, deadline::text AS deadline, description FROM tasks WHERE id = $1',
    [taskId]
  );
  assert.deepEqual(rows[0], {
    title: 'Titre corrigé',
    priority: 'HAUTE',
    deadline: futureDate(12),
    description: '<p>Nouvelle description</p>',
  });
});

test('avec l’accès : pas de statut, de réassignation, de suppression ni de chrono sur la tâche d’un autre', async () => {
  const status = await request(app).patch(`/api/tasks/${taskId}/status`).set(as(viewerToken)).send({ status: 'EN_COURS' });
  assert.equal(status.status, 403);
  const reassign = await request(app)
    .post(`/api/tasks/${taskId}/reassign`)
    .set(as(viewerToken))
    .send({ assigned_to: viewerId });
  assert.equal(reassign.status, 403);
  const start = await request(app).post(`/api/timelog/${taskId}/start`).set(as(viewerToken));
  assert.equal(start.status, 403);
  const del = await request(app).delete(`/api/tasks/${taskId}`).set(as(viewerToken));
  assert.equal(del.status, 403);
  const stillThere = await request(app).get(`/api/tasks/${taskId}`).set(as(adminToken));
  assert.equal(stillThere.status, 200);
});

test('le retrait de l’accès s’applique tout de suite, sans reconnexion', async () => {
  const revoke = await request(app)
    .put(`/api/users/${viewerId}/all-tasks-access`)
    .set(as(adminToken))
    .send({ enabled: false });
  assert.equal(revoke.status, 200);

  assert.equal((await request(app).get('/api/tasks?scope=all').set(as(viewerToken))).status, 403);
  assert.equal((await request(app).get(`/api/tasks/${taskId}`).set(as(viewerToken))).status, 403);
  const patch = await request(app)
    .patch(`/api/tasks/${taskId}/deadline`)
    .set(as(viewerToken))
    .send({ deadline: futureDate(14) });
  assert.equal(patch.status, 403);
});

test('l’employé assigné garde ses droits habituels', async () => {
  assert.equal((await request(app).get(`/api/tasks/${taskId}`).set(as(employeeToken))).status, 200);
  const patch = await request(app)
    .patch(`/api/tasks/${taskId}`)
    .set(as(employeeToken))
    .send({ title: 'Assigné mais pas créateur', priority: 'NORMALE', deadline: futureDate() });
  assert.equal(patch.status, 403, 'un assigné qui n’a pas créé la tâche ne la modifie toujours pas');
});
