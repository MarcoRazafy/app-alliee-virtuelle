require('./setupTestDb'); // DOIT être en premier (bascule sur la base de test)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, EMPLOYEE } = require('./seed');

let token;
let employeeId;

async function onlineUserIds() {
  const res = await request(app).get('/api/messages/online-users').set('Authorization', `Bearer ${token}`);
  return res.body;
}

before(async () => {
  const ids = await seedAll();
  employeeId = ids.employeeId;
  token = (await request(app).post('/api/auth/login').send({ identifier: EMPLOYEE.email, password: PASSWORD })).body.token;
});
after(async () => {
  await db.pool.end();
});

test('après connexion, l’employé est en ligne', async () => {
  const online = await onlineUserIds();
  assert.ok(online.includes(employeeId), 'la connexion doit rendre le compte en ligne');
});

test('fermeture du navigateur (disconnect) → hors-ligne immédiatement', async () => {
  await request(app).post('/api/sessions/disconnect').set('Authorization', `Bearer ${token}`);
  const online = await onlineUserIds();
  assert.ok(!online.includes(employeeId), 'un disconnect signalé doit passer hors-ligne');
});

test('réouverture SANS reconnexion (heartbeat seul) ne recrée pas de session', async () => {
  // On simule la fermeture effective de la session (ce que fait le nettoyeur après la grâce).
  await db.query('UPDATE user_sessions SET logout_at = now() WHERE user_id = $1 AND logout_at IS NULL', [employeeId]);

  // Un heartbeat (envoyé automatiquement à l'ouverture de l'app) ne doit PAS rendre actif.
  const hb = await request(app).post('/api/sessions/heartbeat').set('Authorization', `Bearer ${token}`);
  assert.equal(hb.body.login_at, null, 'le heartbeat ne renvoie aucune session ouverte');

  const online = await onlineUserIds();
  assert.ok(!online.includes(employeeId), 'rouvrir sans se reconnecter ne doit pas rendre actif');
});

test('une nouvelle connexion explicite rend de nouveau en ligne', async () => {
  await request(app).post('/api/auth/login').send({ identifier: EMPLOYEE.email, password: PASSWORD });
  const online = await onlineUserIds();
  assert.ok(online.includes(employeeId), 'une vraie reconnexion recrée la présence');
});
