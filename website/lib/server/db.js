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
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS public.accounts (
      id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  await dbQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower_idx
    ON public.accounts (LOWER(username));
  `);

  await dbQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower_idx
    ON public.accounts (LOWER(email));
  `);

  await dbQuery('CREATE SCHEMA IF NOT EXISTS "BrainSync";');

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

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS presets_user_id_idx ON "BrainSync".presets(user_id);
  `);
}

module.exports = { dbQuery, dbWithTransaction, ensureDatabaseSchema };
