const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured.');
    }

    pool = new Pool({ connectionString });
  }

  return pool;
}

async function dbQuery(text, values) {
  return getPool().query(text, values);
}

async function dbWithTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureDatabaseSchema() {
  // Create schema if not exists
  await dbQuery('CREATE SCHEMA IF NOT EXISTS "BrainSync";');

  // Create presets table if not exists in BrainSync schema
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS "BrainSync".presets (
      preset_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id INTEGER NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      title TEXT NOT NULL,
      intent TEXT,
      duration INTEGER NOT NULL,
      stats TEXT,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE(user_id, title)
    );
  `);
  
  await dbQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_title ON "BrainSync".presets (user_id, title);
  `);

  // Create insights table if not exists in BrainSync schema
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS "BrainSync".insights (
      insight_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id INTEGER NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      intent TEXT,
      duration INTEGER NOT NULL,
      start_time BIGINT,
      end_time BIGINT,
      completed_at TIMESTAMP DEFAULT now(),
      analytics JSONB
    );
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS insights_user_id_idx ON "BrainSync".insights(user_id);
  `);
}

module.exports = { dbQuery, dbWithTransaction, ensureDatabaseSchema };


