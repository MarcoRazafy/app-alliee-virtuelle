require('./setupTestDb');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, ADMIN, EMPLOYEE } = require('./seed');

const OTHER = { email: 'itest.other@alliee.test', username: 'itest_other' };

let adminToken;
let employeeToken;
let otherToken;
let employeeId;
let otherId;
let sourceListId;
let targetListId;
let trashedListId;
let hiddenListId;

const as = (token) => ({ Authorization: `Bearer ${token}` });
const futureDate = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const listOf = async (taskId) => (await db.query('SELECT list_id FROM tasks WHERE id = $1', [taskId])).rows[0].list_id;
const move = (token, taskIds, listId) =>
  request(app).post('/api/tasks/move').set(as(token)).send({ task_ids: taskIds, list_id: listId });

async function login(identifier) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD });
  return res.body.token;
}

async function createTask(token, title, assignee) {
  const res = await request(app)
    .post('/api/tasks')
    .set(as(token))
    .send({ title, priority: 'NORMALE', deadline: futureDate(), assigned_to: assignee, list_id: sourceListId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id;
}

before(async () => {
  const ids = await seedAll();
  employeeId = ids.employeeId;
  const other = await db.query(
    `INSERT INTO users (email, password_hash, full_name, first_name, last_name, username, role, status)
     VALUES ($1, $2, 'Autre Membre', 'Autre', 'Membre', $3, 'EMPLOYEE', 'ACTIF') RETURNING id`,
    [OTHER.email, bcrypt.hashSync(PASSWORD, 10), OTHER.username]
  );
  otherId = other.rows[0].id;

  const space = await db.query("INSERT INTO task_spaces (name) VALUES ('Clients') RETURNING id");
  const folder = await db.query("INSERT INTO task_folders (space_id, name) VALUES ($1, 'Comptabilité') RETURNING id", [
    space.rows[0].id,
  ]);
  const list = (name, folderId = folder.rows[0].id) =>
    db.query('INSERT INTO task_lists (folder_id, name) VALUES ($1, $2) RETURNING id', [folderId, name]);
  sourceListId = (await list('Bilan 2026')).rows[0].id;
  targetListId = (await list('Déclarations TVA')).rows[0].id;
  trashedListId = (await list('Ancien projet')).rows[0].id;
  await db.query('UPDATE task_lists SET deleted_at = now() WHERE id = $1', [trashedListId]);
  const trashedFolder = await db.query(
    "INSERT INTO task_folders (space_id, name, deleted_at) VALUES ($1, 'Archivé', now()) RETURNING id",
    [space.rows[0].id]
  );
  hiddenListId = (await list('Dans un dossier supprimé', trashedFolder.rows[0].id)).rows[0].id;

  adminToken = await login(ADMIN.email);
  employeeToken = await login(EMPLOYEE.email);
  otherToken = await login(OTHER.email);
});

after(async () => {
  await db.pool.end();
});

test('un membre déplace sa tâche ; l’historique garde la trace', async () => {
  const taskId = await createTask(adminToken, 'Rapprochement bancaire', employeeId);
  const res = await move(employeeToken, [taskId], targetListId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.moved, 1);
  assert.equal(res.body.list.path, 'Clients › Comptabilité › Déclarations TVA');
  assert.equal(await listOf(taskId), targetListId);

  const audit = await db.query("SELECT details FROM audit_log WHERE action = 'MOVE_TASK' AND entity_id = $1", [taskId]);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].details.from_list_id, sourceListId);
  assert.equal(audit.rows[0].details.to_list_id, targetListId);

  const again = await move(employeeToken, [taskId], targetListId);
  assert.equal(again.status, 200);
  assert.equal(again.body.moved, 0, 'déjà dans le projet : rien à déplacer');
});

test('plusieurs tâches d’un coup, sous-tâches comprises', async () => {
  const first = await createTask(adminToken, 'Saisie des factures', employeeId);
  const second = await createTask(adminToken, 'Relances clients', employeeId);
  const child = await request(app)
    .post('/api/tasks')
    .set(as(adminToken))
    .send({
      title: 'Factures de mars',
      priority: 'NORMALE',
      deadline: futureDate(),
      assigned_to: otherId,
      list_id: sourceListId,
      parent_task_id: first,
    });
  assert.equal(child.status, 201);

  const res = await move(adminToken, [first, second], targetListId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.moved, 3);
  for (const id of [first, second, child.body.id]) assert.equal(await listOf(id), targetListId);
});

test('tout ou rien : une tâche interdite bloque tout le lot', async () => {
  const mine = await createTask(adminToken, 'Ma tâche', employeeId);
  const notMine = await createTask(adminToken, 'Tâche d’un autre membre', otherId);
  const res = await move(employeeToken, [mine, notMine], targetListId);
  assert.equal(res.status, 403);
  assert.match(res.body.error, /Tâche d’un autre membre/);
  assert.equal(await listOf(mine), sourceListId);
  assert.equal(await listOf(notMine), sourceListId);
});

test('un membre avec l’accès « toutes les tâches » déplace celles des autres', async () => {
  const notMine = await createTask(adminToken, 'Clôture mensuelle', otherId);
  const grant = await request(app)
    .put(`/api/users/${employeeId}/all-tasks-access`)
    .set(as(adminToken))
    .send({ enabled: true });
  assert.equal(grant.status, 200);
  const res = await move(employeeToken, [notMine], targetListId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await listOf(notMine), targetListId);
  await request(app).put(`/api/users/${employeeId}/all-tasks-access`).set(as(adminToken)).send({ enabled: false });
});

test('projet de destination supprimé, ou dans un dossier supprimé : refusé', async () => {
  const taskId = await createTask(adminToken, 'Inventaire', employeeId);
  for (const listId of [trashedListId, hiddenListId, '00000000-0000-0000-0000-000000000000']) {
    const res = await move(adminToken, [taskId], listId);
    assert.equal(res.status, 404, listId);
  }
  assert.equal(await listOf(taskId), sourceListId);
});

test('requêtes invalides et non connecté', async () => {
  const taskId = await createTask(adminToken, 'Paie', employeeId);
  assert.equal((await move(adminToken, [], targetListId)).status, 400);
  assert.equal((await move(adminToken, ['pas-un-id'], targetListId)).status, 400);
  assert.equal((await move(adminToken, [taskId], 'pas-un-id')).status, 400);
  assert.equal((await move(adminToken, ['00000000-0000-0000-0000-000000000000'], targetListId)).status, 404);
  const tooMany = Array.from({ length: 201 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
  assert.equal((await move(adminToken, tooMany, targetListId)).status, 400);
  assert.equal(
    (await request(app).post('/api/tasks/move').send({ task_ids: [taskId], list_id: targetListId })).status,
    401
  );
  assert.equal(await listOf(taskId), sourceListId);
});
