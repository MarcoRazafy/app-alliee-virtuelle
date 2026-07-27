require('./setupTestDb'); // DOIT être en premier (bascule sur la base de test)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, EMPLOYEE, ADMIN } = require('./seed');

let token;

before(async () => {
  await seedAll();
  token = (await request(app).post('/api/auth/login').send({ identifier: EMPLOYEE.email, password: PASSWORD })).body.token;
});
after(async () => {
  await db.pool.end();
});

test('PUT /api/auth/me — modifie poste, email et description → 200 et persiste', async () => {
  const res = await request(app)
    .put('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .send({
      first_name: 'Employe',
      last_name: 'Integration',
      phone: '+33600000000',
      email: 'employe.modifie@alliee.test',
      position: 'Chef de projet',
      description: 'Présentation de test.',
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.position, 'Chef de projet');
  assert.equal(res.body.email, 'employe.modifie@alliee.test');
  assert.equal(res.body.description, 'Présentation de test.');

  // On se reconnecte avec le NOUVEL email pour confirmer la persistance.
  const relog = await request(app).post('/api/auth/login').send({ identifier: 'employe.modifie@alliee.test', password: PASSWORD });
  assert.equal(relog.status, 200);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${relog.body.token}`);
  assert.equal(me.body.position, 'Chef de projet');
  assert.equal(me.body.description, 'Présentation de test.');
});

test("PUT /api/auth/me — email déjà utilisé par un autre compte → 409", async () => {
  const res = await request(app)
    .put('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .send({ first_name: 'Employe', last_name: 'Integration', phone: '+33600000000', email: ADMIN.email });
  assert.equal(res.status, 409);
});

test('PUT /api/auth/me — email invalide → 400', async () => {
  const res = await request(app)
    .put('/api/auth/me')
    .set('Authorization', `Bearer ${token}`)
    .send({ first_name: 'Employe', last_name: 'Integration', phone: '+33600000000', email: 'pas-un-email' });
  assert.equal(res.status, 400);
});
