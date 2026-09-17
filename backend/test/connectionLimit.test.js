const test = require('node:test');
const assert = require('node:assert/strict');
const {
  connectedSecondsForDay,
  limitStatus,
  formatHours,
  limitReachedMessage,
  WARNING_BEFORE_SECONDS,
} = require('../src/utils/connectionLimit');

// Heures de Madagascar (UTC+3), journée de travail de 2 h à 2 h (réglages par défaut).
const at = (iso) => new Date(`${iso}+03:00`);
const H = 3600;

test('additionne les sessions de la journée', () => {
  const sessions = [
    { login_at: at('2026-09-17T08:00:00'), effective_logout_at: at('2026-09-17T12:00:00') },
    { login_at: at('2026-09-17T13:00:00'), effective_logout_at: at('2026-09-17T16:30:00') },
  ];
  assert.equal(connectedSecondsForDay(sessions, '2026-09-17'), 7.5 * H);
});

test('une session de nuit ne compte que pour sa part avant 2 h', () => {
  // 22 h → 4 h : 4 h sur la journée du 17 (jusqu'à 2 h), 2 h sur celle du 18.
  const night = [{ login_at: at('2026-09-17T22:00:00'), effective_logout_at: at('2026-09-18T04:00:00') }];
  assert.equal(connectedSecondsForDay(night, '2026-09-17'), 4 * H);
  assert.equal(connectedSecondsForDay(night, '2026-09-18'), 2 * H);
});

test('à 1 h du matin, on est encore dans la journée de la veille', () => {
  const late = [{ login_at: at('2026-09-18T00:30:00'), effective_logout_at: at('2026-09-18T01:30:00') }];
  assert.equal(connectedSecondsForDay(late, '2026-09-17'), 1 * H);
  assert.equal(connectedSecondsForDay(late, '2026-09-18'), 0);
});

test('les sessions d’autres journées sont ignorées', () => {
  const other = [{ login_at: at('2026-09-16T08:00:00'), effective_logout_at: at('2026-09-16T18:00:00') }];
  assert.equal(connectedSecondsForDay(other, '2026-09-17'), 0);
  assert.equal(connectedSecondsForDay([], '2026-09-17'), 0);
});

test('état de la limite : sous, avertissement, atteinte, dépassée', () => {
  const limit = 8 * H;
  assert.deepEqual(limitStatus(6 * H, limit), { limit_seconds: limit, connected_seconds: 6 * H, remaining_seconds: 2 * H, reached: false, warn: false });
  const nearly = limitStatus(limit - WARNING_BEFORE_SECONDS, limit);
  assert.equal(nearly.warn, true);
  assert.equal(nearly.reached, false);
  assert.equal(limitStatus(limit, limit).reached, true);
  const over = limitStatus(limit + 120, limit);
  assert.equal(over.reached, true);
  assert.equal(over.remaining_seconds, 0);
});

test('durées lisibles', () => {
  assert.equal(formatHours(8), '8 h');
  assert.equal(formatHours(7.5), '7 h 30');
  assert.equal(formatHours(9.25), '9 h 15');
});

test('message : en journée, reconnexion demain à 2 h', () => {
  const msg = limitReachedMessage({ limitHours: 8, day: '2026-09-17', now: at('2026-09-17T17:05:00') });
  assert.equal(msg, "Vous avez atteint 8 h de connexion aujourd'hui. Vous pourrez vous reconnecter demain à 2 h.");
});

test('message : à 1 h du matin, reconnexion AUJOURD’HUI à 2 h', () => {
  const msg = limitReachedMessage({ limitHours: 8, day: '2026-09-17', now: at('2026-09-18T01:10:00') });
  assert.match(msg, /reconnecter aujourd'hui à 2 h\.$/);
});
