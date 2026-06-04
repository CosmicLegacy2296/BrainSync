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
    // Table already exists in production, no need to create
    return;
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
    const email = `${username}@brainsync.local`;
    const result = await dbQuery(
      `INSERT INTO accounts (username, email, password_hash, display_name, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING username, email`,
      [username, email, password_hash, username, 'user', true]
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
    `SELECT username, email, password_hash
     FROM accounts
     WHERE LOWER(username) = $1
     LIMIT 1`,
    [sanitized.username.toLowerCase()]
  );

  const account = result.rows[0];

  if (!account) {
    throw new AuthInputError('Invalid username or password.');
  }

  const validPassword = await verifyPasswordAsync(sanitized.password, account.password_hash);

  if (!validPassword) {
    throw new AuthInputError('Invalid username or password.');
  }

  const { password_hash: _, ...publicAccount } = account;
  return publicAccount;
}

module.exports = {
  AuthInputError,
  AuthConflictError,
  createAccount,
  loginWithPassword,
};
