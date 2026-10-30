const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../src/app');

function directives(res) {
  const csp = res.headers['content-security-policy'] || '';
  return Object.fromEntries(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]) => [name, sources])
  );
}

test('la CSP laisse pdf.js lire le PDF depuis son adresse blob:', async () => {
  const csp = directives(await request(app).get('/api/auth/me'));
  assert.ok(csp['connect-src'].includes('blob:'));
});

test('la CSP laisse lire les vidéos du site et les médias blob:', async () => {
  const csp = directives(await request(app).get('/api/auth/me'));
  assert.ok(csp['media-src'].includes("'self'"));
  assert.ok(csp['media-src'].includes('blob:'));
});

test('la CSP n’ouvre les cadres qu’aux lecteurs vidéo YouTube (nocookie) et Vimeo', async () => {
  const csp = directives(await request(app).get('/api/auth/me'));
  assert.deepEqual(
    [...csp['frame-src']].sort(),
    ["'self'", 'https://player.vimeo.com', 'https://www.youtube-nocookie.com'].sort()
  );
  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
});
