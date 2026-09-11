import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPeriod, periodBounds, toYMD } from './deadlineRange.js';

// Mercredi 10 septembre 2026. Figé : les bornes ne doivent pas dépendre du jour du test.
const MERCREDI = new Date(2026, 8, 10);

test('la période « jour » se limite à aujourd’hui', () => {
  assert.deepEqual(periodBounds('day', MERCREDI), { from: '2026-09-10', to: '2026-09-10' });
  assert.ok(matchesPeriod('2026-09-10', 'day', MERCREDI));
  assert.equal(matchesPeriod('2026-09-11', 'day', MERCREDI), false);
});

test('la semaine va du lundi au dimanche', () => {
  assert.deepEqual(periodBounds('week', MERCREDI), { from: '2026-09-07', to: '2026-09-13' });
  assert.ok(matchesPeriod('2026-09-07', 'week', MERCREDI));
  assert.ok(matchesPeriod('2026-09-13', 'week', MERCREDI));
  assert.equal(matchesPeriod('2026-09-06', 'week', MERCREDI), false);
  assert.equal(matchesPeriod('2026-09-14', 'week', MERCREDI), false);
});

test('un dimanche appartient à la semaine qui vient de s’écouler, pas à la suivante', () => {
  // getDay() rend 0 le dimanche : sans correction, le lundi calculé serait le lendemain.
  const dimanche = new Date(2026, 8, 13);
  assert.deepEqual(periodBounds('week', dimanche), { from: '2026-09-07', to: '2026-09-13' });
});

test('le mois couvre du 1er au dernier jour, quelle que soit sa longueur', () => {
  assert.deepEqual(periodBounds('month', MERCREDI), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(periodBounds('month', new Date(2026, 1, 5)), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(periodBounds('month', new Date(2024, 1, 5)), { from: '2024-02-01', to: '2024-02-29' });
});

test('la plage personnalisée accepte une seule borne', () => {
  assert.ok(matchesPeriod('2026-12-01', 'custom', MERCREDI, { from: '2026-10-01' }));
  assert.equal(matchesPeriod('2026-09-01', 'custom', MERCREDI, { from: '2026-10-01' }), false);
  assert.ok(matchesPeriod('2026-01-05', 'custom', MERCREDI, { to: '2026-02-01' }));
  assert.equal(matchesPeriod('2026-03-05', 'custom', MERCREDI, { to: '2026-02-01' }), false);
});

test('une plage personnalisée vide n’écarte rien', () => {
  assert.ok(matchesPeriod('2026-01-05', 'custom', MERCREDI, {}));
  assert.ok(matchesPeriod(null, 'custom', MERCREDI, {}));
});

test('sans période, tout passe', () => {
  assert.ok(matchesPeriod('2020-01-01', '', MERCREDI));
  assert.ok(matchesPeriod(null, '', MERCREDI));
});

test('une tâche sans échéance est écartée dès qu’une période est demandée', () => {
  assert.equal(matchesPeriod(null, 'week', MERCREDI), false);
  assert.equal(matchesPeriod(undefined, 'month', MERCREDI), false);
});

test('un horodatage complet est comparé sur sa seule date', () => {
  assert.ok(matchesPeriod('2026-09-10T23:30:00.000Z', 'day', MERCREDI));
});

test('toYMD utilise les composantes locales, sans bascule UTC', () => {
  assert.equal(toYMD(new Date(2026, 0, 1)), '2026-01-01');
  assert.equal(toYMD(new Date(2026, 11, 31)), '2026-12-31');
});
