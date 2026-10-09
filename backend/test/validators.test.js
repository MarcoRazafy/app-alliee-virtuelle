const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidEmail,
  isValidPassword,
  isValidPriority,
  isValidTitle,
  isFutureDate,
  isTodayOrFuture,
} = require('../src/utils/validators');

test('isValidEmail : accepte un email correct, refuse le reste', () => {
  assert.equal(isValidEmail('marco@alliee.test'), true);
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('sansarobase'), false);
  assert.equal(isValidEmail('manque@point'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
});

test('isValidPassword : au moins 8 caractères', () => {
  assert.equal(isValidPassword('1234567'), false);
  assert.equal(isValidPassword('12345678'), true);
  assert.equal(isValidPassword(12345678), false);
});

test('isValidPriority : sensible à la casse, valeurs autorisées seulement', () => {
  assert.equal(isValidPriority('URGENT'), true);
  assert.equal(isValidPriority('NORMALE'), true);
  assert.equal(isValidPriority('urgent'), false);
  assert.equal(isValidPriority('MOYENNE'), false);
});

test('isValidTitle : non vide et < 255 caractères', () => {
  assert.equal(isValidTitle('Rédiger le rapport'), true);
  assert.equal(isValidTitle('   '), false);
  assert.equal(isValidTitle(''), false);
  assert.equal(isValidTitle('x'.repeat(254)), true);
  assert.equal(isValidTitle('x'.repeat(255)), false);
  assert.equal(isValidTitle(null), false);
});

test('isFutureDate : vrai seulement pour une date strictement future', () => {
  assert.equal(isFutureDate(null), false);
  assert.equal(isFutureDate('pas-une-date'), false);
  assert.equal(isFutureDate('2000-01-01'), false);
  assert.equal(isFutureDate('2999-01-01'), true);
});

test("isTodayOrFuture : accepte aujourd'hui et le futur, refuse le passé", () => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(isTodayOrFuture(null), false);
  assert.equal(isTodayOrFuture('pas-une-date'), false);
  assert.equal(isTodayOrFuture('2000-01-01'), false);
  assert.equal(isTodayOrFuture(todayStr), true);
  assert.equal(isTodayOrFuture('2999-01-01'), true);
});
