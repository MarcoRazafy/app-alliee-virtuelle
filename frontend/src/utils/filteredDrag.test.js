import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFilteredMove } from './filteredDrag.js';

const T = (id) => ({ id, title: id });
const ids = (list) => list.map((t) => t.id);
const matchesA = (t) => t.id.includes('a');

test('retirer une tâche visible : les masquées restent', () => {
  const full = [T('a1'), T('b1'), T('a2')];
  const result = mergeFilteredMove(full, [T('a1')], matchesA);
  assert.deepEqual(ids(result), ['a1', 'b1']);
});

test('ajouter une tâche venue de l’autre colonne : ajoutée à la fin', () => {
  const full = [T('a1'), T('b1')];
  const result = mergeFilteredMove(full, [T('a1'), T('a9')], matchesA);
  assert.deepEqual(ids(result), ['a1', 'b1', 'a9']);
});

test('réordonner les visibles : les masquées gardent leur place', () => {
  const full = [T('a1'), T('b1'), T('a2'), T('b2')];
  const result = mergeFilteredMove(full, [T('a2'), T('a1')], matchesA);
  assert.deepEqual(ids(result), ['a2', 'b1', 'a1', 'b2']);
});

test('tout retirer : seules les masquées subsistent', () => {
  const full = [T('a1'), T('b1'), T('a2')];
  assert.deepEqual(ids(mergeFilteredMove(full, [], matchesA)), ['b1']);
});

test('aucune tâche masquée (recherche vide) : la liste renvoyée est reprise telle quelle', () => {
  const full = [T('a1'), T('a2')];
  const result = mergeFilteredMove(full, [T('a2'), T('a1')], () => true);
  assert.deepEqual(ids(result), ['a2', 'a1']);
});

test('liste complète vide : tout est une arrivée', () => {
  assert.deepEqual(ids(mergeFilteredMove([], [T('a1')], matchesA)), ['a1']);
});

test('aucune tâche n’est perdue ni dupliquée', () => {
  const full = [T('a1'), T('b1'), T('a2'), T('b2'), T('a3')];
  const result = mergeFilteredMove(full, [T('a3'), T('a1'), T('a7')], matchesA);
  assert.equal(new Set(ids(result)).size, result.length, 'doublon');
  assert.ok(['b1', 'b2'].every((id) => ids(result).includes(id)));
});
