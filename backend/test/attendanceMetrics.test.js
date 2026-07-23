const test = require('node:test');
const assert = require('node:assert/strict');
const { computeAttendanceMetrics } = require('../src/utils/attendanceMetrics');

const splitDay = [
  { start: 9 * 60, end: 12 * 60 },
  { start: 14 * 60, end: 17 * 60 },
];

test('une journée future reste à venir', () => {
  const result = computeAttendanceMetrics({ slots: splitDay, sessions: [], elapsedLimit: 0 });
  assert.equal(result.status, 'upcoming');
  assert.equal(result.accomplishment, 0);
});

test('avant le premier créneau la présence reste en attente', () => {
  const result = computeAttendanceMetrics({ slots: splitDay, sessions: [], elapsedLimit: 8 * 60 });
  assert.equal(result.status, 'waiting');
});

test('après la tolérance sans connexion la personne est absente', () => {
  const result = computeAttendanceMetrics({ slots: splitDay, sessions: [], elapsedLimit: 10 * 60 });
  assert.equal(result.status, 'absent');
  assert.equal(result.missedMinutes, 60);
});

test('une connexion uniquement sur le second créneau est partielle, pas en retard', () => {
  const result = computeAttendanceMetrics({
    slots: splitDay,
    sessions: [{ start: 14 * 60 + 23, end: 15 * 60 }],
    elapsedLimit: 15 * 60,
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.delayMinutes, 0);
});

test('un retard sur le premier créneau conserve la tolérance de dix minutes', () => {
  const tolerated = computeAttendanceMetrics({
    slots: splitDay,
    sessions: [{ start: 9 * 60 + 10, end: 10 * 60 }],
    elapsedLimit: 10 * 60,
  });
  const late = computeAttendanceMetrics({
    slots: splitDay,
    sessions: [{ start: 9 * 60 + 11, end: 10 * 60 }],
    elapsedLimit: 10 * 60,
  });
  assert.notEqual(tolerated.status, 'late');
  assert.equal(late.status, 'late');
  assert.equal(late.delayMinutes, 11);
});

test('les sessions qui se chevauchent ne sont jamais comptées deux fois', () => {
  const result = computeAttendanceMetrics({
    slots: [{ start: 8 * 60, end: 12 * 60 }],
    sessions: [
      { start: 8 * 60, end: 9 * 60 },
      { start: 8 * 60 + 30, end: 10 * 60 },
    ],
    elapsedLimit: 10 * 60,
  });
  assert.equal(result.connectedMinutes, 120);
  assert.equal(result.coveredMinutes, 120);
});

test('une connexion sans recouvrement est hors planning', () => {
  const result = computeAttendanceMetrics({
    slots: [{ start: 9 * 60, end: 12 * 60 }],
    sessions: [{ start: 7 * 60, end: 8 * 60 }],
    elapsedLimit: 10 * 60,
  });
  assert.equal(result.status, 'outside');
  assert.equal(result.outsideMinutes, 60);
});
