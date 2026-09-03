import test from 'node:test';
import assert from 'node:assert/strict';
// Extension explicite : ces tests sont exécutés directement par Node (node:test), qui ne
// résout pas les imports sans extension comme le fait Vite.
import { businessDayOf, businessDayNow, DAY_CUTOFF_HOUR } from './businessDay.js';

// Ces tests construisent les dates avec les composantes LOCALES (new Date(y, m, d, h)),
// exactement comme le navigateur d'un employé : la journée de travail est une notion locale.
const at = (year, month, day, hour, minute = 0) => new Date(year, month - 1, day, hour, minute);

test('la coupure est bien à 2 h du matin', () => {
  assert.equal(DAY_CUTOFF_HOUR, 2);
});

test('un poste de nuit fini à 1 h compte sur la journée de la veille', () => {
  assert.equal(businessDayOf(at(2026, 9, 8, 1, 0)), '2026-09-07');
  assert.equal(businessDayOf(at(2026, 9, 8, 1, 59)), '2026-09-07');
});

test('à 2 h pile, la nouvelle journée commence', () => {
  assert.equal(businessDayOf(at(2026, 9, 8, 2, 0)), '2026-09-08');
});

test('minuit passé reste rattaché à la veille', () => {
  assert.equal(businessDayOf(at(2026, 9, 8, 0, 10)), '2026-09-07');
});

test('une heure de journée ordinaire donne la date du jour', () => {
  assert.equal(businessDayOf(at(2026, 9, 8, 14, 30)), '2026-09-08');
  assert.equal(businessDayOf(at(2026, 9, 7, 23, 30)), '2026-09-07');
});

test('le changement de mois est correct (1er du mois à 1 h → dernier jour du mois précédent)', () => {
  assert.equal(businessDayOf(at(2026, 9, 1, 1, 30)), '2026-08-31');
});

test('le changement d’année est correct (1er janvier à 1 h → 31 décembre)', () => {
  assert.equal(businessDayOf(at(2026, 1, 1, 1, 0)), '2025-12-31');
});

test('une date invalide ne fait pas planter le calcul', () => {
  assert.equal(businessDayOf(new Date('pas une date')), null);
});

test('businessDayNow renvoie une date au format attendu', () => {
  assert.match(businessDayNow(), /^\d{4}-\d{2}-\d{2}$/);
});
