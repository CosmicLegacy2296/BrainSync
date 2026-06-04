const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;

  const [salt, originalHash] = storedHash.split(':');
  const attemptedHash = crypto.scryptSync(password, salt, 64).toString('hex');

  return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(attemptedHash, 'hex'));
}

async function verifyPasswordAsync(password, storedHash) {
  return verifyPassword(password, storedHash);
}

module.exports = { hashPassword, verifyPassword, verifyPasswordAsync };
