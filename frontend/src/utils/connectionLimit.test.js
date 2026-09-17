import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLimit, limitWarningMessage, limitCheckDelayMs, PRECISE_TIMER_WITHIN_SECONDS } from './connectionLimit.js';

test('durée de la limite lisible', () => {
  assert.equal(formatLimit(8 * 3600), '8 h');
  assert.equal(formatLimit(7.5 * 3600), '7 h 30');
});

test('avertissement : minutes restantes arrondies au-dessus, jamais « 0 min »', () => {
  assert.match(limitWarningMessage({ limit_seconds: 28800, remaining_seconds: 540 }), /8 h de connexion dans 9 min/);
  assert.match(limitWarningMessage({ limit_seconds: 28800, remaining_seconds: 20 }), /dans 1 min/);
  assert.match(limitWarningMessage({ limit_seconds: 28800, remaining_seconds: 0 }), /dans 1 min/);
  assert.match(limitWarningMessage({ limit_seconds: 28800, remaining_seconds: 600 }), /enregistrer votre travail/);
});

test('minuteur précis seulement à l’approche de la coupure', () => {
  assert.equal(limitCheckDelayMs(null), null);
  assert.equal(limitCheckDelayMs({ remaining_seconds: 3 * 3600 }), null);
  assert.equal(limitCheckDelayMs({ remaining_seconds: PRECISE_TIMER_WITHIN_SECONDS }), PRECISE_TIMER_WITHIN_SECONDS * 1000 + 1500);
  assert.equal(limitCheckDelayMs({ remaining_seconds: 90 }), 91500);
  assert.equal(limitCheckDelayMs({ remaining_seconds: 0 }), 1500);
});
