// server/scripts/createUser.js
//
// Creates a login, or sets a new password for an existing one. The password is
// typed at a hidden prompt (twice) - it is never written in code, arguments,
// shell history or logs. Replaces the accounts config/db.js used to create
// with passwords written in the source.
//
//   cd server
//   node scripts/createUser.js --username accountant1 --name "Accountant 1" --role Accountant
//   node scripts/createUser.js --username finance --reset-password
//
// Roles: Admin, Super Admin, Accountant, Finance, Store Keeper, View Only.
// Password rules (same as Change Password): at least 8 characters, at most 72
// bytes, not the username. A reset signs the user out everywhere (token_version).
// Without a terminal (e.g. automation) the password is read from BSMS_NEW_PASSWORD.
const path = require('path');
const readline = require('readline');

const ROLES = Object.freeze(['Admin', 'Super Admin', 'Accountant', 'Finance', 'Store Keeper', 'View Only']);
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;
const BCRYPT_COST = 12;

/** Problem with a new password, or null when it is acceptable. */
const passwordProblem = (password, username) => {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `The password must be at least ${PASSWORD_MIN} characters`;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return `The password is too long (at most ${PASSWORD_MAX_BYTES} bytes)`;
  if (username && password.trim().toLowerCase() === String(username).trim().toLowerCase()) return 'The password must not be the username';
  return null;
};

/** --username x --name "y" --role Admin --reset-password  ->  { username, name, role, reset } */
const parseArgs = (argv) => {
  const out = { reset: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reset-password') out.reset = true;
    else if (['--username', '--name', '--role'].includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      out[arg.slice(2)] = value.trim();
      i += 1;
    } else if (arg === '--password' || arg.startsWith('--password=')) {
      throw new Error('Never pass a password as an argument (it stays in shell history) - you will be asked for it');
    } else {
      throw new Error(`Unknown argument "${arg}"`);
    }
  }
  if (!out.username) throw new Error('--username is required');
  if (!/^[A-Za-z0-9 ._@-]{2,100}$/.test(out.username)) throw new Error('--username: 2-100 letters, digits, spaces or . _ @ -');
  if (!out.reset) {
    if (!out.role || !ROLES.includes(out.role)) throw new Error(`--role must be one of: ${ROLES.join(', ')}`);
    out.name = out.name || out.username;
  }
  return out;
};

/**
 * Creates the user, or (reset) replaces its password and revokes its tokens.
 * `db` = a mysql2/promise connection. Returns a one-line summary (no secrets).
 */
const createOrReset = async (db, { username, name, role, reset }, password, { hash }) => {
  const problem = passwordProblem(password, username);
  if (problem) throw new Error(problem);
  const [existing] = await db.query('SELECT id, role FROM users WHERE username = ?', [username]);
  const hashed = await hash(password, BCRYPT_COST);
  if (reset) {
    if (!existing.length) throw new Error(`No user "${username}"`);
    await db.query('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hashed, existing[0].id]);
    return `Password changed for "${username}" (${existing[0].role}); all of its sessions were signed out.`;
  }
  if (existing.length) throw new Error(`User "${username}" already exists - use --reset-password to change its password`);
  await db.query('INSERT INTO users (name, username, password, role, status) VALUES (?, ?, ?, ?, 1)', [name, username, hashed, role]);
  return `Created "${username}" (${role}).`;
};

// Hidden prompt: the characters typed are not echoed.
const askHidden = (question) => new Promise((resolve, reject) => {
  if (!process.stdin.isTTY) {
    reject(new Error('No terminal to type the password in - set BSMS_NEW_PASSWORD for this one command instead'));
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let prompting = true;
  rl._writeToOutput = (text) => { if (prompting) rl.output.write(text); };
  rl.question(question, (answer) => {
    rl.output.write('\n');
    rl.close();
    resolve(answer);
  });
  prompting = false;
});

const readPassword = async (username) => {
  if (process.env.BSMS_NEW_PASSWORD) return process.env.BSMS_NEW_PASSWORD;
  const first = await askHidden(`New password for "${username}": `);
  const problem = passwordProblem(first, username);
  if (problem) throw new Error(problem);
  const second = await askHidden('Type it again: ');
  if (first !== second) throw new Error('The two passwords do not match');
  return first;
};

const main = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const mysql = require('mysql2/promise');
  const bcrypt = require('bcrypt');
  const options = parseArgs(process.argv.slice(2));
  const password = await readPassword(options.username);
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME
  });
  try {
    console.log(await createOrReset(db, options, password, { hash: bcrypt.hash }));
  } finally {
    await db.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`createUser: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { ROLES, PASSWORD_MIN, passwordProblem, parseArgs, createOrReset, askHidden };
