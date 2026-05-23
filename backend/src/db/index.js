const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'binary_db',
  user: process.env.DB_USER || 'binary',
  password: process.env.DB_PASSWORD || 'binary_pass',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => console.error('[DB] Unexpected pool error:', err.message));

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) console.warn(`[DB] Slow query (${duration}ms):`, text.slice(0, 80));
  return result;
}

module.exports = { query, pool };
