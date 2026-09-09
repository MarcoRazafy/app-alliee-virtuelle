import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, normalize } from './projectSearch.js';

const PROJECTS = [
  { id: '1', path: 'Espace Opérations › Clients › Facturation' },
  { id: '2', path: 'Espace Opérations › Clients › Suivi clients' },
  { id: '3', path: 'Espace Opérations › Interne › Technique' },
  { id: '4', path: 'Espace Opérations › Interne › Marketing' },
];
const paths = (rows) => rows.map((r) => r.path);

test('la recherche ignore les accents', () => {
  assert.equal(normalize('Opérations'), 'operations');
  assert.deepEqual(paths(filterProjects(PROJECTS, 'operations')).length, 4);
});

test('la recherche ignore la casse', () => {
  assert.deepEqual(paths(filterProjects(PROJECTS, 'TECHNIQUE')), [
    'Espace Opérations › Interne › Technique',
  ]);
});

test('chaque mot compte séparément, sans ordre imposé', () => {
  // « factu clients » : les deux mots sont dans le chemin, mais pas côte à côte.
  assert.deepEqual(paths(filterProjects(PROJECTS, 'factu clients')), [
    'Espace Opérations › Clients › Facturation',
  ]);
  assert.deepEqual(paths(filterProjects(PROJECTS, 'clients factu')), [
    'Espace Opérations › Clients › Facturation',
  ]);
});

test('un mot absent élimine le projet, même si l’autre correspond', () => {
  assert.deepEqual(filterProjects(PROJECTS, 'clients inexistant'), []);
});

test('une recherche vide renvoie tous les projets', () => {
  assert.equal(filterProjects(PROJECTS, '').length, 4);
  assert.equal(filterProjects(PROJECTS, '   ').length, 4);
});

test('la recherche porte sur tout le chemin, pas seulement le nom de liste', () => {
  assert.equal(filterProjects(PROJECTS, 'interne').length, 2);
});

test('une liste absente ou un projet sans chemin ne font pas planter', () => {
  assert.deepEqual(filterProjects(null, 'test'), []);
  assert.deepEqual(filterProjects([{ id: 'x' }], 'test'), []);
  assert.equal(filterProjects([{ id: 'x' }], '').length, 1);
});
