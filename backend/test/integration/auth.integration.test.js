require('./setupTestDb'); // DOIT être en premier (bascule sur la base de test)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, ADMIN, PENDING } = require('./seed');

before(async () => {
  await seedAll();
});
after(async () => {
  await db.pool.end();
});

test('POST /api/auth/login — mauvais mot de passe → 401', async () => {
  const res = await request(app).post('/api/auth/login').send({ identifier: ADMIN.email, password: 'MauvaisMDP!' });
  assert.equal(res.status, 401);
});

test('POST /api/auth/login — identifiant inconnu → 401', async () => {
  const res = await request(app).post('/api/auth/login').send({ identifier: 'inconnu@alliee.test', password: PASSWORD });
  assert.equal(res.status, 401);
});

test('POST /api/auth/login — identifiants corrects → 200 + token', async () => {
  const res = await request(app).post('/api/auth/login').send({ identifier: ADMIN.email, password: PASSWORD });
  assert.equal(res.status, 200);
  assert.ok(res.body.token, 'un token doit être renvoyé');
  assert.equal(res.body.user.role, 'ADMIN');
});

test('POST /api/auth/login — compte en attente de validation → 403', async () => {
  const res = await request(app).post('/api/auth/login').send({ identifier: PENDING.email, password: PASSWORD });
  assert.equal(res.status, 403);
});

test('GET /api/tasks sans token → 401', async () => {
  const res = await request(app).get('/api/tasks');
  assert.equal(res.status, 401);
});

test('GET /api/tasks avec un token invalide → 401', async () => {
  const res = await request(app).get('/api/tasks').set('Authorization', 'Bearer pas-un-vrai-token');
  assert.equal(res.status, 401);
});
