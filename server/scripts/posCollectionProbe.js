// server/scripts/posCollectionProbe.js
//
// Read-only probe of the RAVON POS and RAVON Restaurant Collection APIs, used to
// confirm the field mapping in services/collectionMapper.js. No credentials are
// read from .env (there are none) and none are stored or printed.
//
//   cd server
//   node scripts/posCollectionProbe.js                    # = --unauth all
//   node scripts/posCollectionProbe.js --unauth restaurant
//       WITHOUT credentials: POST /api/login with an empty body (shows the
//       required field names and the 422 error shape; counts against the
//       5-logins-per-minute limit, so it is sent once) and GET the three
//       endpoints + /api/me (expected: 401 "Unauthenticated.").
//   node scripts/posCollectionProbe.js --login restaurant [--all]
//       Prompts for a username and password (input hidden), logs in ONCE,
//       prints the SHAPE of the login response (types only - never the token),
//       then GETs /api/me and each endpoint once and shows what the mapper makes
//       of every record (--all: every record, not only the first). Nothing is
//       written to the database; the token is dropped when the script ends.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

process.env.POS_SESSION_PERSIST = '0'; // never store the probe's token
const readline = require('readline');
const integrationAuth = require('../services/integrationAuthService');
const { SYSTEMS, SOURCES, mapSystemRecord, extractRecords } = require('../services/collectionMapper');

const SOURCE_PATHS = {
  [SOURCES.SHIFT]: '/api/completed-shifts/collection',
  [SOURCES.CREDIT_PAYMENT]: '/api/credit-payments/collection',
  [SOURCES.EMPLOYEE_DEDUCTION]: '/api/employee-deductions'
};
const OVERRIDES = {
  pos: ['RAVON_POS_SHIFT_COLLECTION_URL', 'RAVON_POS_CREDIT_PAYMENTS_URL', 'RAVON_POS_EMPLOYEE_DEDUCTIONS_URL'],
  restaurant: ['RAVON_RESTAURANT_SHIFT_COLLECTION_URL', 'RAVON_RESTAURANT_CREDIT_PAYMENTS_URL', 'RAVON_RESTAURANT_EMPLOYEE_DEDUCTIONS_URL']
};
// Same endpoint resolution as collectionSyncService, without loading the DB pool.
const endpointsOf = (P) => {
  const base = (process.env[P.urlEnv[0]] || '').replace(/\/+$/, '');
  return Object.fromEntries(Object.values(SOURCES).map((source, i) => [
    source, process.env[OVERRIDES[P.id][i]] || (base ? `${base}${SOURCE_PATHS[source]}` : '')
  ]));
};

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const loginIndex = args.indexOf('--login');
const unauthIndex = args.indexOf('--unauth');

const shape = (value, depth = 0) => {
  if (Array.isArray(value)) return depth > 1 ? `array(${value.length})` : [value.length ? shape(value[0], depth + 1) : 'empty array'];
  if (value && typeof value === 'object') {
    if (depth > 2) return 'object';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  return value === null ? 'null' : typeof value;
};

const interesting = (headers) => Object.fromEntries([...headers].filter(([k]) => /ratelimit|retry-after|content-type/i.test(k)));

const call = async (method, url, { body, token } = {}) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { method, headers, body });
  let payload = null;
  const text = await response.text();
  try { payload = JSON.parse(text); } catch (e) { payload = text.slice(0, 200); }
  return { status: response.status, headers: interesting(response.headers), payload };
};

const unauthProbe = async (P) => {
  const base = (process.env[P.urlEnv[0]] || '').replace(/\/+$/, '');
  console.log(`\n##### ${P.label} (${base || `${P.urlEnv[0]} not set`}) - no credentials`);
  if (!base) return;
  const login = await call('POST', `${base}/api/login`, { body: '{}' });
  console.log(`POST /api/login {} -> ${login.status}`, JSON.stringify(login.headers));
  console.log('  body:', JSON.stringify(login.payload));
  for (const url of [...Object.values(endpointsOf(P)), `${base}/api/me`]) {
    const r = await call('GET', url);
    console.log(`GET ${url.replace(base, '')} -> ${r.status}`, JSON.stringify(r.payload));
  }
};

const ask = (question, hidden = false) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // eslint-disable-next-line no-underscore-dangle
    rl._writeToOutput = (text) => { if (text.includes(question)) rl.output.write(question); };
  }
  rl.question(question, (answer) => {
    rl.close();
    if (hidden) process.stdout.write('\n');
    resolve(answer);
  });
});

const loginProbe = async (P) => {
  const base = (process.env[P.urlEnv[0]] || '').replace(/\/+$/, '');
  if (!base) { console.log(`${P.urlEnv[0]} is not set`); return; }
  const username = (await ask(`${P.label} username: `)).trim();
  let password = await ask(`${P.label} password (hidden, not stored): `, true);
  const login = await call('POST', `${base}${process.env[P.loginEnv] || '/api/login'}`, { body: JSON.stringify({ username, password }) });
  password = null;
  console.log(`\nPOST /api/login -> ${login.status}`, JSON.stringify(login.headers));
  console.log('Login response SHAPE (types only):', JSON.stringify(shape(login.payload), null, 2));
  const token = integrationAuth.extractToken(login.payload);
  if (login.status !== 200 || !token) {
    console.log(login.status === 200 ? '!! No token found - extend extractToken()' : `!! Login refused: ${integrationAuth.scrub(JSON.stringify(login.payload)).slice(0, 300)}`);
    return;
  }
  const expiry = integrationAuth.extractExpiry(login.payload);
  console.log(`Token found (${token.length} chars, not shown); expiry ${expiry ? new Date(expiry).toISOString() : 'not stated by the login response'}`);

  const me = await call('GET', `${base}/api/me`, { token });
  console.log(`\nGET /api/me -> ${me.status}  shape:`, JSON.stringify(shape(me.payload)));
  const user = me.payload && (me.payload.user || me.payload.data || me.payload);
  if (user && typeof user === 'object') console.log(`  branch_ids: ${JSON.stringify(user.branch_ids ?? null)}`);

  const system = P.system === 'RESTAURANT' ? SYSTEMS.RESTAURANT : SYSTEMS.POS;
  for (const [source, url] of Object.entries(endpointsOf(P))) {
    console.log(`\n=== ${source}  GET ${url}`);
    const r = await call('GET', `${url}${url.includes('?') ? '&' : '?'}per_page=50${source === SOURCES.EMPLOYEE_DEDUCTION ? '&status=all' : ''}`, { token });
    console.log(`status ${r.status}`);
    const records = extractRecords(r.payload);
    console.log('Envelope shape:', JSON.stringify(shape(r.payload), null, 2));
    if (!records) { console.log('!! No record list found in the response'); continue; }
    console.log(`Records: ${records.length}`);
    if (records[0]) console.log('First record (raw):', JSON.stringify(records[0], null, 2));
    const results = records.map((rec) => mapSystemRecord(system, source, rec));
    console.log(`Mapped OK: ${results.filter((x) => x.ok).length} / ${records.length}`);
    results.forEach((x, i) => {
      if (!showAll && i > 0 && x.ok) return;
      if (x.ok) {
        const { raw_payload: _omit, ...rest } = x.record;
        console.log(`#${i} ->`, JSON.stringify(rest));
      } else {
        console.log(`#${i} !! ${x.reason}${x.fields ? `  fields: ${x.fields.join(', ')}` : ''}`);
      }
    });
  }
};

(async () => {
  try {
    if (loginIndex >= 0) {
      await loginProbe(integrationAuth.providerOf(args[loginIndex + 1] || 'pos'));
    } else {
      const which = unauthIndex >= 0 && args[unauthIndex + 1] && !args[unauthIndex + 1].startsWith('--') ? args[unauthIndex + 1] : 'all';
      const providers = which === 'all' ? integrationAuth.PROVIDER_IDS : [which];
      for (const id of providers) await unauthProbe(integrationAuth.providerOf(id));
    }
  } catch (error) {
    console.log(`!! ${error.name}: ${integrationAuth.scrub(error.message)}`);
  }
  process.exit(0);
})();
