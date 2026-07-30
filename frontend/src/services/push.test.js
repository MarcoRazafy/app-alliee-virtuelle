import test from 'node:test';
import assert from 'node:assert/strict';
import { PUSH_API_PATHS } from './pushPaths.js';

test('les routes push passent toutes par le proxy /api', () => {
  assert.deepEqual(PUSH_API_PATHS, {
    publicKey: '/api/push/public-key',
    subscribe: '/api/push/subscribe',
    unsubscribe: '/api/push/unsubscribe',
  });
});
