# Collection page without POS / Restaurant login: signed requests (2026-10-13)

## What it does

The Collection page (and the FG item list) reads the Cafe POS (`pos.ravonbakers.lk`) and the
Restaurant (`restaurant.ravonbakers.lk`) **without any user logging in to those systems**.

The Stock Management **server** signs every request with a **private key**. Each Laravel app
checks the signature with the matching **public key**:

```
BSMS server                                            Cafe / Restaurant
GET /api/integration/completed-shifts/collection?...
  X-BSMS-Timestamp: 1791…            (now)
  X-BSMS-Nonce:     k3J9…            (random, new every request)
  X-BSMS-Signature: MEUCIQ…          (private-key signature of method + path +
                                      query + timestamp + nonce)
                         ─────────►   checks with the PUBLIC key:
                                        correct signature?            else 401
                                        timestamp within 5 minutes?   else 401
                                        nonce never seen before?      else 401 (replay)
                                        IP allowed (optional)?        else 403
                                      → data (read only)
```

## Why this is safer than a fixed key or password

| Risk | Fixed key in a header | Signed requests (now) |
|---|---|---|
| Someone captures one request | Can reuse the key forever | The request works **once**, for **5 minutes**, for **that URL only** |
| Someone edits the URL (other dates, other data) | Works | Refused: the signature covers the path and query |
| Cafe / Restaurant `.env` leaks | Hash only, still fine | **Public key** only: it can check signatures but cannot make them |
| Changing the key | Short downtime | No downtime: two public keys can be active at once |
| Who used it, when | Unknown | Every request is logged in `storage/logs/laravel.log` (IP, path, allowed / refused) |

The private key itself is **never sent** over the network.

## Files

| App | Files |
|---|---|
| Cafe | `app/Http/Middleware/VerifyBsmsSignature.php`, `bootstrap/app.php` (alias `api.integration`), `routes/api.php` (`integration` group), `config/services.php` (`bsms`), `app/Providers/AppServiceProvider.php` (`TRUSTED_PROXIES`), the 3 collection API controllers (no user = all branches), `.env.example`, `tests/Concerns/SignsBsmsRequests.php`, `tests/Feature/UserApiAbilitiesTest.php` |
| Restaurant | the same middleware, bootstrap, routes, config, provider and test files (`tests/Feature/UserApiTest.php`) |
| BSMS | `server/services/integrationAuthService.js` (signing), `server/scripts/generateIntegrationKeys.js`, `server/controllers/collectionController.js` (status note), `server/.env.example`, `server/tests/integrationServiceKey.test.js` |

## Deploy to the live sites

1. **Generate new key pairs** on the BSMS server. Never reuse the local test keys.
   ```
   cd server
   node scripts/generateIntegrationKeys.js
   ```
   For each system it prints a private-key line and a public-key line.
2. **Cafe server `.env`:** `BSMS_INTEGRATION_PUBLIC_KEYS=<Cafe public key>`.
   - Optional: `BSMS_ALLOWED_IPS=<public IP of the BSMS server>`.
   - Behind Cloudflare or another proxy, also set `TRUSTED_PROXIES` to the proxy's IPs so the IP
     check sees the real address.
   - Deploy, then run `php artisan config:clear`.
3. **Restaurant server `.env`:** the same, with the Restaurant public key.
4. **BSMS `server/.env`:**
   ```
   RAVON_POS_INTEGRATION_PRIVATE_KEY=<Cafe private key>
   RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY=<Restaurant private key>
   ```
   Restart the BSMS server.
5. **Keep all three server clocks correct** (NTP). A clock that is more than 5 minutes off makes
   every request fail with "refused the Stock Management signature … check both server clocks".
   You can change the window with `BSMS_SIGNATURE_MAX_AGE` (seconds).
6. Open the Collection page. Both systems should show **Connected**.

## Changing a key later (no downtime)

1. Run `node scripts/generateIntegrationKeys.js pos` (or `restaurant`).
2. On that system, list both keys, old first: `BSMS_INTEGRATION_PUBLIC_KEYS=<old>,<new>`. Then run
   `php artisan config:clear`.
3. Put the new private key in the BSMS `server/.env` and restart.
4. Remove the old public key from that system, then run `php artisan config:clear` again.

Do this whenever someone who had access to the BSMS `server/.env` leaves, or at least once a year.

## Tests

* BSMS: `node --test tests/integrationServiceKey.test.js`, plus the existing integration tests.
* Cafe: `php artisan test --filter="UserApiAbilitiesTest|SsoTest"`
* Restaurant: `php artisan test --filter="UserApiTest|SsoTest"`
