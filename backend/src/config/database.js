const { Pool } = require('pg');
const env = require('./env');

// SSL conditionnel : activé par défaut en production (les Postgres managés — Render, Railway,
// Supabase, DigitalOcean… — l'exigent presque toujours), désactivé sinon (dev local).
// Surchargeable explicitement via DATABASE_SSL = 'true' | 'false' pour les cas particuliers
// (ex. Postgres auto-hébergé sans TLS en prod, ou base managée testée depuis un poste de dev).
const sslOverride = process.env.DATABASE_SSL;
const useSsl = sslOverride !== undefined ? sslOverride === 'true' : env.nodeEnv === 'production';

const pool = new Pool({
  connectionString: env.databaseUrl,
  // rejectUnauthorized:false accepte les certificats des fournisseurs managés dont la CA
  // n'est pas installée localement. Le trafic reste chiffré ; seule la vérif de chaîne est relâchée.
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Erreur inattendue du pool PostgreSQL', err);
});

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  withTransaction,
};
