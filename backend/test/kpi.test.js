const test = require('node:test');
const assert = require('node:assert/strict');
const { computeCompletionRate } = require('../src/utils/kpi');

// Taux de complétion = tâches CONFIRMEE / assignées, arrondi à une décimale (ex : 66.7).

test('aucune tâche assignée → taux de 0 (pas de division par zéro)', () => {
  assert.equal(computeCompletionRate(0, 0), 0);
  assert.equal(computeCompletionRate(5, 0), 0);
});

test('toutes les tâches confirmées → 100 %', () => {
  assert.equal(computeCompletionRate(10, 10), 100);
});

test('aucune tâche confirmée → 0 %', () => {
  assert.equal(computeCompletionRate(0, 8), 0);
});

test('taux partiel arrondi à une décimale', () => {
  assert.equal(computeCompletionRate(2, 3), 66.7);
  assert.equal(computeCompletionRate(1, 3), 33.3);
});
