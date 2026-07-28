import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDayPresence } from './presenceMetrics.js';

const day = {
  date: '2026-07-22',
  availability_status: 'AVAILABLE',
  time_slots: [
    { start_time: '09:00', end_time: '12:00' },
    { start_time: '14:00', end_time: '17:00' },
  ],
};

test('le calendrier affiche à venir pour une journée future', () => {
  const result = computeDayPresence({ ...day, date: '2026-07-23' }, [], {
    now: { date: '2026-07-22', minutes: 12 * 60 },
  });
  assert.equal(result.status.label, 'Upcoming');
});

test('le calendrier classe le second créneau seul en présence partielle', () => {
  const result = computeDayPresence(day, [{ start_time: '14:23', end_time: '15:00' }], {
    now: { date: '2026-07-22', minutes: 15 * 60 },
  });
  assert.equal(result.status.label, 'Partial presence');
  assert.equal(result.delayMinutes, 0);
});

test('une session en direct reste partielle si une période passée est non couverte', () => {
  const result = computeDayPresence(day, [{ start_time: '14:00', end_time: '15:00', is_live: true }], {
    now: { date: '2026-07-22', minutes: 15 * 60 },
  });
  assert.equal(result.status.label, 'Partial presence');
});

test('les sessions qui se chevauchent sont fusionnées', () => {
  const result = computeDayPresence(
    { ...day, time_slots: [{ start_time: '09:00', end_time: '12:00' }] },
    [
      { start_time: '09:00', end_time: '10:00' },
      { start_time: '09:30', end_time: '11:00' },
    ],
    { now: { date: '2026-07-22', minutes: 11 * 60 } }
  );
  assert.equal(result.connectedMinutes, 120);
  assert.equal(result.coveredMinutes, 120);
});
