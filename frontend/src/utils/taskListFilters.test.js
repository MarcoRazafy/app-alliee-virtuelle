import test from 'node:test';
import assert from 'node:assert/strict';
import { assigneeOptions, deadlineYMD, filterTaskList, matchesDeadlineFilter } from './taskListFilters.js';

const MERCREDI = new Date(2026, 9, 21);

const task = (over) => ({
  id: over.id,
  title: 'Tâche',
  status: 'VALIDEE',
  priority: 'NORMALE',
  deadline: '2026-10-21',
  assignees: [{ id: 'u1', full_name: 'Marie Rakoto' }],
  updated_at: '2026-10-01T08:00:00Z',
  ...over,
});

test('l’échéance se lit en date locale, qu’elle arrive en AAAA-MM-JJ ou en horodatage', () => {
  assert.equal(deadlineYMD('2026-10-21'), '2026-10-21');
  const minuitLocal = new Date(2026, 9, 21);
  assert.equal(deadlineYMD(minuitLocal.toISOString()), '2026-10-21');
  assert.equal(deadlineYMD(null), null);
});

test('les filtres d’échéance : aujourd’hui, semaine, mois, passée', () => {
  assert.ok(matchesDeadlineFilter('2026-10-21', 'today', MERCREDI));
  assert.equal(matchesDeadlineFilter('2026-10-22', 'today', MERCREDI), false);
  assert.ok(matchesDeadlineFilter('2026-10-25', 'week', MERCREDI));
  assert.equal(matchesDeadlineFilter('2026-10-26', 'week', MERCREDI), false);
  assert.ok(matchesDeadlineFilter('2026-10-31', 'month', MERCREDI));
  assert.ok(matchesDeadlineFilter('2026-10-20', 'past', MERCREDI));
  assert.equal(matchesDeadlineFilter('2026-10-21', 'past', MERCREDI), false);
  assert.equal(matchesDeadlineFilter(null, 'past', MERCREDI), false);
});

test('la recherche couvre titre, personnes, projet et description, sans accents', () => {
  const tasks = [
    task({ id: 'a', title: 'Refonte page d’accueil', space_name: 'INTERNE' }),
    task({ id: 'b', title: 'Devis', assignees: [{ id: 'u2', full_name: 'Éric Randria' }] }),
    task({ id: 'c', title: 'Logo', description: '<p>Couleurs <strong>validées</strong></p>' }),
  ];
  const ids = (search) => filterTaskList(tasks, { search }, MERCREDI).map((t) => t.id);
  assert.deepEqual(ids('refonte'), ['a']);
  assert.deepEqual(ids('eric'), ['b']);
  assert.deepEqual(ids('interne accueil'), ['a']);
  assert.deepEqual(ids('validees'), ['c']);
  assert.deepEqual(ids('strong'), [], 'les balises HTML ne comptent pas');
});

test('statut affiché, priorité et personne se combinent', () => {
  const tasks = [
    task({ id: 'a', status: 'EN_COURS', has_active_session: false }),
    task({ id: 'b', status: 'EN_COURS', has_active_session: true, priority: 'HAUTE' }),
    task({ id: 'c', status: 'VALIDEE', assignees: [{ id: 'u2', full_name: 'Paul' }] }),
  ];
  const ids = (filters) => filterTaskList(tasks, filters, MERCREDI).map((t) => t.id).sort();
  assert.deepEqual(ids({ statuses: ['A_REPRENDRE'] }), ['a']);
  assert.deepEqual(ids({ statuses: ['EN_COURS'] }), ['b']);
  assert.deepEqual(ids({ priorities: ['HAUTE'] }), ['b']);
  assert.deepEqual(ids({ assignees: ['u2'] }), ['c']);
  assert.deepEqual(ids({ statuses: ['VALIDEE'], assignees: ['u1'] }), []);
});

test('les tâches modifiées le plus récemment passent en premier', () => {
  const tasks = [
    task({ id: 'ancienne', updated_at: '2026-10-01T08:00:00Z' }),
    task({ id: 'recente', updated_at: '2026-10-20T08:00:00Z' }),
  ];
  assert.deepEqual(filterTaskList(tasks, {}, MERCREDI).map((t) => t.id), ['recente', 'ancienne']);
});

test('la liste des personnes pour le filtre est dédoublonnée et triée', () => {
  const tasks = [
    task({ id: 'a', assignees: [{ id: 'u2', full_name: 'Zo' }, { id: 'u1', full_name: 'Marie' }] }),
    task({ id: 'b', assignees: [{ id: 'u1', full_name: 'Marie' }] }),
    task({ id: 'c', assignees: [], assigned_to: 'u3', assigned_to_name: 'Éric' }),
  ];
  assert.deepEqual(assigneeOptions(tasks), [
    { value: 'u3', label: 'Éric' },
    { value: 'u1', label: 'Marie' },
    { value: 'u2', label: 'Zo' },
  ]);
});
