const test = require('node:test');
const assert = require('node:assert/strict');
const { planSelection } = require('../src/utils/myDay');

const T8 = new Date('2026-09-19T08:12:00+03:00');

test('avant validation : rien n’est validé, rien ne part au Daily', () => {
  const plan = planSelection([], ['a', 'b']);
  assert.equal(plan.wasValidated, false);
  assert.deepEqual(plan.rows.map((r) => [r.task_id, r.selected_order, r.validated_at, r.validate_now]), [
    ['a', 1, null, false],
    ['b', 2, null, false],
  ]);
});

test('après validation : une tâche ajoutée est validée à l’instant et signalée comme ajoutée', () => {
  const plan = planSelection([{ task_id: 'a', validated_at: T8 }], ['a', 'c']);
  assert.equal(plan.wasValidated, true);
  assert.deepEqual(plan.added, ['c']);
  const [a, c] = plan.rows;
  assert.equal(a.validated_at, T8); // heure d'origine conservée
  assert.equal(a.validate_now, false);
  assert.equal(c.validated_at, null);
  assert.equal(c.validate_now, true);
});

test('après validation : retirer une tâche ne touche pas aux autres', () => {
  const plan = planSelection([{ task_id: 'a', validated_at: T8 }, { task_id: 'b', validated_at: T8 }], ['b']);
  assert.deepEqual(plan.added, []);
  assert.deepEqual(plan.rows.map((r) => [r.task_id, r.selected_order, r.validated_at]), [['b', 1, T8]]);
});

test('réordonner ne crée aucun ajout', () => {
  const plan = planSelection([{ task_id: 'a', validated_at: T8 }, { task_id: 'b', validated_at: T8 }], ['b', 'a']);
  assert.deepEqual(plan.added, []);
  assert.deepEqual(plan.rows.map((r) => r.task_id), ['b', 'a']);
});

test('tout retirer : sélection vide', () => {
  const plan = planSelection([{ task_id: 'a', validated_at: T8 }], []);
  assert.deepEqual(plan.rows, []);
  assert.deepEqual(plan.added, []);
});
