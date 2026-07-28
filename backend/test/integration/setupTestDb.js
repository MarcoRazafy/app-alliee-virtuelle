// Bascule la connexion vers la base de TEST *avant* tout require de l'app.
// À require() EN PREMIER dans chaque fichier de test d'intégration.
// Sécurité : on refuse de tourner si l'URL ne pointe pas explicitement sur une base *_test,
// pour ne JAMAIS toucher la base de développement/production (les tests font des TRUNCATE).
require('dotenv').config();

const base = process.env.DATABASE_URL || '';
const testUrl = base.replace(/\/[^/]*$/, '/alliee_virtuelle_test');

if (!/\/alliee_virtuelle_test$/.test(testUrl)) {
  throw new Error(
    "Impossible de déterminer la base de test (attendu : .../alliee_virtuelle_test). " +
      "Abandon pour ne pas toucher une vraie base."
  );
}

process.env.DATABASE_URL = testUrl;
