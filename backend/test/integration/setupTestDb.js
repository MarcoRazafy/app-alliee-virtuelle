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
