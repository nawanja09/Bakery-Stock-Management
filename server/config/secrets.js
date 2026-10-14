// server/config/secrets.js
//
// Single place that reads the signing / encryption secrets.
//
//  * JWT_SECRET          - signs BSMS login tokens (HS256 only).
//  * POS_SESSION_SECRET  - AES-256-GCM key material for the stored RAVON POS /
//                          Restaurant sessions (services/posSessionStore.js).
//                          MUST differ from JWT_SECRET: a leaked login secret
//                          must not also decrypt the integration tokens.
//
// assertProductionSecrets() is called once at server start (server.js) and
// refuses to boot with a missing, short or shared secret. The getters only
// require a non-empty value, so unit tests can keep using short test secrets.
//
// Generate a value with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

const MIN_SECRET_BYTES = 32;

// Every jwt.sign / jwt.verify must use these, so a token signed with another
// algorithm (e.g. "none" or RS256 confusion) is never accepted.
// issuer / audience bind a token to THIS API: a token signed with the same
// secret for another purpose (or another app sharing it) is refused.
// 12h = one working day; the client does not refresh, so users log in daily.
const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'bsms';
const JWT_AUDIENCE = 'bsms-web';
const JWT_VERIFY_OPTIONS = Object.freeze({ algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
const JWT_SIGN_OPTIONS = Object.freeze({ algorithm: JWT_ALGORITHM, expiresIn: '12h', issuer: JWT_ISSUER, audience: JWT_AUDIENCE });

const read = (name) => {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};

const getJwtSecret = () => {
  const value = read('JWT_SECRET');
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
};

/** POS session key material, or null when not configured (sessions are then kept in memory only). */
const getPosSessionSecret = () => read('POS_SESSION_SECRET');

/** Throws when a secret is missing, shorter than MIN_SECRET_BYTES, or JWT/POS secrets are equal. */
const assertProductionSecrets = () => {
  const problems = [];
  for (const name of ['JWT_SECRET', 'POS_SESSION_SECRET']) {
    const value = read(name);
    if (!value) problems.push(`${name} is not set`);
    else if (Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES) {
      problems.push(`${name} must be at least ${MIN_SECRET_BYTES} bytes`);
    }
  }
  if (read('JWT_SECRET') && read('JWT_SECRET') === read('POS_SESSION_SECRET')) {
    problems.push('POS_SESSION_SECRET must be different from JWT_SECRET');
  }
  if (problems.length) {
    throw new Error(`Refusing to start - insecure secrets: ${problems.join('; ')}. `
      + 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"');
  }
};

module.exports = {
  MIN_SECRET_BYTES,
  JWT_ALGORITHM,
  JWT_SIGN_OPTIONS,
  JWT_VERIFY_OPTIONS,
  getJwtSecret,
  getPosSessionSecret,
  assertProductionSecrets
};
