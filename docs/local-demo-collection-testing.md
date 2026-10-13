# Local demo: test the Collection page with dummy Cafe + Restaurant data

LOCAL TESTING ONLY. These are demo values on the local databases; never use them on the live sites.

## Demo login (the same in all three systems)

| System | URL | Username | Password | Role |
|---|---|---|---|---|
| Stock Management | your client app (API `http://localhost:5000`) | `demo.finance` | `Demo-bbbf5de31c` | Accountant (has the Collection page) |
| Cafe POS | http://127.0.0.1:8081 | `demo.finance` | `Demo-bbbf5de31c` | director |
| Restaurant | http://127.0.0.1:8082 | `demo.finance` | `Demo-bbbf5de31c` | superadmin + admin |

The Cafe / Restaurant logins are only for comparing with their own *Shift Management → Complete*,
*Credit Payments* and *Salary Deductions* pages. The Stock Management Collection page does
**not** need them. It reads both systems with signed server requests.

## Demo data (last 10 days, dates refreshed on every seed run)

| | Cafe (`ravon_pos28.09.2026`) | Restaurant (`restaurant_30.09.2026`) |
|---|---|---|
| Completed shifts | 9: `D001`–`D009`, branches *Cafe - M*, *MASKreeda*, *MASActive* → BSMS departments Cafe, MAS Kreeda, MAS Intimo | 9: `RD001`–`RD009` → Restaurant |
| Sales in those shifts | cash, card, online and credit sales (`DEMO-001-01` …) | paid orders with payments (`DEMO-R0001` …) |
| Credit payments | 3: `DEMO-CP-001…003` (Cash / Card / Bank Transfer), each settling a credit sale | 3: `DEMO-RCP-001…003` |
| Salary deductions | 3 cash shorts linked to shifts + 1 manual | 3 cash shorts linked to shifts + 1 manual |
| Items (FG item list) | Fish Bun, Chicken Roll, Chocolate Cake Slice, Iced Coffee | — |

Re-create the data, for example to move the dates to the last 10 days again:

```
cd E:\Github\Revon-Cafe_New_Project && php artisan db:seed --class=BsmsCollectionDemoSeeder
cd E:\Github\Ravon-Restaurant-New && php artisan db:seed --class=BsmsCollectionDemoSeeder
cd E:\Github\Bakery-Stock-Management\server && node scripts/seedDemoCollectionUser.js
```

The seeders only touch their own marked rows (`DEMO-…`, "BSMS demo data").
- **Fixed IDs from 900001 up:** every demo record keeps the same ID on every run. Running the
  seeder again therefore *updates* the rows in Stock Management instead of adding duplicates.
- **No clash with live data:** the IDs can never match real Cafe / Restaurant data that was
  imported into Stock Management earlier.
- **Safety check:** the seeders refuse to run unless `APP_ENV=local` and the database is on this
  machine.

## Running it

1. Start the Cafe and the Restaurant (two terminals):
   ```
   cd E:\Github\Revon-Cafe_New_Project && php artisan serve --host=127.0.0.1 --port=8081
   cd E:\Github\Ravon-Restaurant-New && php artisan serve --host=127.0.0.1 --port=8082
   ```
   The Restaurant has no built CSS/JS (`public/build`). To use its web pages, also run `npm run dev`
   there. The API does not need it.
2. **Restart** the Stock Management server so it reads the new `server/.env` (with nodemon, type `rs`).
3. Log in to Stock Management as `demo.finance` and open **Collection**.
   - Both badges should say **Connected**.
   - Pick a From/To range that covers the last 10 days and refresh.
   - The demo rows are the references `D001…`, `RD001…`, `DEMO-CP-…` and `DEMO-RCP-…`.
   - The Pending list also still holds rows imported earlier from the live sites.

## What was changed for this

* **Stock Management `server/.env`:**
  - `RAVON_POS_API_URL=http://127.0.0.1:8081` and `RAVON_RESTAURANT_API_URL=http://127.0.0.1:8082`.
  - Two local **private** signing keys (`RAVON_*_INTEGRATION_PRIVATE_KEY`).
  - The unused old `RAVON_*_CLIENT_ID/SECRET` lines were removed.
  - The previous file is saved as `server/.env.backup-before-local-demo` (git-ignored).
    **To go back to the live sites**, restore that backup and restart. That backup still contains
    the old client secrets; delete those lines from it.
* **Cafe and Restaurant `.env`:** `BSMS_INTEGRATION_PUBLIC_KEYS` holds the matching **public** keys
  (safe to share).
* **Stock Management pending rows:** demo rows of earlier runs were removed, together with 7 pending
  POS rows from the live site (credit payments 7–9 and deductions 9–12) that an earlier demo run
  had overwritten. They come back correctly the next time you sync against the live sites.
* **Live sites:** they need their own **new** key pairs. See
  `server-key-pos-restaurant-access-2026-10-13.md`.
