require('./setupTestDb'); // DOIT être en premier (bascule sur la base de test)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, ADMIN, EMPLOYEE } = require('./seed');

let adminToken;
let employeeToken;
let employeeId;

function futureDate(daysAhead = 7) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}
async function login(identifier) {
  return (await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD })).body.token;
}
async function notifications(token) {
  return (await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`)).body;
}

before(async () => {
  const ids = await seedAll();
  employeeId = ids.employeeId;
  adminToken = await login(ADMIN.email);
  employeeToken = await login(EMPLOYEE.email);
  // L'admin crée une tâche assignée à l'employé → génère un audit CREATE_TASK.
  await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Tâche notifiée', priority: 'NORMALE', deadline: futureDate(), assigned_to: employeeId });
});
after(async () => {
  await db.pool.end();
});

test("l'employé assigné voit une notification pour la tâche créée", async () => {
  const data = await notifications(employeeToken);
  assert.ok(Array.isArray(data.items));
  const createTask = data.items.find((item) => item.action === 'CREATE_TASK');
  assert.ok(createTask, 'la création de tâche doit apparaître dans les notifications de l’assigné');
  assert.ok(data.unread_count >= 1, 'la notification doit être comptée comme non lue');
});

test("l'admin ne voit PAS sa propre action (exclusion de soi-même)", async () => {
  const data = await notifications(adminToken);
  const ownAction = data.items.find((item) => item.action === 'CREATE_TASK');
  assert.equal(ownAction, undefined, 'un utilisateur n’est jamais notifié de ses propres actions');
});

test('GET /api/notifications sans token → 401', async () => {
  const res = await request(app).get('/api/notifications');
  assert.equal(res.status, 401);
});
