const { dbQuery } = require('./db');
const { hashPassword, verifyPasswordAsync } = require('./password');

class AuthInputError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

class AuthConflictError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

let schemaReadyPromise = null;

async function ensureAuthSchema() {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const result = await dbQuery(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'users'
      );`
    );

    if (!result.rows[0].exists) {
      await dbQuery(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
  })();

  return schemaReadyPromise;
}

function normalizeUsername(username) {
  return username.trim();
}

function validateUsername(username) {
  return username.length >= 3;
}

function sanitizeLoginInput(input) {
  const username = normalizeUsername(input.username ?? '');
  const password = input.password ?? '';

  if (!username || !password) {
    throw new AuthInputError('Username and password are required.');
  }

  return { username, password };
}

async function createAccount(input) {
  await ensureAuthSchema();

  const username = normalizeUsername(input.username ?? '');
  const password = input.password ?? '';

  if (!username || !password) {
    throw new AuthInputError('Username and password are required.');
  }

  if (!validateUsername(username)) {
    throw new AuthInputError('Username must be at least 3 characters.');
  }

  const password_hash = hashPassword(password);

  try {
    const result = await dbQuery(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING name, email`,
      [username, username, password_hash]
    );

    return result.rows[0];
  } catch (error) {
    const pgCode = error.code;
    if (pgCode === '23505') {
      throw new AuthConflictError('Username already exists.');
    }

    throw error;
  }
}

async function loginWithPassword(input) {
  await ensureAuthSchema();

  const sanitized = sanitizeLoginInput(input);

  const result = await dbQuery(
    `SELECT name, email, password
     FROM users
     WHERE LOWER(name) = $1
     LIMIT 1`,
    [sanitized.username.toLowerCase()]
  );

  const account = result.rows[0];

  if (!account) {
    throw new AuthInputError('Invalid username or password.');
  }

  const validPassword = await verifyPasswordAsync(sanitized.password, account.password);

  if (!validPassword) {
    throw new AuthInputError('Invalid username or password.');
  }

  const { password: _, ...publicAccount } = account;
  return publicAccount;
}

module.exports = {
  AuthInputError,
  AuthConflictError,
  createAccount,
  loginWithPassword,
};
