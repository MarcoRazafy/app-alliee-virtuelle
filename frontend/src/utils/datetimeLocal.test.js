import test from 'node:test';
import assert from 'node:assert/strict';
import { toDatetimeLocal, datetimeLocalToIso } from './datetimeLocal.js';

test('la valeur envoyée est un instant absolu, en UTC', () => {
  const iso = datetimeLocalToIso('2026-09-17T10:54');
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('la valeur envoyée correspond à l’heure saisie À L’HEURE LOCALE, pas à l’heure UTC', () => {
  const iso = datetimeLocalToIso('2026-09-17T10:54');
  const d = new Date(iso);
  // Relue à l'heure locale, on retrouve exactement ce qui a été tapé…
  assert.equal(d.getHours(), 10);
  assert.equal(d.getMinutes(), 54);
  // …et l'écart avec l'UTC est celui du fuseau local (0 seulement si le poste est en UTC).
  assert.equal(d.getUTCHours(), (10 * 60 + 54 + d.getTimezoneOffset()) / 60 | 0);
});

test('aller-retour : champ → envoi → réaffichage rend la même valeur', () => {
  for (const v of ['2026-09-17T10:54', '2026-01-01T00:00', '2026-12-31T23:59', '2026-09-18T01:30']) {
    assert.equal(toDatetimeLocal(datetimeLocalToIso(v)), v, v);
  }
});

test('un instant du serveur s’affiche à l’heure locale', () => {
  const instant = '2026-09-17T07:54:00.000Z';
  assert.equal(toDatetimeLocal(instant), toDatetimeLocal(new Date(instant)));
  assert.equal(datetimeLocalToIso(toDatetimeLocal(instant)), instant);
});

test('valeurs vides ou invalides : rien plutôt qu’une date fausse', () => {
  assert.equal(datetimeLocalToIso(''), null);
  assert.equal(datetimeLocalToIso(undefined), null);
  assert.equal(datetimeLocalToIso('pas une date'), null);
  assert.equal(toDatetimeLocal(null), '');
  assert.equal(toDatetimeLocal('n’importe quoi'), '');
});
