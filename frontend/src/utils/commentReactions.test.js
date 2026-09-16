import test from 'node:test';
import assert from 'node:assert/strict';
import { NIKE, findReaction, reactorsLabel, reactorsTitle, toggleReactionLocally } from './commentReactions.js';

const ME = { id: 'me', name: 'admin GmAdmin' };
const SOPHIE = { id: 's', name: 'Sophie Martin' };
const HUGO = { id: 'h', name: 'Hugo Moreau' };
const LEA = { id: 'l', name: 'Léa Bernard' };

test('libellé : une seule personne', () => {
  assert.equal(reactorsLabel([SOPHIE], ME.id), 'Sophie Martin');
  assert.equal(reactorsLabel([ME], ME.id), 'Vous');
});

test('libellé : le lecteur passe en tête, même s’il a réagi après', () => {
  assert.equal(reactorsLabel([SOPHIE, ME], ME.id), 'Vous et Sophie Martin');
  assert.equal(reactorsLabel([SOPHIE, HUGO], ME.id), 'Sophie Martin et Hugo Moreau');
});

test('libellé : au-delà de deux, on compte les autres', () => {
  assert.equal(reactorsLabel([SOPHIE, HUGO, LEA], ME.id), 'Sophie Martin et 2 autres');
  assert.equal(reactorsLabel([SOPHIE, HUGO, ME], ME.id), 'Vous et 2 autres');
});

test('libellé : rien à dire sans réaction', () => {
  assert.equal(reactorsLabel([], ME.id), '');
  assert.equal(reactorsLabel(undefined, ME.id), '');
});

test('infobulle : la liste complète, lecteur en tête', () => {
  assert.equal(reactorsTitle([SOPHIE, HUGO, ME], ME.id), 'Vu par : Vous, Sophie Martin, Hugo Moreau');
});

test('bascule : première réaction sur un commentaire vierge', () => {
  const next = toggleReactionLocally([], NIKE, ME);
  assert.deepEqual(next, [{ emoji: NIKE, count: 1, mine: true, users: [ME] }]);
});

test('bascule : s’ajouter à la réaction d’un autre', () => {
  const before = [{ emoji: NIKE, count: 1, mine: false, users: [SOPHIE] }];
  const next = toggleReactionLocally(before, NIKE, ME);
  assert.deepEqual(next, [{ emoji: NIKE, count: 2, mine: true, users: [SOPHIE, ME] }]);
});

test('bascule : retirer la sienne quand d’autres restent', () => {
  const before = [{ emoji: NIKE, count: 2, mine: true, users: [SOPHIE, ME] }];
  const next = toggleReactionLocally(before, NIKE, ME);
  assert.deepEqual(next, [{ emoji: NIKE, count: 1, mine: false, users: [SOPHIE] }]);
});

test('bascule : retirer la dernière fait disparaître la réaction', () => {
  const before = [{ emoji: NIKE, count: 1, mine: true, users: [ME] }];
  assert.deepEqual(toggleReactionLocally(before, NIKE, ME), []);
});

test('bascule : l’état d’origine reste intact (il sert à annuler si le serveur refuse)', () => {
  const before = [{ emoji: NIKE, count: 1, mine: false, users: [SOPHIE] }];
  const snapshot = JSON.parse(JSON.stringify(before));
  toggleReactionLocally(before, NIKE, ME);
  assert.deepEqual(before, snapshot);
});

test('deux clics successifs ramènent à l’état de départ', () => {
  const before = [{ emoji: NIKE, count: 1, mine: false, users: [SOPHIE] }];
  const twice = toggleReactionLocally(toggleReactionLocally(before, NIKE, ME), NIKE, ME);
  assert.deepEqual(twice, before);
});

test('findReaction : trouve la bonne, ou null', () => {
  const list = [{ emoji: NIKE, count: 1, mine: false, users: [SOPHIE] }];
  assert.equal(findReaction(list, NIKE).count, 1);
  assert.equal(findReaction(list, '👍'), null);
  assert.equal(findReaction(undefined, NIKE), null);
});
