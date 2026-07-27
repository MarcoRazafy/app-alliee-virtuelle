const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidEmail,
  isValidPassword,
  isValidPriority,
  isValidTitle,
  isFutureDate,
} = require('../src/utils/validators');

test('isValidEmail : accepte un email correct, refuse le reste', () => {
  assert.equal(isValidEmail('marco@alliee.test'), true);
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('sansarobase'), false);
  assert.equal(isValidEmail('manque@point'), false); // pas de "."
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false); // non-string
});

test('isValidPassword : au moins 8 caractères', () => {
  assert.equal(isValidPassword('1234567'), false); // 7
  assert.equal(isValidPassword('12345678'), true); // 8
  assert.equal(isValidPassword(12345678), false); // non-string
});

test('isValidPriority : sensible à la casse, valeurs autorisées seulement', () => {
  assert.equal(isValidPriority('URGENT'), true);
  assert.equal(isValidPriority('NORMALE'), true);
  assert.equal(isValidPriority('urgent'), false); // mauvaise casse
  assert.equal(isValidPriority('MOYENNE'), false); // n'existe pas
});

test('isValidTitle : non vide et < 255 caractères', () => {
  assert.equal(isValidTitle('Rédiger le rapport'), true);
  assert.equal(isValidTitle('   '), false); // que des espaces
  assert.equal(isValidTitle(''), false);
  assert.equal(isValidTitle('x'.repeat(254)), true);
  assert.equal(isValidTitle('x'.repeat(255)), false); // trop long
  assert.equal(isValidTitle(null), false);
});

test('isFutureDate : vrai seulement pour une date strictement future', () => {
  assert.equal(isFutureDate(null), false);
  assert.equal(isFutureDate('pas-une-date'), false);
  assert.equal(isFutureDate('2000-01-01'), false); // passé
  assert.equal(isFutureDate('2999-01-01'), true); // futur lointain
});
