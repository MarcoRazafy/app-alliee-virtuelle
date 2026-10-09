const { Pool } = require('pg');
const env = require('./env');

const sslOverride = process.env.DATABASE_SSL;
const useSsl = sslOverride !== undefined ? sslOverride === 'true' : env.nodeEnv === 'production';

const pool = new Pool({
  connectionString: env.databaseUrl,
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
