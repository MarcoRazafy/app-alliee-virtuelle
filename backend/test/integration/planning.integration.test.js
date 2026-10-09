require('./setupTestDb');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/database');
const { seedAll, PASSWORD, EMPLOYEE } = require('./seed');

let employeeToken;

async function login(identifier) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD });
  return res.body.token;
}

function fullWeekPayload(days) {
  return days.map((day) => ({
    date: day.date,
    availability_status: 'AVAILABLE',
    note: null,
    time_slots: [{ start_time: '08:00', end_time: '12:00' }],
  }));
}

async function resetEmployee() {
  await seedAll();
  employeeToken = await login(EMPLOYEE.email);
}

before(resetEmployee);
after(async () => {
  await db.pool.end();
});

test('rattrapage : un employé sans aucun planning peut éditer la semaine EN COURS (PUT → 200)', async () => {
  await resetEmployee();
  const current = (await request(app).get('/api/planning/current').set('Authorization', `Bearer ${employeeToken}`)).body;
  assert.equal(current.can_edit, true, 'la semaine en cours doit être éditable (rattrapage)');

  const res = await request(app)
    .put('/api/planning/current-week')
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ general_note: 'Rattrapage', days: fullWeekPayload(current.days) });
  assert.equal(res.status, 200);
});

test("rattrapage refusé si l'employé a déjà touché la semaine prochaine (→ 403)", async () => {
  await resetEmployee();
  const created = await request(app).post('/api/planning/next-week').set('Authorization', `Bearer ${employeeToken}`);
  assert.equal(created.status, 201);

  const current = (await request(app).get('/api/planning/current').set('Authorization', `Bearer ${employeeToken}`)).body;
  assert.equal(current.can_edit, false);

  const res = await request(app)
    .put('/api/planning/current-week')
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ general_note: '', days: fullWeekPayload(current.days) });
  assert.equal(res.status, 403);
});

test('rattrapage : une fois la semaine en cours soumise, elle se verrouille (→ 403 à la ré-édition)', async () => {
  await resetEmployee();
  const current = (await request(app).get('/api/planning/current').set('Authorization', `Bearer ${employeeToken}`)).body;

  const put = await request(app)
    .put('/api/planning/current-week')
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ general_note: '', days: fullWeekPayload(current.days) });
  assert.equal(put.status, 200);

  const submit = await request(app).post('/api/planning/current-week/submit').set('Authorization', `Bearer ${employeeToken}`);
  assert.equal(submit.status, 200);

  const afterSubmit = (await request(app).get('/api/planning/current').set('Authorization', `Bearer ${employeeToken}`)).body;
  assert.equal(afterSubmit.can_edit, false, 'une fois soumise, la semaine en cours est verrouillée');

  const reput = await request(app)
    .put('/api/planning/current-week')
    .set('Authorization', `Bearer ${employeeToken}`)
    .send({ general_note: '', days: fullWeekPayload(current.days) });
  assert.equal(reput.status, 403);
});
