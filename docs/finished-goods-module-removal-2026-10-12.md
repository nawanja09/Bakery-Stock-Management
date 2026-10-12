# Finished Goods module removal (2026-10-12)

Branch `feat/remove-finished-goods-module`. Pre-change code is tagged `pre-fg-module-removal`.

The standalone **Finished Goods** module was removed. **FG Production**
(`/fg-production`, sidebar "FG Production" with Recipes and FG Recipes Reports, page title
"Finished Goods Production") is kept unchanged. The Cost Calculator was removed with the module,
because it was gated by the Finished Goods permission and read Finished Goods items.

## Backups (taken before any change)

Stored outside the repo in `E:\Github\BSMS-backups\`:

| File | Content |
|---|---|
| `ravonbakers_stock-pre-fg-removal-20261012.sql` | full `mysqldump --single-transaction --routines --triggers --events` of `ravonbakers_stock` |
| `repo-pre-fg-removal-20261012.bundle` | `git bundle --all` (every branch and tag) |
| `source-pre-fg-removal-20261012.zip` | `git archive` of HEAD `a48790c` |

## Removed code

**Client**
- `client/src/components/FinishedGoods/**`: Items, Opening Balances, Production Management, Transfers,
  Wastage, Production Wastage, Sales, Reports (item-wise stock, stock summary, production, wastage, transfer,
  bakery stock). 38 files.
- `client/src/components/CostCalculator/**`: CalculateCost, SavedCosting, CSS. 3 files.
- `App.js`: all `finished-goods/*` and `cost-calculator/*` routes and their imports.
- `NavigationBar.jsx`: the Finished Goods sidebar module and its submenus, its active-route detection, and the now-unused `faList` icon.
- `Dashboard.jsx`: the "Production runs — 7 days" card, the "New Production" and "New Transfer" quick actions,
  and FG wastage in the wastage count.
- `config/rolePermissions.js`: the `finishedGoods` module, `/finished-goods` and `/cost-calculator` route rules, and the `finished` nav entry.

**Server**
- Routes: `finishedGoodsItems`, `finishedGoodsOpeningBalance`, `productions`, `finishedGoodsTransfers`,
  `finishedGoodsWastage`, `finishedGoodsReports`, `finishedGoodsStockReport`, `finishedGoodsIngredients`,
  `finishedGoodsSalesRoutes`, `costCalculator`, `bakeryStockReportRoutes`.
- Controllers: `finishedGoodsIngredientsController`, `finishedGoodsItemController`,
  `finishedGoodsOpeningBalanceController`, `finishedGoodsReportController`, `finishedGoodsSalesController`,
  `finishedGoodsStockController`, `finishedGoodsStockReportController`, `finishedGoodsTransferController`,
  `finishedGoodsWastageController`, `productionController`, `bakeryStockReportController`.
- `server.js`: the matching requires and mounts (`/api/finished-goods-*`, `/api/productions`,
  `/api/cost-calculations`, `/api/reports/bakery-stock`).
- `config/rolePermissions.js`: the `finishedGoods` module and its API rules (including `/transfer-destinations` and
  `/reports/bakery-stock`), plus `finishedGoods` read grants on `/items`, `/item-types` and `/purchases/previous-prices`.
- `config/db.js`: the startup soft-delete `ALTER`s for the 8 `finished_goods_*` tables.
- `dashboardController.js`: FG wastage and production queries were removed from the overview. `/api/stats` keeps its response
  shape, with `orders`, `revenue` and `products` (which came from Finished Goods sales and items) now fixed at 0.

## Retained FG Production dependencies

FG Production never used any Finished Goods table, route or component (traced in code and by foreign keys).
It keeps:
- Code: `FGProduction/*` (Recipes, FGRecipesReports, constants, unit conversion), `FgMarginChart.jsx`,
  `fgProductionController.js`, `fgProductionRoutes.js`, `ravonPosService.js` / `integrationAuthService.js`.
- Tables: `fg_production` and `fg_production_recipes`, plus the shared `departments`, `items`, `purchases` / `purchase_items`.
- API access it relies on: `/fg-production`, `/departments`, `/items`, `/purchases/previous-prices` (read).
- Role access is unchanged: Stores, Accountant, QB (view only), Admin and Super Admin. Finance users have no access.
- `css/fg-finance-ui.css` is shared by several modules and is kept.

## Database: migration 032 (written, NOT run on the live database)

`server/migrations/032_remove_finished_goods_module.sql` applies the change and
`032_remove_finished_goods_module.down.sql` reverts it. It is a single atomic `RENAME TABLE` to a
`zz_removed_` prefix. Nothing is dropped. Rows, indexes and foreign keys are kept.

| Table | Rows (2026-10-12) | Action |
|---|---|---|
| finished_goods_items | 21 | renamed |
| finished_goods_ingredients | 148 | renamed |
| finished_goods_opening_balances | 5 | renamed |
| finished_goods_productions | 8 | renamed |
| finished_goods_production_items | 120 | renamed |
| finished_goods_sales | 0 | renamed |
| finished_goods_sale_items | 0 | renamed |
| finished_goods_transfers | 2 | renamed |
| finished_goods_transfer_items | 15 | renamed |
| finished_goods_wastages | 0 | renamed |
| finished_goods_wastage_items | 0 | renamed |
| transfer_destinations | 5 | renamed (only used by Finished Goods) |
| cost_calculations | 7 | renamed |
| cost_calculation_ingredients | 60 | renamed |

**Retained:** `fg_production`, `fg_production_recipes`, every shared table (`departments`, `users`, `items`, …),
`cutlery_transfers*`, and `production_cost_calculations`. That last table has 0 rows and no code reference, and its owner is unknown, so it was left alone.
There are no views, routines or triggers on the renamed tables. Foreign keys from the renamed tables to `departments`, `users`
and `items` still exist.

Verified on a restored copy (`ravonbakers_stock_fgtest`):
- Up: only those 14 tables change.
- Running up a second time fails atomically, with no partial change.
- Down: schema and rows are byte-identical to the original.

The live `ravonbakers_stock` was snapshotted before and after the work: all 131 tables have the same row counts and DDL.

## Verification

| Check | Result |
|---|---|
| Server tests `node --test tests/*.test.js` | 160/162 pass. The same 2 fail on the pre-change tag (`chequeReleaseConsistency`, `staffLoans`: missing `./helpers/sqliteMysqlAdapter`). |
| Client Jest | 42/42 tests pass. 1 suite (`common/Popup.test.jsx`) fails to load before and after: it imports `./PopupContext`, which lives in `components/context/`. |
| Client production build | Compiles with no missing modules and no warnings in the changed files |
| Live API regression (71 checks, migrated copy) | Login (Store Keeper, View Only, wrong password); 12 removed endpoints return 403/404; FG Production list/detail/recipes/report for 5 roles; Finance denied; QB writes denied; recipe add/update/soft-delete; header update; dashboard; Raw Material, Expenses, Finance, Collection, VAT, Cutlery and Income endpoints. All pass. |
| UI (built app on the migrated copy) | Super Admin sidebar has no Finished Goods. FG Production Recipes loads data and FG Recipes Reports shows 43 items. Old `/finished-goods/*` and `/cost-calculator/*` URLs redirect to the dashboard. Cash Ledger, New Expenses, Collection, VAT, Items and Purchase History render. A Store Keeper sees FG Production and is denied Finance. |

## Unresolved risks / follow-ups

1. **Run migration 032 yourself** after deploying this code and taking a fresh backup. Until then the old tables stay as they are.
   They are unused but harmless.
2. Once the archive is confirmed unneeded, a later migration can `DROP` the `zz_removed_*` tables (children first). That step is not reversible.
   Until then, their foreign keys still stop you deleting a `departments`, `users` or `items` row that old Finished Goods records reference (this is no change from today).
3. Problems that already existed and are unrelated to this change, found during testing:
   - `GET /api/dashboard/finance-overview` returns 500 ("Illegal mix of collations for operation 'UNION'") on both old and new code.
   - `GET /api/purchases` takes about 30 s and returns 1.5 MB.
   - At startup, POS session schema warnings: `invalidated_at` / `pos_username` columns are missing.
4. `components/StatsDashboard.jsx` (not imported anywhere) displays `/api/stats` orders, revenue and products, which are now always 0.
5. FG Production create and the POS item dropdown (`/api/fg-production/items`) need a live RAVON POS session, so they were not exercised.
   That code is unchanged, and it returns the same `POS_NOT_CONNECTED` before and after.
6. The scratch database `ravonbakers_stock_fgtest`, a full copy of production data, was left on the local MySQL server.
   Drop it when you no longer need it.
