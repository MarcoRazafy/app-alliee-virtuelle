import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTerms, normalize } from './textSearch.js';

test('la recherche ignore les accents', () => {
  assert.equal(normalize('Opérations'), 'operations');
  assert.ok(matchesTerms('Espace Opérations', 'operations'));
  assert.ok(matchesTerms('Espace Operations', 'opérations'));
});

test('la recherche ignore la casse', () => {
  assert.ok(matchesTerms('Relire le contrat', 'RELIRE'));
});

test('chaque mot compte séparément, sans ordre imposé', () => {
  assert.ok(matchesTerms('Relire le contrat', 'contrat relire'));
  assert.ok(matchesTerms('Relire le contrat', 'relire contrat'));
});

test('un mot absent élimine le résultat, même si les autres correspondent', () => {
  assert.equal(matchesTerms('Relire le contrat', 'contrat inexistant'), false);
});

test('une recherche vide accepte tout', () => {
  assert.ok(matchesTerms('quoi que ce soit', ''));
  assert.ok(matchesTerms('quoi que ce soit', '   '));
  assert.ok(matchesTerms('', ''));
});

test('un tableau de morceaux permet de croiser plusieurs champs', () => {
  // Le titre porte « Relire », le chemin porte « Facturation » : la recherche croise les deux.
  const parts = ['Relire le contrat', 'Espace Opérations › Clients › Facturation'];
  assert.ok(matchesTerms(parts, 'relire facturation'));
  assert.equal(matchesTerms(parts, 'relire marketing'), false);
});

test('une valeur absente ne fait pas planter', () => {
  assert.equal(matchesTerms(null, 'test'), false);
  assert.equal(matchesTerms(undefined, 'test'), false);
  assert.ok(matchesTerms(null, ''));
  assert.ok(matchesTerms([null, undefined, 'Relire'], 'relire'));
});
