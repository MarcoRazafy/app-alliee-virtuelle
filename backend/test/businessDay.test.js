const test = require('node:test');
const assert = require('node:assert/strict');
const businessDay = require('../src/utils/businessDay');

// Le fuseau de l'organisation est Indian/Antananarivo (UTC+3) : les instants sont donc
// écrits avec ce décalage explicite, pour que ces tests ne dépendent pas du fuseau de la
// machine qui les exécute — c'est précisément le piège que ce module corrige.
const AT = (iso) => businessDay.businessDayOf(iso);

test('la coupure par défaut est à 2 h du matin', () => {
  assert.equal(businessDay.CUTOFF_HOUR, 2);
});

test('un poste de nuit terminé à 1 h compte sur la journée de la veille', () => {
  assert.equal(AT('2026-09-08T01:00:00+03:00'), '2026-09-07');
  assert.equal(AT('2026-09-08T01:59:59+03:00'), '2026-09-07');
});

test('à 2 h pile, la journée suivante commence', () => {
  assert.equal(AT('2026-09-08T02:00:00+03:00'), '2026-09-08');
});

test('minuit passé reste rattaché à la journée de la veille', () => {
  assert.equal(AT('2026-09-08T00:01:00+03:00'), '2026-09-07');
});

test('une heure ordinaire donne la date du jour', () => {
  assert.equal(AT('2026-09-08T14:30:00+03:00'), '2026-09-08');
  assert.equal(AT('2026-09-07T23:30:00+03:00'), '2026-09-07');
});

test('le même instant donne le même jour, quel que soit le fuseau où il est écrit', () => {
  // 01:00 à Antananarivo = 22:00 UTC la veille : deux écritures du même instant.
  assert.equal(AT('2026-09-08T01:00:00+03:00'), AT('2026-09-07T22:00:00Z'));
});

test('les changements de mois et d’année sont corrects', () => {
  assert.equal(AT('2026-09-01T01:30:00+03:00'), '2026-08-31');
  assert.equal(AT('2026-01-01T01:00:00+03:00'), '2025-12-31');
});

test('une date invalide renvoie null plutôt que de propager NaN', () => {
  assert.equal(AT('pas une date'), null);
});

test('businessDayNow et businessDayShifted respectent le format attendu', () => {
  assert.match(businessDay.businessDayNow(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(businessDay.businessDayShifted(-30), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(businessDay.businessDayShifted(-1) < businessDay.businessDayNow());
});

test('l’expression SQL cible bien le fuseau de l’organisation et la coupure', () => {
  const sql = businessDay.sqlBusinessDay('start_time');
  assert.match(sql, /AT TIME ZONE 'Indian\/Antananarivo'/);
  assert.match(sql, /interval '2 hours'/);
  assert.match(sql, /::date$/);
});

// --- Répartition d'une connexion sur les journées de travail ------------------------
const SPLIT = businessDay.splitSecondsByBusinessDay;

test('une journée ordinaire tombe entièrement sur son jour', () => {
  assert.deepEqual(SPLIT('2026-09-07T09:00:00+03:00', '2026-09-07T17:00:00+03:00'), {
    '2026-09-07': 8 * 3600,
  });
});

test('un poste de nuit de 22 h à 1 h compte en entier sur la veille', () => {
  assert.deepEqual(SPLIT('2026-09-07T22:00:00+03:00', '2026-09-08T01:00:00+03:00'), {
    '2026-09-07': 3 * 3600,
  });
});

test('une connexion qui franchit 2 h du matin se partage sur les deux journées', () => {
  assert.deepEqual(SPLIT('2026-09-07T22:00:00+03:00', '2026-09-08T03:00:00+03:00'), {
    '2026-09-07': 4 * 3600,
    '2026-09-08': 1 * 3600,
  });
});

test('une connexion de plusieurs jours remplit chaque journée intermédiaire', () => {
  const parts = SPLIT('2026-09-07T09:00:00+03:00', '2026-09-09T09:00:00+03:00');
  assert.equal(parts['2026-09-08'], 24 * 3600);
  assert.equal(Object.values(parts).reduce((a, b) => a + b, 0), 48 * 3600);
});

test('une période vide ou inversée ne produit aucune journée', () => {
  assert.deepEqual(SPLIT('2026-09-07T10:00:00+03:00', '2026-09-07T10:00:00+03:00'), {});
  assert.deepEqual(SPLIT('2026-09-07T10:00:00+03:00', '2026-09-07T09:00:00+03:00'), {});
  assert.deepEqual(SPLIT('pas une date', '2026-09-07T09:00:00+03:00'), {});
});

test('le total réparti égale toujours la durée réelle de la connexion', () => {
  const parts = SPLIT('2026-09-07T23:12:00+03:00', '2026-09-08T06:47:00+03:00');
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  assert.equal(total, (7 * 60 + 35) * 60);
});

test('les deux variantes SQL traitent différemment les colonnes avec et sans fuseau', () => {
  // TIMESTAMPTZ : on convertit d'abord vers l'heure de l'organisation.
  const tz = businessDay.sqlBusinessDay('login_at');
  assert.match(tz, /AT TIME ZONE 'Indian\/Antananarivo'/);

  // TIMESTAMP sans fuseau : la valeur EST déjà une heure locale. Y appliquer AT TIME ZONE
  // ferait dépendre le résultat du fuseau de la session PostgreSQL — différent en local
  // et sur Railway, où une entrée de 4 h du matin basculait sur la veille.
  const naive = businessDay.sqlBusinessDayNaive('start_time');
  assert.doesNotMatch(naive, /AT TIME ZONE/);
  assert.match(naive, /interval '2 hours'/);
  assert.match(naive, /::date/);
});
