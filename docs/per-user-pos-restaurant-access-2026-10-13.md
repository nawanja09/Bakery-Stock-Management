# Per-user POS / Restaurant access for Collection and FG Production (2026-10-13)

## Goal

When a user logs in to Stock Management (BSMS), BSMS confirms who they are and what they may see
in the Cafe POS (`pos.ravonbakers.lk`) and the Restaurant (`restaurant.ravonbakers.lk`).
The **Collection** page and the **FG Production item list** then show only what that user is
allowed. Being logged in grants nothing by itself, and no shared key or shared account is used.

## How it works

1. **Login.** A user whose BSMS role has the Collection or FG Production page signs in to BSMS.
   Today that is Store Keeper, Accountant, QB, Admin and Super Admin. BSMS sends the same typed
   username and password once to `POST /api/login` on each system. Each system checks the
   password, account status and roles, then returns a token for **that user** plus their
   `abilities`. BSMS keeps only the token (AES-256-GCM encrypted, server side) and the abilities.
   The password is discarded and never stored.
2. **Abilities** come from each system's own permission rules, so nothing new has to be set up:

   | Ability | Cafe POS (existing Gate) | Restaurant (existing role rule) | BSMS feature |
   |---|---|---|---|
   | `collection.shifts` | `view-shift-complete` | `admin\|superadmin` | Collection: shift collections |
   | `collection.credit_payments` | `record-credit-payment` | `cashier\|admin\|superadmin` | Collection: credit payments |
   | `collection.employee_deductions` | `manage-salary-deductions` | `admin\|superadmin` | Collection: employee deductions |
   | `items.view` | every API user (items are visible to all) | n/a | FG item list, choosing an FG item |

   Each system also **enforces** them on every API route (`api.ability:*`), so a token can never
   read more than its user's permissions allow. Cafe accounts restricted to certain branches
   (Admin H / Admin D) also get only their branches.
3. **In BSMS**, every request needs both:
   * the BSMS role permission, as before (for example QB is still view-only), and
   * the user's own abilities, which `services/integrationAccess.js` turns into a SQL filter.

   That filter applies to lists, filter options, single records, sync, and approve / reject /
   restore. If the user may see nothing, the request is refused with `403 INTEGRATION_ACCESS_DENIED`.
   For the FG item list, a missing `items.view` gives 403 `POS_FORBIDDEN`, and no session gives
   409 `POS_NOT_CONNECTED`.
4. **Freshness.** BSMS re-reads `/api/me` at least every 5 minutes, so permissions removed in the
   Cafe or Restaurant take effect quickly, and the systems check on every call anyway. BSMS
   **fails closed**: no session, a rejected token, an API that does not report abilities, or
   `/api/me` unreachable for more than 30 minutes all mean no access.
5. **No sharing.** A user's token is only ever used for that user's own requests. The old shared
   "Finance session" and the integration client key (`/api/integration/token`) were removed.

A user is connected only when their BSMS username and password are the same as their Cafe /
Restaurant account (the Collection page has no separate Connect popup).

## API

| BSMS endpoint | Purpose |
|---|---|
| `GET /api/integrations/access` | What the signed-in user may use (booleans and lists only, no secrets). The UI uses it to hide the Collection menu or the "New FG Production Item" button. |
| `GET /api/collections/integrations/status` | Connection status plus `access`. |

## Login rate limits

Every BSMS user logs in from the BSMS server's single IP. So both Laravel apps now limit
`/api/login` per **account** (5 per minute per username + IP) plus 60 per minute per IP, instead
of 5 per minute per IP. BSMS caps its own login requests at `RAVON_LOGIN_MAX_PER_MINUTE`
(default 30) per system. A 429 pauses only that account.

## Deploy

1. Deploy the `bsms-integration-auth` branch of both Laravel apps. Run `php artisan migrate`;
   the Restaurant gets a new `api_tokens` table. Then run `php artisan config:clear`.
2. Restart the BSMS server and deploy the client.
3. Each user needs an account with the **same username and password** in the Cafe / Restaurant,
   with the permissions they should have, and must log in to BSMS again after deploy.

## Tests

* BSMS:
  ```
  node --test tests/integrationAccess.test.js tests/collectionIntegration.test.js tests/collections.test.js tests/posFinanceAutoLogin.test.js
  ```
* Cafe: `php artisan test --filter="UserApiAbilitiesTest|SsoTest"`
* Restaurant: `php artisan test --filter="UserApiTest|SsoTest"`
