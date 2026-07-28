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
  const res = await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD });
  return res.body.token;
}

before(async () => {
  const ids = await seedAll();
  employeeId = ids.employeeId;
  adminToken = await login(ADMIN.email);
  employeeToken = await login(EMPLOYEE.email);
});
after(async () => {
  await db.pool.end();
});

test("POST /api/tasks — l'admin crée une tâche assignée à l'employé → 201", async () => {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Tâche intégration', priority: 'NORMALE', deadline: futureDate(), assigned_to: employeeId });
  assert.equal(res.status, 201);
  assert.ok(res.body.id, 'la tâche créée doit avoir un id');
  assert.equal(res.body.status, 'VALIDEE'); // une tâche créée par un admin est directement validée
});

test("POST /api/tasks — deadline dans le passé → 400", async () => {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Tâche invalide', priority: 'NORMALE', deadline: '2000-01-01', assigned_to: employeeId });
  assert.equal(res.status, 400);
});

test("POST /api/tasks — priorité invalide → 400", async () => {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: 'Tâche', priority: 'MEGA_URGENT', deadline: futureDate(), assigned_to: employeeId });
  assert.equal(res.status, 400);
});

test("GET /api/tasks — l'employé voit la tâche qui lui est assignée", async () => {
  const res = await request(app).get('/api/tasks').set('Authorization', `Bearer ${employeeToken}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((t) => t.title === 'Tâche intégration'), 'la tâche assignée doit apparaître');
});

test('POST /api/tasks sans token → 401', async () => {
  const res = await request(app)
    .post('/api/tasks')
    .send({ title: 'x', priority: 'NORMALE', deadline: futureDate() });
  assert.equal(res.status, 401);
});
