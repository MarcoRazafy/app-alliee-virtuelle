import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHourRange } from './calendarRange.js';

// La grille n'affiche plus les 24 heures : elle se borne aux créneaux réels (+1 h de marge).
// Ces cas verrouillent le calcul de la plage, dont dépend tout le positionnement des blocs.

test('sans aucun créneau, repli sur 07:00-20:00', () => {
  assert.deepEqual(computeHourRange([], {}), { startHour: 7, endHour: 20 });
  assert.deepEqual(computeHourRange(undefined, undefined), { startHour: 7, endHour: 20 });
});

test('créneaux 08:00-17:00 → plage 07:00-18:00 (une heure de marge)', () => {
  const days = [
    { date: '2026-07-27', time_slots: [{ start_time: '08:00', end_time: '12:00' }] },
    { date: '2026-07-28', time_slots: [{ start_time: '13:00', end_time: '17:00' }] },
  ];
  assert.deepEqual(computeHourRange(days, {}), { startHour: 7, endHour: 18 });
});

test('une connexion hors créneaux élargit la plage', () => {
  const days = [{ date: '2026-07-27', time_slots: [{ start_time: '09:00', end_time: '12:00' }] }];
  const segments = { '2026-07-27': [{ start_time: '06:30', end_time: '13:00' }] };
  assert.deepEqual(computeHourRange(days, segments), { startHour: 5, endHour: 14 });
});

test('en mode édition, 07:00-20:00 reste dessinable même avec des créneaux étroits', () => {
  const days = [{ date: '2026-07-27', time_slots: [{ start_time: '10:00', end_time: '11:00' }] }];
  assert.deepEqual(computeHourRange(days, {}, true), { startHour: 7, endHour: 20 });
});

test('en mode édition, une plage plus large que le plancher est conservée', () => {
  const days = [{ date: '2026-07-27', time_slots: [{ start_time: '05:00', end_time: '22:00' }] }];
  assert.deepEqual(computeHourRange(days, {}, true), { startHour: 4, endHour: 23 });
});

test('les bornes restent dans 00:00-24:00', () => {
  const days = [{ date: '2026-07-27', time_slots: [{ start_time: '00:00', end_time: '24:00' }] }];
  assert.deepEqual(computeHourRange(days, {}), { startHour: 0, endHour: 24 });
});

test('un créneau incomplet ou incohérent est ignoré (pas de NaN)', () => {
  const days = [
    { date: '2026-07-27', time_slots: [{ start_time: '', end_time: '12:00' }] },
    { date: '2026-07-28', time_slots: [{ start_time: '15:00', end_time: '15:00' }] },
    { date: '2026-07-29', time_slots: [{ start_time: '18:00', end_time: '09:00' }] },
  ];
  assert.deepEqual(computeHourRange(days, {}), { startHour: 7, endHour: 20 });
});

test('la plage est toujours non vide', () => {
  const { startHour, endHour } = computeHourRange([], {});
  assert.ok(endHour > startHour);
});
