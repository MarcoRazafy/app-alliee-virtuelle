import test from 'node:test';
import assert from 'node:assert/strict';
import { paginationRange, GAP } from './paginationRange.js';

test('peu de pages : elles sont toutes affichées, sans trou', () => {
  assert.deepEqual(paginationRange(1, 1), [1]);
  assert.deepEqual(paginationRange(3, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(paginationRange(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('le nombre de boutons reste constant quelle que soit la page', () => {
  const widths = new Set();
  for (let p = 1; p <= 15; p += 1) widths.add(paginationRange(p, 15).length);
  assert.deepEqual([...widths], [7]);
});

test('au début : un seul trou, à droite', () => {
  assert.deepEqual(paginationRange(1, 15), [1, 2, 3, 4, 5, GAP, 15]);
  assert.deepEqual(paginationRange(3, 15), [1, 2, 3, 4, 5, GAP, 15]);
});

test('au milieu : deux trous, la page courante encadrée de ses voisines', () => {
  assert.deepEqual(paginationRange(8, 15), [1, GAP, 7, 8, 9, GAP, 15]);
});

test('à la fin : un seul trou, à gauche', () => {
  assert.deepEqual(paginationRange(15, 15), [1, GAP, 11, 12, 13, 14, 15]);
  assert.deepEqual(paginationRange(13, 15), [1, GAP, 11, 12, 13, 14, 15]);
});

test('les deux extrémités sont toujours atteignables en un clic', () => {
  for (let p = 1; p <= 40; p += 1) {
    const range = paginationRange(p, 40);
    assert.equal(range[0], 1, `page ${p}`);
    assert.equal(range[range.length - 1], 40, `page ${p}`);
  }
});

test('la page courante figure toujours dans la fenêtre', () => {
  for (let p = 1; p <= 40; p += 1) {
    assert.ok(paginationRange(p, 40).includes(p), `page ${p} absente`);
  }
});

test('aucun trou ne cache une seule page (il ne ferait rien gagner)', () => {
  for (let total = 1; total <= 30; total += 1) {
    for (let p = 1; p <= total; p += 1) {
      const range = paginationRange(p, total);
      range.forEach((item, i) => {
        if (item !== GAP) return;
        const before = range[i - 1];
        const after = range[i + 1];
        assert.ok(after - before >= 2, `trou inutile entre ${before} et ${after} (page ${p}/${total})`);
      });
    }
  }
});

test('les numéros restent strictement croissants et sans doublon', () => {
  for (let total = 1; total <= 30; total += 1) {
    for (let p = 1; p <= total; p += 1) {
      const nums = paginationRange(p, total).filter((x) => x !== GAP);
      for (let i = 1; i < nums.length; i += 1) {
        assert.ok(nums[i] > nums[i - 1], `ordre cassé à ${p}/${total}`);
      }
    }
  }
});

test('siblings élargit la fenêtre autour de la page courante', () => {
  assert.deepEqual(paginationRange(10, 30, 2), [1, GAP, 8, 9, 10, 11, 12, GAP, 30]);
});

test('une page hors bornes est ramenée dans l’intervalle', () => {
  assert.deepEqual(paginationRange(0, 15), paginationRange(1, 15));
  assert.deepEqual(paginationRange(99, 15), paginationRange(15, 15));
});
