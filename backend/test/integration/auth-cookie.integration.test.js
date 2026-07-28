require('./setupTestDb'); // DOIT être en premier (bascule sur la base de test)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, ADMIN } = require('./seed');

function tokenCookie(res) {
  return (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
}
async function loginCookie() {
  const res = await request(app).post('/api/auth/login').send({ identifier: ADMIN.email, password: PASSWORD });
  return tokenCookie(res);
}

before(async () => {
  await seedAll();
});
after(async () => {
  await db.pool.end();
});

test('le login pose un cookie httpOnly "token" (SameSite=Lax)', async () => {
  const res = await request(app).post('/api/auth/login').send({ identifier: ADMIN.email, password: PASSWORD });
  assert.equal(res.status, 200);
  const cookie = tokenCookie(res);
  assert.ok(cookie, 'un cookie token est renvoyé');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('une route protégée accepte le cookie seul (sans en-tête Authorization)', async () => {
  const cookie = await loginCookie();
  const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
  assert.equal(me.status, 200);
  assert.equal(me.body.email, ADMIN.email);
});

test('sans cookie ni Bearer, la route protégée renvoie 401', async () => {
  const me = await request(app).get('/api/auth/me');
  assert.equal(me.status, 401);
});

test('le logout supprime le cookie', async () => {
  const cookie = await loginCookie();
  const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
  assert.equal(out.status, 200);
  const cleared = tokenCookie(out);
  assert.ok(cleared, 'un Set-Cookie de suppression est renvoyé');
  assert.ok(/Expires=/.test(cleared) || /Max-Age=0/i.test(cleared) || /token=;/.test(cleared));
});
