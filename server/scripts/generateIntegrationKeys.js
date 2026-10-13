// server/scripts/generateIntegrationKeys.js
//
// Creates the signing key pair(s) for the server-to-server access to the Cafe
// POS and the Restaurant (see services/integrationAuthService.js "server key"
// and VerifyBsmsSignature in both Laravel apps):
//
//   node scripts/generateIntegrationKeys.js              both systems
//   node scripts/generateIntegrationKeys.js pos          only the Cafe POS
//   node scripts/generateIntegrationKeys.js restaurant   only the Restaurant
//
// For each system it prints two lines:
//   * the PRIVATE key  -> ONLY the Stock Management server/.env (keep secret)
//   * the PUBLIC key   -> that system's .env (cannot sign; safe if it leaks)
// One key pair per system, so a problem with one never affects the other.
//
// Changing a key without downtime: generate a new pair, ADD the new public key
// to the system's BSMS_INTEGRATION_PUBLIC_KEYS (comma separated, after the old
// one) and run `php artisan config:clear` there, put the new private key in
// server/.env and restart, then remove the old public key.
const crypto = require('crypto');

const SYSTEMS = {
  pos: { label: 'Cafe POS (pos.ravonbakers.lk)', env: 'RAVON_POS_INTEGRATION_PRIVATE_KEY' },
  restaurant: { label: 'Restaurant (restaurant.ravonbakers.lk)', env: 'RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY' }
};

const wanted = process.argv[2] ? [process.argv[2].toLowerCase()] : Object.keys(SYSTEMS);
for (const id of wanted) {
  if (!SYSTEMS[id]) {
    console.error(`Unknown system "${id}" - use pos or restaurant`);
    process.exit(1);
  }
}

for (const id of wanted) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateB64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const publicB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  console.log(`\n=== ${SYSTEMS[id].label} ===`);
  console.log('Stock Management server/.env (SECRET - nowhere else):');
  console.log(`${SYSTEMS[id].env}=${privateB64}`);
  console.log(`${SYSTEMS[id].label.split(' (')[0]} .env (public):`);
  console.log(`BSMS_INTEGRATION_PUBLIC_KEYS=${publicB64}`);
}
console.log('\nThen: php artisan config:clear on the Cafe / Restaurant, and restart the Stock Management server.');
