import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatDurationShort, formatBytes } from './formatters.js';

test('formatClock : toujours HH:MM:SS avec zéros de tête', () => {
  assert.equal(formatClock(0), '00:00:00');
  assert.equal(formatClock(59), '00:00:59');
  assert.equal(formatClock(3600), '01:00:00');
  assert.equal(formatClock(3661), '01:01:01');
});

test('formatDurationShort : format court lisible', () => {
  assert.equal(formatDurationShort(0), '0min');
  assert.equal(formatDurationShort(90), '1min'); // 1 min 30 s tronqué à la minute
  assert.equal(formatDurationShort(3600), '1h 00min');
  assert.equal(formatDurationShort(7320), '2h 02min');
});

test('formatBytes : bytes / KB / MB', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(1572864), '1.5 MB'); // 1.5 × 1024 × 1024
});
