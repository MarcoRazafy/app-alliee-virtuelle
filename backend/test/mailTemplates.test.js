const test = require('node:test');
const assert = require('node:assert/strict');
const templates = require('../src/services/mailTemplates');

test('accountApproved : sujet + html + texte, avec le nom', () => {
  const mail = templates.accountApproved({ email: 'a@b.com', full_name: 'Jane Doe' });
  assert.match(mail.subject, /approuvé/i);
  assert.match(mail.html, /Jane Doe/);
  assert.match(mail.text, /Jane Doe/);
  assert.match(mail.html, /Se connecter/); // bouton de connexion présent
});

test('accountRejected : inclut le motif quand fourni', () => {
  const mail = templates.accountRejected({ email: 'a@b.com', full_name: 'Jane' }, 'Incomplete profile');
  assert.match(mail.html, /Incomplete profile/);
  assert.match(mail.text, /Incomplete profile/);
});

test('newRegistration : contient le nom et l’email du candidat', () => {
  const mail = templates.newRegistration({ email: 'new@user.com', full_name: 'New User' });
  assert.match(mail.html, /New User/);
  assert.match(mail.html, /new@user\.com/);
  assert.match(mail.subject, /en attente de validation/i);
});

test('échappe le HTML des valeurs dynamiques (anti-injection)', () => {
  const mail = templates.accountRejected(
    { email: 'x@y.com', full_name: 'Ann' },
    '<script>alert(1)</script>'
  );
  assert.ok(!mail.html.includes('<script>'), 'le <script> brut ne doit pas apparaître');
  assert.match(mail.html, /&lt;script&gt;/);
});
