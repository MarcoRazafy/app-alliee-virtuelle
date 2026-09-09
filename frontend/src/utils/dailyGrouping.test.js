import test from 'node:test';
import assert from 'node:assert/strict';
// Extension explicite : ces tests sont exécutés directement par Node (node:test).
import { groupByProject, projectPath, priorityRank } from './dailyGrouping.js';

const task = (title, priority, space, folder, list) => ({
  title,
  priority,
  space_name: space,
  folder_name: folder,
  list_name: list,
});

test('le chemin affiche l’emplacement complet, pas seulement la liste', () => {
  assert.equal(
    projectPath(task('t', 'NORMALE', 'Espace Opérations', 'Clients', 'Facturation')),
    'Espace Opérations › Clients › Facturation'
  );
});

test('les niveaux absents sont ignorés sans laisser de séparateur orphelin', () => {
  assert.equal(projectPath(task('t', 'NORMALE', null, null, 'Technique')), 'Technique');
  assert.equal(projectPath(task('t', 'NORMALE', 'Espace', null, 'Liste')), 'Espace › Liste');
  assert.equal(projectPath(task('t', 'NORMALE', null, null, null)), 'Sans projet');
});

test('dans un groupe, les priorités hautes remontent', () => {
  const groups = groupByProject([
    task('faible', 'FAIBLE', 'E', 'D', 'L'),
    task('urgente', 'URGENT', 'E', 'D', 'L'),
    task('normale', 'NORMALE', 'E', 'D', 'L'),
    task('haute', 'HAUTE', 'E', 'D', 'L'),
  ]);
  assert.deepEqual(
    groups[0].tasks.map((t) => t.title),
    ['urgente', 'haute', 'normale', 'faible']
  );
});

test('les groupes sont classés sur leur tâche la plus urgente', () => {
  const groups = groupByProject([
    task('a', 'FAIBLE', 'E', 'D', 'Alpha'),
    task('b', 'URGENT', 'E', 'D', 'Zeta'),
  ]);
  // Zeta passe devant Alpha malgré l'ordre alphabétique : c'est lui qui porte l'urgence.
  assert.deepEqual(groups.map((g) => g.project), ['E › D › Zeta', 'E › D › Alpha']);
});

test('à priorité égale, les groupes restent classés par ordre alphabétique', () => {
  const groups = groupByProject([
    task('b', 'NORMALE', 'E', 'D', 'Zeta'),
    task('a', 'NORMALE', 'E', 'D', 'Alpha'),
  ]);
  assert.deepEqual(groups.map((g) => g.project), ['E › D › Alpha', 'E › D › Zeta']);
});

test('à priorité égale, l’ordre choisi par l’employé est conservé', () => {
  const groups = groupByProject([
    task('deuxieme', 'NORMALE', 'E', 'D', 'L'),
    task('premiere', 'NORMALE', 'E', 'D', 'L'),
  ]);
  assert.deepEqual(groups[0].tasks.map((t) => t.title), ['deuxieme', 'premiere']);
});

test('une priorité inconnue ou absente ne remonte pas en tête', () => {
  assert.ok(priorityRank('INEXISTANTE') > priorityRank('FAIBLE'));
  const groups = groupByProject([
    task('sans priorite', undefined, 'E', 'D', 'L'),
    task('faible', 'FAIBLE', 'E', 'D', 'L'),
  ]);
  assert.deepEqual(groups[0].tasks.map((t) => t.title), ['faible', 'sans priorite']);
});

test('une liste vide ne fait pas planter le regroupement', () => {
  assert.deepEqual(groupByProject([]), []);
  assert.deepEqual(groupByProject(null), []);
});
