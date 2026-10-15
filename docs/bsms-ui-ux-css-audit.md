# BSMS – UI/UX, CSS, Popup, Responsive & Accessibility Audit

| | |
|---|---|
| **Date** | 2026-10-15 |
| **Scope** | React client (`client/src`) of the Bakery Stock Management System, as served locally at `http://localhost:3000` against the local API (`http://localhost:5000`, database `ravonbakers_stock` on localhost) |
| **Type** | Audit only. No application code, CSS, database records, roles or settings were changed. |
| **Companion file** | [bsms-ui-ux-popup-inventory.md](bsms-ui-ux-popup-inventory.md) – full popup inventory with per-popup test status |

### How to read the evidence labels

Every finding says how it was established:

| Label | Meaning |
|---|---|
| **B** – Browser-confirmed | Reproduced in a real browser (Chromium, in-app pane) against the running app, using DOM measurement and/or screenshots |
| **S** – Source-confirmed | Established by reading the code; behaviour follows directly from it, but it was **not** reproduced in the browser (usually because reproducing it would write data) |
| **C** – Computed | Calculated (e.g. colour-contrast ratios from the design tokens) |
| **Suspected** | Plausible from the code, not proven. Listed separately and never counted as confirmed |

---

## 1. Executive summary

BSMS has a solid foundation: a single token file with the agreed palette (`#355872 / #7AAACE / #9CD5FF / #F7F8F0`), a shared `<Modal>` / `ConfirmDialog` / `PageHeader` set, a central role table that drives the sidebar, routes and API, and a `legacy-dialogs.css` skin that gives most older popups the same look. Most pages render cleanly at 1024 px and most fit a 375 px phone.

The problems are concentrated in three places:

1. **Layout clipping that hides financial data and actions.** On *Outstanding Bills* the **Balance, Status, Days Overdue and Actions** columns are cut off at 1024 px, and **Days Overdue and Actions are still cut off at 1366 px and 1440 px** – the "Make Payment" action is unreachable there on typical laptops (root cause: `.table-container { overflow: hidden }`). Seven more pages clip their content on phones/tablets with no way to scroll, including the Petty Cash balance.
2. **Popups built on 15+ different implementations behave inconsistently and lose data.** The item dropdown in the *Add New Purchase* popup opens **behind** the popup; pressing Escape to close that dropdown closes the whole invoice; a single click on the backdrop discards typed amounts in Cash/Bank receipt and payment popups; closing a route popup unmounts and reloads the list behind it (24 s of blank screen measured on Purchase History). The Cutlery *Add Asset* form is rendered off-screen while page scrolling is locked, so it cannot be used at all.
3. **Missing styles and accessibility basics.** A static scan found **649 class names used in JSX with no matching CSS rule** anywhere – e.g. the *Save Issuance*, *Save Wastage* and *Save Return* buttons render as bare text, and the whole *Edit Wastage* screen is unstyled. 13 of 14 sidebar section headers cannot be reached with the keyboard, and 55 of 75 tested pages have form controls with no programmatic label.

Three stock forms (Add Wastage, Add Department Return, Add Opening Balance) do not disable their submit button while saving, so a double-click can post the same stock movement twice (source-confirmed; not reproduced, to avoid writing stock records).

**Findings: 38 total – 3 × P0, 10 × P1, 14 × P2, 11 × P3.** Overall score **4.3 / 10** (method in §22).

### Five most important issues

| # | ID | Issue |
|---|---|---|
| 1 | UI-001 | Outstanding Bills hides Balance/Status/Days Overdue/**Actions** at 1024 px; Actions still hidden at 1366 and 1440 px |
| 2 | UI-002 | Cutlery *Add Asset* popup is unreachable (off-screen, body scroll locked) |
| 3 | UI-003 | No double-submit guard on Add Wastage / Add Return / Add Opening Balance |
| 4 | UI-004 / UI-005 | Item dropdown hidden behind the *Add New Purchase* popup; Escape in the dropdown closes and discards the whole invoice |
| 5 | UI-006 | Backdrop click silently discards entered data in financial form popups |

---

## 2. Project structure and discovered routes

### 2.1 Architecture

| Item | Finding |
|---|---|
| Framework | React 19.1 (Create React App / `react-scripts` 5), React Router 7 (`BrowserRouter`), axios |
| Entry | [index.js](../client/src/index.js) → `PopupProvider` → `ConfirmProvider` → [App.js](../client/src/App.js) |
| Layout | [Layout.jsx](../client/src/components/Layout.jsx): `NavigationBar` (sidebar) + `ViewOnlyGuard` + `<main class="main-content">` wrapped in `RouteAccessGuard` |
| Styling | Plain CSS. [index.css](../client/src/index.css) imports `styles/tokens.css → base → components/* → utilities → print`; ~95 page-level CSS files are imported by components; [App.js](../client/src/App.js) imports `purchasing-page-ui.css`, `fg-finance-ui.css` and, last, `legacy-dialogs.css`. **107 CSS files, 18,189 lines.** |
| Tailwind | `tailwindcss` is a devDependency and is wired into [postcss.config.js](../client/postcss.config.js), but there is no `tailwind.config.*` and no `@tailwind`/`@apply` anywhere – it is unused |
| UI libraries | `react-select`, FontAwesome (+ `font-awesome` 4 and `react-icons`), Chart.js, `jspdf`, `xlsx`, `swiper` |
| Shared components | [common/ui](../client/src/components/common/ui/): `Modal`, `ConfirmDialog`/`ConfirmProvider`, `PageHeader`, `EmptyState`, `StatusBadge`, `UiPreview` (dev-only `/ui-preview`). Also `RouteModal`, `Popup` (+ `PopupContext`), `AccessDenied`, `RouteAccessGuard`, `ViewOnlyGuard`, `CanWrite`, `ModalLink` |
| Roles | [config/rolePermissions.js](../client/src/config/rolePermissions.js) – single table for sidebar, routes and (mirrored) API |
| API client | [api.js](../client/src/api.js) – global 401 handler (redirect to `/login`) and a `window.alert` for view-only 403s; base URL hard-coded to `http://localhost:5000/api` |
| Tests | Jest/RTL unit tests exist (e.g. `Popup.test.jsx`, `ui.test.jsx`, `NavigationBar.test.jsx`, `OrdersPage.test.jsx`); no end-to-end/visual test tooling in the repo |

### 2.2 Route inventory

[App.js](../client/src/App.js) declares **97 route paths**. Removing auxiliaries (`/login`, `/auth-check`, `/ui-preview`, `/`, `*`, `/management` redirect, `finance/cash-receive` and `finance/bank-receive` redirects) and two duplicates (`analyst/incomes` = `analyst/income`, `cutlery/reports/inventory` = `cutlery/reports/stock`) leaves **87 distinct application routes**, 9 of them with `:id` parameters, plus `/login`. **16 routes** are "modal routes" (`ModalRoute`): they render inside `RouteModal` when opened with `state.backgroundLocation`, and as full pages otherwise.

| Module | Routes (distinct) |
|---|---|
| Auth / shell | `/login`, `/dashboard`, `/admin/password` |
| Management | `/items`, `/items/add`ᴹ, `/items/edit/:id`ᴹ, `/item-types`, `/suppliers`, `/departments`, `/companies`, `/adjustments/payment-methods`, `/expenses/bank-details`, `/expense-types-management`, `/sub-expense-types-management`, `/expense-payees-management`, `/bank-charges-type-management`, `/finance/receive-types`, `/other-ledgers-management`, `/credit-card-rate-management`, `/admin/employees` |
| Raw Material – purchasing | `/purchase/new`ᴹ, `/purchase/edit/:id`ᴹ, `/purchase/:id`ᴹ, `/purchase/history`, `/purchase/orders`, `/purchase/advance-payment`, `/purchase/record-payment`, `/purchase/non-paid`, `/purchase-returns/add`ᴹ, `/purchase-returns/history` |
| Raw Material – stock | `/issuance/issue`ᴹ, `/issuance/edit/:id`ᴹ, `/issuance/history`, `/wastage/add`ᴹ, `/wastage/edit/:id`ᴹ, `/wastage/history`, `/returns/add`ᴹ, `/returns/history`, `/opening/add`ᴹ, `/opening/history` |
| Raw Material – reports | `/reports/stock`, `/reports/stock/items`, `/reports/department`, `/reports/department-usage`, `/reports/department-return-item-wise`, `/reports/purchasing`, `/reports/purchase-report`, `/reports/wastage`, `/analysis/last-issued-date` |
| Expenses | `/expenses/petty-cash`, `/expenses/reimbursement`, `/expenses/bank-charges`, `/expenses/new`, `/expenses/reports`, `/expenses/summary-report`, `/expenses/cash-expenses`, `/expenses/hidden` |
| Finance | `/finance/cash`, `/finance/bank`, `/finance/transfer`, `/finance/income`, `/finance/bank-transfer`, `/finance/other-ledgers`, `/finance/cheque-registry`, `/finance/staff-loans`, `/finance/card-ledger`, `/finance/intercompany` |
| Collection | `/collection` |
| Cutlery | `/cutlery/locations`, `/cutlery/assets`, `/cutlery/assets/view/:id`ᴹ, `/cutlery/assets/edit/:id`ᴹ, `/cutlery/transfer`, `/cutlery/transfer/view/:id`ᴹ, `/cutlery/purchasing`, `/cutlery/damage`, `/cutlery/reports/stock` |
| FG Production | `/fg-production/recipes`, `/fg-production/reports` |
| Adjustments | `/adjustments/stores-balance`, `/adjustments/stores-adjustments`, `/adjustments/edit/:id`ᴹ, `/adjustments/inhand` |
| VAT | `/reports/vat`, `/reports/purchase-vat` |
| Analyst | `/analyst/income`, `/analyst/expenses`, `/analyst/balance-sheet` |

ᴹ = modal route.

---

## 3. Audit scope and coverage

### 3.1 Method

1. Read the route table, layout, shared components, role table and every popup implementation.
2. Static scans (Node/grep over `client/src`): undefined class names, `!important`, z-index values, breakpoints, hard-coded colours, duplicated selectors, native `alert`/`confirm`, click handlers on non-interactive elements, submit-lock patterns, overlay click handlers.
3. Browser testing in the in-app Chromium pane against the running local app, signed in with the local QA account documented in `server/.env.ui-test` (Super Admin – sees every module). An injected DOM probe measured each route: page overflow, off-screen elements, tables vs. their containers, unlabelled controls, unnamed buttons, touch-target size and heading structure. A second probe opened popups through their real triggers and measured position, size, focus, role/naming, scroll locking and Escape/close behaviour.
4. Viewports: 1024 × 768 (full sweep), 375 × 812 (full sweep), 320, 768, 1366 and 1440 (spot checks). 430 px and 1920 px were **not** measured (the pane could not emulate 1920 without scaling; 430 was not prioritised).

### 3.2 Safety constraints that limited testing

* **No form was submitted** and no record was created, edited or deleted. Delete confirmations were opened and cancelled. Validation was triggered only where the client-side check stops before any API call.
* **`/collection` was not opened**: opening it pulls pending collections from the **live** POS/Restaurant sites configured in `server/.env` (`refresh=1` on first load) and writes them into the local database.
* **`/fg-production/*` was not opened**: its pages read finished-goods items from the live POS.
* Only one role (Super Admin) could be signed in; other roles were reviewed from source only.

### 3.3 Coverage summary

| Measure | Count |
|---|---|
| Distinct application routes discovered | 87 (+ `/login`) |
| Routes rendered and probed in the browser at 1024 px | 76 + `/login` |
| Routes probed at 375 px | 69 |
| Routes not opened | 11 – `/collection`, 2 × FG Production, 8 of 9 `:id` routes (`/purchase/:id` was opened) |
| Modules discovered / audited | 13 / 13 (Collection and FG Production statically only) |
| Popup / overlay entries discovered (source) | 89 (see inventory) – built on 17 different class-name schemes |
| Popups opened through their real trigger and visually inspected | 30 (plus the shared `Modal` and `RouteModal` shells exercised through them, and 5 route forms inspected as full pages) |
| Popups tested at ≥ 2 viewport sizes | 15 |
| Popups with interaction tests (close / Escape / focus / backdrop) | 30 |
| Forms whose client validation was exercised | 3 (Login, Cash Received, RM Wastage) |
| Form submissions | 0 (by design) |

---

## 4. Overall UI/UX assessment

**What works well**

* Clear visual identity; the palette is defined once in [tokens.css](../client/src/styles/tokens.css) and used through 2,090 `var(--color-…)` references.
* A real shared dialog (`<Modal>`) and confirmation service (`useConfirm`) exist and behave well: correct `role="dialog"`, `aria-modal`, labelled title, initial focus in the first field, Escape closes, focus returns to the trigger, body scroll locked, form dialogs do **not** close on backdrop click. 28 files already use `useConfirm`.
* Role rules are centralised, and the sidebar, direct-URL guard and dashboard shortcuts all read the same table – a user is not shown links they cannot open, and a typed URL leads to a clear "Access Denied" page.
* Most pages tested at 375 px fit the viewport; the phone drawer works once found.
* Destructive confirmations generally name the record ("Delete rm type? "Fruits" will be removed").

**What undermines it**

* Only 8 of the 89 inventoried popups use the shared `<Modal>`; 17 use `RouteModal`, and most of the rest use 15 other home-grown variants with different behaviour for Escape, backdrop, focus and scroll.
* The 16 route popups are rendered **instead of** the page behind them, so every open/close reloads that page.
* Styling has drifted: 649 class names have no CSS, 131 `!important`, `.btn` is defined in 16 files, z-indexes range from 1 to 2,147,483,647.
* Financial tables and filters are clipped at laptop widths by `overflow: hidden` containers.

---

## 5. Module-by-module findings

| Module | Pages tested | Key findings (IDs) |
|---|---|---|
| Auth | Login | Failed login reloads the page and the error is never seen (UI-008). Success shows a blocking popup and waits 1.5 s before navigating (UI-026) |
| Dashboard | 1 | Renders cleanly; tiles filtered by role. "Open navigation" strip visible beside the sidebar on desktop (UI-014) |
| Management | 16 | Search inputs placeholder-only (UI-013); Items list renders 625 rows / 1,897 buttons without pagination (UI-021); Supplier/Items action icons 18×14 px (UI-022); Change Password `minLength="6"` vs 8-character rule (UI-034); good use of shared Modal and confirm |
| Raw Material – purchasing | 9 + Purchase Details popup | **Outstanding Bills hides money columns and Actions (UI-001)**; item dropdown behind Add New Purchase popup (UI-004); Escape discards invoice (UI-005); Purchase History blank for 10–24 s and reloads after every popup (UI-007, UI-025); Purchase Returns History hides Status/Actions at 1024 px (UI-010) |
| Raw Material – stock | 10 | Unstyled Save buttons (UI-012); no double-submit guard (UI-003); Add Wastage / Add Return clipped on phones and tablets (UI-009); Opening Balance History 592 rows, clipped on phones |
| Raw Material – reports | 9 | Purchase Report hides "Total Amount" at 1024 px (UI-010); Wastage report (421 rows) and Last Issue Date (651 rows) clipped on phones; native `alert()` for validation/errors (UI-026) |
| Expenses | 8 | Petty Cash clips its balance on phones (UI-009); New Expenses table 16 columns / 1,744 px and clipped at 320 px; six popups on New Expenses close on backdrop click (UI-006) |
| Finance | 10 | Cash/Bank Ledger "Direction" filter off-screen at 1024 px (UI-010); six `sl-modal` popups: no Escape, no scroll lock, unlabelled fields, backdrop discards data, error shown out of view (UI-006, UI-017, UI-018); Card Ledger renders 807 rows with 814 checkboxes (UI-021); inconsistent "Rs." formatting (UI-023) |
| Collection | 0 (static) | Three dialogs have `role="dialog"`, `aria-modal` and guard backdrop close while submitting – the best of the legacy popups; no Escape. Not browser-tested (§3.2) |
| Cutlery | 6 + 4 popups | **Add Asset unreachable (UI-002)**; add/edit/view forms render inline below the page (UI-015); 156 unnamed icon buttons on Assets, emoji buttons on Damages (UI-022); `alert()` validation in forms |
| FG Production | 0 (static) | `fgprod-modal` supports Escape and has a mobile footer layout. Not browser-tested (§3.2) |
| Adjustments | 3 | In-hand details "drawer" renders inline (UI-016); Stores Balance table 1,112 px wide with 12 unlabelled fields |
| VAT | 2 | Placeholder-only filters; "PDF generation feature coming soon!" alert on a visible button (UI-026) |
| Analyst | 3 | Analyst Expenses renders 3,626 rows × 10 columns (1,999 px) at once (UI-021) |

---

## 6. Page-by-page findings

Results of the automated probe at **1024 × 768** and **375 × 812** (Super Admin). *Unlabelled* = visible inputs/selects with no `<label for>`, wrapping label, `aria-label` or `title`. *Clipped @375* = page content wider than `main` with `overflow-x: hidden`, so it cannot be scrolled into view.

| Route | h1 | Unlabelled | Tables (cols × rows, width/container) | Clipped @375 | Notes |
|---|---|---|---|---|---|
| /dashboard | ✓ | 0 | – | – | Values load as skeletons first |
| /items | – | 5 | 10 × 625, 1321/614 scroll | – | No pagination |
| /item-types | ✓ | 1 | 3 × 5 | – | |
| /suppliers | ✓ | 1 | 6 × 162, 934/697 scroll | – | Icon actions 18×14 px; inline add form |
| /departments | ✓ | 1 | 3 × 14 | – | |
| /companies | ✓ | 1 | 3 × 3 | – | |
| /adjustments/payment-methods | – | 1 | 3 × 3 | – | |
| /expenses/bank-details | – | 1 | 9 × 5, 969/651 scroll | – | Inline add form |
| /expense-types-management | ✓ | 1 | 3 × 8 | – | |
| /sub-expense-types-management | – | 1 | 4 × 29 | – | |
| /expense-payees-management | ✓ | 1 | 4 × 80 | – | |
| /bank-charges-type-management | ✓ | 1 | 3 × 4 | – | |
| /finance/receive-types | – | 1 | 3 × 13 | – | |
| /other-ledgers-management | – | 1 | 5 × 3 | – | |
| /credit-card-rate-management | – | 1 | 4 × 2 | – | |
| /admin/employees | – | 1 | 10 × 1, 1288/657 scroll | – | 2 unnamed pagination buttons |
| /admin/password | – | 3 | – | – | `minLength=6` vs 8-char rule |
| /purchase/new | ✓ | 15 of 20 | 2 tables, scroll | 313/303 @320 | Pending-invoices "Reset" button beyond 1024 px |
| /purchase/history | – | 0 | 7+ × 50 | – | Blank 10–24 s while loading; heading "Purchasing Summary Report" |
| /purchase/orders | ✓ | 0 | 7 × 17 scroll | – | 17 buttons all named just "Order" |
| /purchase/advance-payment | – | 9 | – | – | Unnamed `×` close button |
| /purchase/record-payment | – | 4 | 9 × 4 scroll | – | Reset button beyond 1024 px |
| /purchase/non-paid | ✓ | 0 | **10 × 4, 1230/695 `overflow:hidden`** | – | **UI-001** |
| /purchase-returns/add | ✓ | 5 | 8 × 1 scroll | – | Unnamed back button |
| /purchase-returns/history | – | 0 | **9 × 1, 968/705 hidden** | – | Status + Actions hidden at 1024 |
| /issuance/issue | – | 9 | 5 × 1 | – | Unstyled "Save Issuance" (0 px padding, 14 px tall) |
| /issuance/history | – | 4 | – | – | |
| /wastage/add | ✓ | 9 | 6 × 1, `overflow: visible` | **745/358** | Unstyled Save; also clipped at 768 px |
| /wastage/history | – | 0 | 6 × 28 | – | 18×14 px icon buttons |
| /returns/add | ✓ | 8 | 6 × 1, visible | **906/358** | Unstyled Save; also clipped at 768 px |
| /returns/history | – | 0 | 6 × 3 | – | |
| /opening/add | – | 1 | – | – | Unstyled submit |
| /opening/history | – | 1 | 6 × 592, visible | **811/358** | No pagination |
| /items/add | – | 5 of 7 | – | – | |
| /expenses/petty-cash | – | 12 | 9 × 10 scroll | **492/358** | Balance "LKR 14…" cut off (also 504/481 at 768) |
| /expenses/reimbursement | – | 0 | 6 × 3 | – | |
| /expenses/bank-charges | – | 9 | 8 × 5 scroll | **380/358** | |
| /expenses/new | – | 15 | 16 × 2, 1744/614 scroll | 481/303 @320 | |
| /expenses/reports | – | 5 | 8 × 47 | – | |
| /expenses/summary-report | – | 6 | 7 × 16 | – | |
| /expenses/cash-expenses | – | 8 | 9 × 13 | – | |
| /expenses/hidden | – | 6 | 7 × 1 | – | |
| /finance/cash | – | 3 | 9 × 644, hidden (fits) | – | Direction filter off-screen at 1024 |
| /finance/bank | – | 3 | 10 × 162 | – | Direction filter off-screen at 1024 |
| /finance/transfer | – | 5 | – | – | |
| /finance/income | – | 0 | 4 × 88 | – | |
| /finance/bank-transfer | – | 6 | – | – | **No heading at all** |
| /finance/other-ledgers | – | 0 | 9 × 15 | – | |
| /finance/cheque-registry | – | 4 | 12 × 2, 1594/602 scroll | – | |
| /finance/staff-loans | – | 0 | 5 × 1 | – | |
| /finance/card-ledger | – | 0 | 9 × 807 | – | 814 inputs on one page |
| /finance/intercompany | – | 0 | 6 × 1 | – | |
| /reports/stock | – | 3 | – | – | |
| /reports/stock/items | – | 3 | – | – | |
| /reports/department | – | 4 | – | – | |
| /reports/department-usage | – | 3 | – | – | |
| /reports/department-return-item-wise | – | 4 | – | – | |
| /reports/purchasing | – | 5 | – | – | |
| /reports/purchase-report | – | 5 | **8 × 135, 779/613 hidden** | – | "Total Amount" hidden at 1024 |
| /reports/wastage | – | 3 | 9 × 421 | **490/358** | |
| /analysis/last-issued-date | – | 3 | 5 × 651 | **558/358** | |
| /reports/vat | – | 5 | – | – | |
| /reports/purchase-vat | – | 4 | 9 × 1 | – | |
| /cutlery/locations | – | 0 | 4 × 7 | – | |
| /cutlery/assets | – | 0 | cards | – | 156 unnamed icon buttons |
| /cutlery/transfer | – | 0 | – | – | |
| /cutlery/purchasing | – | 0 | 8 × 8 | – | 13×15 px icon buttons |
| /cutlery/damage | – | 0 | 8 × 14 | – | Emoji-only buttons (👁️ ✏️ 🗑️) |
| /cutlery/reports/stock | ✓ | 0 | 10 × 52 | – | |
| /adjustments/stores-balance | – | 12 | 9 × 1, 1112/598 scroll | – | |
| /adjustments/stores-adjustments | – | 3 | 9 × 10 | – | 2 unnamed pagination buttons |
| /adjustments/inhand | – | 5 | 9 × 1 | – | |
| /analyst/income | – | 0 | 5 × 88 | – | |
| /analyst/expenses | – | 0 | 10 × 3,626, 1999/646 | – | |
| /analyst/balance-sheet | – | 0 | – | – | |

---

## 7. Popup and modal inventory (summary)

The full table (89 entries, with trigger, file, CSS, results per viewport, accessibility and verification level) is in **[bsms-ui-ux-popup-inventory.md](bsms-ui-ux-popup-inventory.md)**.

| Implementation family | Popups | Escape | Backdrop | Focus moved in | Scroll lock | role/aria-modal |
|---|---|---|---|---|---|---|
| Shared `<Modal>` (`ui-modal`) – incl. ConfirmDialog | 6 components + ConfirmDialog (28 files) | ✓ | off by default ✓ | ✓ (no Tab trap) | ✓ | ✓ |
| `RouteModal` (16 routes) + `PurchaseDetailsModal` | 17 | ✓ (even from inside a dropdown – UI-005) | closes on mousedown, discards data | ✗ | ✓ | role on overlay, label on inner section |
| `sl-modal` (Finance) | 6 | ✗ | closes, discards data | partly (autoFocus) | ✗ | ✓ |
| `cl-modal` (Card Ledger, Collection) | 4 | ✗ | closes (Collection guards while submitting) | ✗ | ✗ | ✓ |
| `payment-modal` / `cn-modal` (New Expenses, Non-paid) | 7 | 1 of 7 | closes | ✗ | ✗ | ✗ |
| `ipm` / `pnm` / `snm` (purchase payments) | 3 | ✗ | 2 of 3 close | ✗ | ✗ | ✗ |
| `modal-overlay` generic (history/report details, adjustments) | ~12 | ✗ | most close | ✗ | ✗ | 2 of 12 |
| Cutlery form overlays (`form-overlay`, `add-*-overlay`, `ep-overlay`, …) | 8 | 1 of 8 | – | ✗ | 1 of 8 | ✗ – **no fixed positioning; render inline/off-screen** |
| Others (`em-modal`, `orders-modal`, `inc`, `ih-form`, `ih-drawer`, `ecr-release`, `modern-modal`, `esr`, `fgprod`, `issuance-modal`, `settlement-modal`) | ~15 | 3 | mixed | ✗ | 1 | 2 |
| Global `Popup` notification | 1 | ✗ | closes | ✗ | ✗ | `role=dialog aria-modal aria-live` |
| Native `window.alert` | 27 call sites + 1 in api.js | n/a | n/a | n/a | n/a | n/a |

---

## 8. Popup-specific findings

(Full detail in the issue register, §15.)

* **UI-002 (P0, B)** Cutlery *Add Asset*: portaled to `document.body` with `position: static` (no CSS gives `.add-asset-overlay` fixed positioning), so it lands after the 768 px-tall layout while `body { overflow: hidden }` is set – it can never be scrolled into view.
* **UI-004 (P1, B)** *Add New Purchase* route popup: the item `react-select` menu is portaled with `z-index: 10000` ([PurchaseItemSelect.jsx:77](../client/src/components/purchase/PurchaseItemSelect.jsx:77)) under an overlay at `z-index: 2147483000` ([RouteModal.css:4](../client/src/components/common/RouteModal.css:4)). `elementFromPoint` on the open menu returns a table cell; the menu (2,500 options) is invisible. Same pattern in Edit Purchase and Edit Issuance (z 9999) – source-confirmed.
* **UI-005 (P1, B)** Escape pressed to dismiss that dropdown also reaches `RouteModal`'s document-level listener ([RouteModal.jsx:14](../client/src/components/common/RouteModal.jsx:14)) and navigates back – the partially typed invoice is discarded without a prompt.
* **UI-006 (P1, B/S)** Backdrop click/mousedown discards data: confirmed on *Cash Received* (typed 1,500 → backdrop → reopened empty) and *Add New Item* route popup. Source shows the same `onClick={onClose}` on the overlay of Cash Issued, Bank Received/Issued, Invoice Payment, Settle Now, Payment (Non-paid), New Income, Staff-loan Receive, Card Ledger Realise and six New Expenses popups. Because it is a `click` handler on the overlay, a text selection that starts in a field and is released over the backdrop also closes the popup.
* **UI-007 (P1, B)** Route popups replace the page: App.js does not render `<Routes location={backgroundLocation}>`, so opening *Purchase Details* unmounts Purchase History (`main` text length 0) and closing it remounts and refetches – 24.3 s of blank screen measured, filters and scroll position lost.
* **UI-015 (P2, B)** Cutlery Add Transfer / Add Purchase / Add Damage (and their Edit/View counterparts, by the same CSS gap) render as in-flow blocks 164–934 px down the page instead of overlays.
* **UI-016 (P2, B)** In-hand *View Details* "drawer": `.ih-drawer-overlay` and `.ih-drawer` are `position: static`; the panel is inserted at the top of the page container, away from the row the user clicked.
* **UI-017 (P2, B)** Legacy popups (18 of the 30 opened) ignore Escape, most do not move focus inside, none lock background scroll; the shared `<Modal>` lets Tab leave the dialog (4 × Tab from the first field reached the sidebar "Dashboard" link).
* **UI-018 (P2, B)** *Cash Received* validation: "Amount must be greater than 0" is rendered at y = 1,024 px inside a 768 px viewport (bottom of the scrolling body) – the user sees nothing happen. Messages are one at a time, and no field gets `aria-invalid`.
* **UI-024 (P2, B)** Route popups show two headers and two close buttons (modal title "Add New Item" + page header "Add New Item" with its own full-width ×; *Purchase Details* + "RM Purchase Invoice Details" with a back arrow).
* **UI-027 (P2, Suspected)** z-index: shared `ConfirmDialog` and `<Modal>` use `--z-modal` (1050); legacy popups use 99,999 and route popups 2,147,483,000. A confirmation or a shared Modal opened from inside one of those would render beneath it. No current call path was found that does this, so it is a latent risk.
* Employee add/edit popup at 375 px scrolls as a whole; the Save button is 996 px down and the footer is not sticky (UI-036, P3).

---

## 9. CSS consistency and maintainability findings

| Metric | Value | Comment |
|---|---|---|
| CSS files / lines | 107 / 18,189 | 40+ are 2-line stubs that only `@import` other files (e.g. `Suppliers.css` imports `FormStyles.css` and `Purchase.css`) – global styles get pulled in by many pages |
| Class names used in JSX with **no CSS rule** | **649** of 1,778 | Worst: EditWastage (76), PurchaseHistory (66), PurchaseReturnHistory (43), ViewTransfer (40), NonPaidPurchases (28), SettlementModal(s) (25/24), WastageHistory (25), InhandAdjustments (25). Likely related to the 2026-09-02 CSS clean-up (commit `e267000`) – not proven per class |
| `!important` | 131 | 51 in `FinanceLedger.css`, 32 in `select.css` |
| Hard-coded hex colours outside tokens | 341 | Top: ExpensesChequeRegistry.css 51, Purchase.css 39; includes off-palette Tailwind-style blues (`#eff6ff`, `#1e293b`, `#28a745`) |
| Same selector defined in several files | `.btn` 16, `.page-header` 12, `.btn-primary` 9, `.btn-secondary` 8, `.form-group` 8, `.modal-content` 6, `.modal-overlay` 5 | Result depends on import order |
| z-index values in use | 21 distinct, from −1 to 2,147,483,647 | Tokens define only 1000–1070 |
| Breakpoints | 21 different `max-width` values (480, 520, 560, 600, 640, 700, 760, 767, 768, 800, 860, 900, 991, 1024, 1100, 1199 …) | 47 CSS files (incl. 741-line `ExpensesChequeRegistry.css`) have no media query |
| Popup naming schemes | 17 | `legacy-dialogs.css` lists 25 overlay and 24 card selectors to paint them alike |
| Fonts | Inter + Poppins via Google Fonts `@import`; tokens list JetBrains Mono that is never loaded | |
| Tailwind | configured in PostCSS, unused | |
| Cross-named files | `InvoicePaymentModal.css` defines `.pnm-*`, `PayNowModal.css` defines `.ipm-*` (the opposite components) | |
| Dead code | `purchasereturn/SettlementModal.jsx` is imported nowhere and imports a `SettlementModal.css` that does not exist | |

---

## 10. Responsive design findings

| Width | Result |
|---|---|
| 320 | Cash Received popup fits (288 × 576). New Expenses (481/303) and New Purchase (313/303) clip |
| 375 | 69 routes probed: **7 clip without scroll** – Petty Cash, RM Wastage add, Department Return add, Opening Balance History, Bank Charges, Wastage Report, Last Issue Date. 11 popups measured: all fit; Employee popup's Save needs scrolling |
| 768 | Sidebar stays expanded at 260 px (the collapse rule runs only on first load), leaving 481 px for content; Petty Cash, Wastage add and Return add clip |
| 1024 | Outstanding Bills hides 4 columns, Purchase Report hides 1, Purchase Returns History hides 2; Cash/Bank Ledger "Direction" filter at x = 1047–1197 (off-screen) |
| 1366 | Outstanding Bills still hides **Days Overdue + Actions**, Status partly cut |
| 1440 | Outstanding Bills still hides **Days Overdue + Actions** |
| 430, 1920 | Not measured |

The phone navigation works (drawer slides in, backdrop closes it), but the only way to open it is an **unstyled** `.mobile-nav-toggle` button – a full-height, 17.5 px-wide strip with a ≡ glyph at mid-screen, which also shows next to the sidebar on desktop and takes 17 px from the content on every width.

Root causes: `.main-content { overflow-x: hidden }` + fixed-width table/form content; `.table-container { overflow: hidden }` in [FormStyles.css:308](../client/src/components/common/FormStyles.css:308); `flex-wrap: nowrap` on ledger filter rows in [FinanceLedger.css](../client/src/components/Finance/FinanceLedger.css).

---

## 11. Accessibility findings (WCAG 2.2 AA – partial, not a compliance claim)

| Criterion | Finding | Evidence |
|---|---|---|
| 2.1.1 Keyboard | 13 of 14 sidebar module/section headers are `<div onClick>` with no tabindex/role; keyboard users can only reach links in the already-open group. 148 `onClick` handlers on `div/tr/td/span/li/th` across the app, none with `role`/`tabIndex` | B + S |
| 2.4.3 Focus order / 2.4.11 | Legacy popups do not move focus in; no popup traps Tab; route popups leave focus behind the overlay | B |
| 1.3.1 / 3.3.2 / 4.1.2 Labels | 55 of 75 pages have at least one unlabelled control; nearly every search box is placeholder-only; legacy popup fields have visible labels not tied to the control (7 of 7 in Cash Received) | B |
| 4.1.2 Name | 156 unnamed icon buttons on Cutlery Assets; unnamed pagination arrows (Employees, Stores Adjustments), back/close buttons; 17 identical "Order" buttons on Orders | B |
| 1.4.3 Contrast | `--color-text-tertiary`/`--color-text-muted` #8a9aa8 = **2.89:1** on white (2.70 on cream), used 78 times; warning #c98a1b = 2.94:1; accent-dark #5a8db3 = 3.56:1; placeholder #9aa8b4 = 2.43:1 | C |
| 1.4.11 Non-text contrast | Input border #e1e7ec = 1.25:1, strong border 1.51:1 (fields are partly distinguished by a fill colour) | C |
| 2.5.8 Target size | Icon buttons 13–18 × 13–17 px on Suppliers, Wastage, Petty Cash, Bank Charges, Cutlery, Non-paid | B |
| 1.3.1 Headings | Only 15 of 76 pages have an `<h1>`; Bank Transfer has no heading | B |
| 3.3.1 Error identification | Errors shown one at a time, sometimes out of view; no `aria-invalid`; global Popup auto-dismisses errors after 5.5 s | B + S |
| 4.1.3 Status messages | Success messages use a blocking `role="dialog"` popup rather than a polite live region | S |
| Focus visible | Global `:focus-visible` ring (accent-dark, 3.56:1) – passes 3:1 | S |
| Reduced motion | Respected in RouteModal and two other files | S |

---

## 12. Functional UI test results

| Test | Result |
|---|---|
| Login – empty submit | Blocked by native `required` ✓ |
| Login – wrong password | ✗ 401 → global interceptor sets `window.location.href = '/login'` → full reload; error popup destroyed, username cleared (UI-008) |
| Login – success | ✓ (1.5 s delay behind a blocking success popup) |
| Navigation – all sidebar destinations (Super Admin) | ✓ 76 routes render; no route-level JS errors seen in the console during the sweeps |
| Route popup open/close (Purchase Details, Add New Purchase, Add New Item) | Opens ✓; background unmounted ✗; Escape/close ✓ but reload ✗ |
| react-select inside route popup | ✗ menu not visible (UI-004) |
| Shared Modal (RM Type add, Payee add, Location add) | ✓ focus, Escape, restore; ✗ Tab trap |
| ConfirmDialog (delete RM Type, Item, Payment Method) | ✓ opens, names record, Cancel closes, nothing deleted |
| Finance popups (6) | Open ✓, Close/Cancel ✓, Escape ✗, backdrop discards ✗ |
| Cash Received validation (empty amount) | Message produced but out of view ✗ |
| Cutlery Add Asset | ✗ unreachable |
| Cutlery Add Transfer/Purchase/Damage | Opens inline far down the page ✗ |
| In-hand View Details | Opens inline at page top ✗ |
| Purchase History load | ✗ 10–24 s of blank screen (skeleton classes unstyled) |
| Phone drawer | ✓ opens/closes via backdrop; ✗ no Escape, toggle unstyled |
| Form submissions / API failure handling | **Not tested** (no writes allowed) |

---

## 13. User-role-specific findings

Only the Super Admin role could be signed in; the rest is source review of [rolePermissions.js](../client/src/config/rolePermissions.js), `NavigationBar`, `RouteAccessGuard`, `ViewOnlyGuard` and `Dashboard`.

| Role | Modules | UI observations |
|---|---|---|
| Super Admin | all + Analyst | Browser-tested. Everything above applies |
| Admin | all except Analyst | Same pages, same issues |
| Accountant (accountant1, accountant2) | Management, Raw Material, Finance, Expenses, FG, VAT, Settings, Collection (only role that can Approve) | Inherits the Finance popup issues (UI-006, UI-017, UI-018) and Outstanding Bills clipping (UI-001) – the workflows Accountants use most |
| QB (view-only) | Accountant's modules, read-only | `ViewOnlyGuard` hides buttons by **matching their text/icons/class names** after render ([viewOnlyMatcher.js](../client/src/components/common/viewOnlyMatcher.js)). Entry forms that share a page with a list (Petty Cash, Cash Expenses, Bank Charges, Hidden Expenses, Stores Balance …) stay visible and fillable with their Save button removed. A missed button produces a 403, shown by `window.alert` in [api.js](../client/src/api.js). The API independently rejects all QB writes, so this is a UX issue, not a security gap (UI-028) |
| Finance user | Management + Expenses | Dashboard switches to a finance overview; sidebar filtered correctly (source) |
| Stores | Management, Raw Material, FG, Settings | Inherits stock-form issues (UI-003, UI-009, UI-012) |
| Unknown roles (Staff/Manager/User) | none | Access Denied on every page, by design |

Positive: route access, sidebar visibility and dashboard tiles all come from one table, and a hidden button is backed by server-side enforcement. Not verified in browser: menu contents per role, Access Denied rendering for each role, Collection Approve visibility.

---

## 14. Performance and maintainability findings

| Area | Evidence |
|---|---|
| Unpaginated tables | Items 625 rows (1,897 buttons), Opening Balance 592, Cash Ledger 644, Card Ledger 807 (814 inputs), Last Issue Date 651, Wastage Report 421, Analyst Expenses 3,626 rows |
| Large selects | Purchase item select renders 2,500 options unvirtualised |
| Remount cost | Route popups remount the background page; Purchase History refetch measured at 10–24 s |
| Invisible loading | Skeleton/shimmer classes on Purchase History, Stats, Edit Wastage, PurchaseVATReport have no CSS → blank screen |
| Duplication | 17 popup implementations; `.btn` in 16 files; 40+ stub CSS files pulling global sheets in |
| Unused dependency | Tailwind (+ PostCSS step); `font-awesome` 4 alongside FontAwesome 7 and `react-icons` |
| Environment config | API base URL hard-coded in [api.js:8](../client/src/api.js:8) with production URLs commented out |

---

## 15. Prioritised issue register

Effort: S = < ½ day, M = ½–2 days, L = > 2 days. Regression risk: L/M/H.

### P0 – Critical

**UI-001 · Outstanding Bills hides money columns and the Actions column on laptop screens** — *B*
* **Where:** Raw Material → Purchasing → Outstanding Bills (`/purchase/non-paid`); [NonPaidPurchases.jsx](../client/src/components/purchase/NonPaidPurchases.jsx); [FormStyles.css:308](../client/src/components/common/FormStyles.css:308)
* **Steps:** open the page at 1024 px, 1366 px or 1440 px wide.
* **Expected:** all 10 columns reachable (scroll if needed). **Actual:** table is 1,230 px inside a `.table-container` with `overflow: hidden`. Hidden at 1024: Balance, Status, Days Overdue, Actions. Hidden at 1366 and 1440: Days Overdue, Actions (Status partly).
* **Root cause:** `.table-container { overflow: hidden }`.
* **Fix:** `overflow-x: auto` on the table wrapper (or wrap the table in the existing `table-responsive` pattern); consider a sticky Actions column. **Effort:** S. **Risk:** L–M (`.table-container` is shared – check the other users: Purchase Report, Purchase Returns History, etc.).
* **Regression tests:** at 1024/1366/1440 every column header's right edge ≤ container right or the container scrolls; "Make Payment" clickable.

**UI-002 · Cutlery "Add Asset" popup cannot be reached** — *B*
* **Where:** Cutlery → Assets → "+ Add Asset"; [AddAssetForm.jsx:78](../client/src/components/Cutlery/Assets/AddAssetForm.jsx:78), portal at line 148.
* **Actual:** the overlay is portaled to `<body>` with `position: static`, rendered at y = 768 px below a 768 px layout, while `body { overflow: hidden }`. Scrolling does not move it. Escape closes it (so the user is not trapped, but cannot add an asset).
* **Fix:** move to the shared `<Modal>` (preferred) or give `.add-asset-overlay` `position: fixed; inset: 0; z-index: var(--z-modal)` with centred content. **Effort:** S. **Risk:** L.
* **Regression tests:** popup bounding box within viewport at 375/1024; Save reachable.

**UI-003 · Stock forms can post twice** — *S (not reproduced, to avoid writing stock)*
* **Where:** [AddWastage.jsx:111](../client/src/components/wastage/AddWastage.jsx:111) / button line 323; [AddReturn.jsx:122](../client/src/components/returns/AddReturn.jsx:122) / line 306; [AddOpeningBalance.jsx:40](../client/src/components/OpeningBalance/AddOpeningBalance.jsx:40) / line 110.
* **Actual:** no `submitting` state and no `disabled` on the submit button while the POST is in flight. A double-click or Enter-repeat sends two POSTs (two wastage notes reduce stock twice).
* **Fix:** the same pattern already used in `PayNowModal`/`CashReceive`: `submitting` state + `disabled` + early return. **Effort:** S. **Risk:** L.
* **Regression tests:** RTL test – click submit twice quickly, assert one API call.

### P1 – High

**UI-004 · Item dropdown opens behind route popups** — *B (Add New Purchase); S (Edit Purchase, Edit Issuance)*
* `react-select` menus portaled to `body` with `zIndex` 10000 ([PurchaseItemSelect.jsx:77](../client/src/components/purchase/PurchaseItemSelect.jsx:77)) / 9999 ([IssueToDepartment.jsx:199](../client/src/components/issuance/IssueToDepartment.jsx:199), [EditIssuance.jsx:210](../client/src/components/issuance/EditIssuance.jsx:210)) vs. RouteModal overlay 2,147,483,000. Workaround: open `/purchase/new` from the sidebar (full page).
* **Fix:** one z-index scale (§16) with `--z-popover` above `--z-modal`, applied to every `menuPortal` style, and RouteModal on `--z-modal`. **Effort:** S. **Risk:** L.

**UI-005 · Escape in a dropdown closes the whole route popup** — *B*
* [RouteModal.jsx:14](../client/src/components/common/RouteModal.jsx:14) listens on `document` and ignores whether the key was already handled.
* **Fix:** skip when `event.defaultPrevented` or when the target is inside an open menu/combobox; prompt when the form is dirty. **Effort:** S. **Risk:** L.

**UI-006 · Backdrop click discards entered data in form popups** — *B (Cash Received, Add New Item); S (others)*
* Overlays with `onClick={onClose}`: [CashReceive.jsx:195](../client/src/components/Finance/CashReceive.jsx:195), [CashIssuedModal.jsx:109](../client/src/components/Finance/CashIssuedModal.jsx:109), [BankTransactionModal.jsx:158](../client/src/components/Finance/BankTransactionModal.jsx:158), [InvoicePaymentModal.jsx:228](../client/src/components/purchase/InvoicePaymentModal.jsx:228), [SettleNowModal.jsx:125](../client/src/components/purchase/SettleNowModal.jsx:125), [PaymentModal.jsx:155](../client/src/components/purchase/PaymentModal.jsx:155), [NewIncomeModal.jsx:72](../client/src/components/Income/NewIncomeModal.jsx:72), [StaffLoans.jsx:420](../client/src/components/Finance/StaffLoans.jsx:420), [CardLedger.jsx:713](../client/src/components/Finance/CardLedger.jsx:713), [NewExpenses.jsx:1514](../client/src/components/Expenses/NewExpenses.jsx:1514) (+1768, 1875, 1961, 1986), the two adjustment editors in [RecordAdjustmentsTab.jsx:313](../client/src/components/adjustments/tabs/RecordAdjustmentsTab.jsx:313) and 324; RouteModal closes on overlay mousedown.
* **Fix:** follow the shared Modal's own rule (`closeOnOverlay={false}` for forms) or confirm when dirty. **Effort:** S–M. **Risk:** L.

**UI-007 · Route popups unmount and reload the page behind them** — *B*
* Opening any `ModalLink` popup (16 routes) replaces the page; closing remounts it. Purchase History: blank for 24.3 s after closing *Purchase Details*.
* **Fix:** the standard React Router "modal route" pattern – render `<Routes location={state?.backgroundLocation || location}>` and a second `<Routes>` for the modal. **Effort:** M. **Risk:** M (touches App.js routing; test every modal route and direct links).

**UI-008 · Failed login error is never shown** — *B*
* [api.js:31](../client/src/api.js:31) treats the login 401 like an expired session and hard-reloads `/login`; [Login.jsx:55](../client/src/components/Login.jsx:55)'s popup is destroyed and the username cleared.
* **Fix:** skip the redirect for `/login` (and `/change-password`) requests. **Effort:** S. **Risk:** L. Keep the lockout rules unchanged.

**UI-009 · Pages clip content at phone/tablet widths** — *B*
* Petty Cash (balance "LKR 14…" cut off; also at 768), RM Wastage add (also 768), Department Return add (also 768), Opening Balance History, Bank Charges, Wastage Report, Last Issue Date at 375; New Expenses and New Purchase at 320.
* **Fix:** wrap wide tables in a horizontal scroller; let summary cards and form grids wrap; never rely on `main { overflow-x: hidden }` to hide overflow. **Effort:** M. **Risk:** L.

**UI-010 · Tables and filters clipped at 1024 px** — *B*
* Purchase Report "Total Amount" (779/613), Purchase Returns History "Status" + "Actions" (968/705) – same `.table-container` cause as UI-001. Cash and Bank Ledger "Direction" select at x 1047–1197 and "Transaction type" ending at 1037 in a 1024 px viewport (`flex-wrap: nowrap` in [FinanceLedger.css](../client/src/components/Finance/FinanceLedger.css)).
* **Fix:** as UI-001 plus allow the filter row to wrap. **Effort:** S. **Risk:** L.

**UI-011 · Sidebar groups not keyboard-operable** — *B*
* [NavigationBar.jsx:210](../client/src/components/NavigationBar.jsx:210), 239, 265, 327 (dropdown headers) and 439–511 (module items) are `<div onClick>`.
* **Fix:** `<button type="button" aria-expanded aria-controls>`. **Effort:** S. **Risk:** L (check `NavigationBar.test.jsx`).

**UI-012 · 649 class names without CSS; primary buttons and whole screens unstyled** — *S (scan) + B (RM Issue)*
* "Save Issuance" measured 95 × 14 px with 0 padding (`.btn-submit` exists nowhere). Same class on Save Wastage / Save Return; `.ob-btn-submit` on Opening Balance; 76 `erp-*` classes on Edit Wastage; Purchase History mobile filter sheet, FAB and skeleton; Settlement modals; ViewTransfer.
* **Fix:** map these to existing shared classes (`btn btn-primary`, `page-shell`, `table-responsive` …) screen by screen; add a CI check that fails on unknown class names (the scan script in §19). **Effort:** L overall, S per screen. **Risk:** L–M.

**UI-013 · Form controls without programmatic labels** — *B*
* 55 of 75 pages; every legacy popup measured; all list search boxes.
* **Fix:** `htmlFor`/`id` pairs (or wrap inputs in `<label>`); `aria-label` for search boxes. **Effort:** M. **Risk:** L.

### P2 – Medium

| ID | Issue | Evidence | Fix | Effort / Risk |
|---|---|---|---|---|
| UI-014 | Phone menu button unstyled: full-height 17.5 px ≡ strip, also visible on desktop ([NavigationBar.jsx:404](../client/src/components/NavigationBar.jsx:404); `.mobile-nav-toggle` has no CSS) | B | Style as a fixed 44 × 44 button in a top bar on ≤ 767 px; hide above | S / L |
| UI-015 | Cutlery Add/Edit Transfer, Purchase, Damage and View Damage render inline, not as overlays | B | Move to shared `<Modal size="xl">` | M / L |
| UI-016 | In-hand details "drawer" renders inline at the top of the page | B (DOM) | `<Modal size="drawer">` | S / L |
| UI-017 | Legacy popups: no Escape (18 of 30 opened), focus not moved in, no scroll lock; no popup traps Tab | B | Migrate to shared Modal; add Tab trap to Modal | M / L |
| UI-018 | Popup validation message out of view; single-message validation; no `aria-invalid` | B (Cash Received) | Show the error at the top/next to the field, scroll it into view, mark fields | S / L |
| UI-020 | Token contrast failures: muted text 2.89:1 (78 uses), warning 2.94:1, accent-dark 3.56:1, placeholder 2.43:1, input border 1.25:1 | C | Darken `--color-text-tertiary` to ≈ #66788a (≥ 4.5:1), warning text ≈ #946010, borders ≈ #9aaab8 for inputs | S / L |
| UI-021 | Very large unpaginated tables and a 2,500-option select | B | Server/client pagination (pattern exists in 14 components); virtualised or async select | M / M |
| UI-022 | Small / unnamed icon buttons (13–18 px; 156 unnamed on Cutlery Assets; emoji buttons on Damages) | B | 32–44 px hit area, `aria-label` on every icon button | S / L |
| UI-023 | Inconsistent formats: "Rs." (137) vs "LKR" (51); `toFixed(2)` without grouping (50) e.g. "Rs. 387823.89" vs dashboard "Rs. 682,310"; dates as "Oct 13, 2026", "2026-08-28", "31/12/2025", "13 October 2026" | B + S | Use `utils/formatters.js` (`formatCurrency`) everywhere; add one `formatDate` | M / L |
| UI-024 | Route popups show duplicate titles and two close buttons | B | Hide the inner page header when rendered inside `RouteModal` (context flag) | S / L |
| UI-025 | Purchase History blank for 10–24 s while loading (skeleton unstyled) | B | Style the skeleton or use `EmptyState`/spinner; also UI-007 | S / L |
| UI-026 | Notifications: blocking dialog for routine success; errors auto-dismiss after 5.5 s; 27 `window.alert` calls in reports/cutlery; "PDF generation feature coming soon!" buttons in Purchase Details and Purchase VAT Report | S + B | Non-blocking toasts with `role="status"` for success; persistent inline errors; remove or hide unfinished buttons | M / L |
| UI-027 | z-index scale fragmented (21 values up to 2,147,483,647); shared dialogs at 1050 would open under legacy (99,999) or route (2,147,483,000) popups | S – **Suspected** | One scale in tokens (§16) | S / M |
| UI-028 | View-only (QB): button hiding by text matching; forms remain visible without Save; 403 shown with `window.alert` | S | Render read-only variants of entry forms (or hide the form) using `canWrite`; inline notice instead of alert | M / M |

### P3 – Low

| ID | Issue | Evidence | Fix |
|---|---|---|---|
| UI-019 | Cash/Bank Received label both "Receive Type \*" and "Other Ledger \*" although exactly one is allowed (a hint below explains it) | B + S | Show as one required choice ("Receive Type or Other Ledger \*") |
| UI-029 | Heading hierarchy: `<h1>` on only 15 of 76 pages; Bank Transfer has no heading | B | `PageHeader` renders the page `<h1>` everywhere |
| UI-030 | CSS architecture debt (§9) | S | §17 |
| UI-031 | Tailwind configured but unused | S | Remove from PostCSS/devDependencies when convenient (separate change) |
| UI-032 | Dead `SettlementModal.jsx` (imports a missing CSS file); `.ipm-*`/`.pnm-*` defined in each other's CSS files | S | Delete dead file; rename CSS files to match |
| UI-033 | `<Modal>` effect depends on `onClose` identity – when a parent re-renders while open, focus jumps back to the first field ([Modal.jsx:36](../client/src/components/common/ui/Modal.jsx:36)) | S – **Suspected** (not reproduced) | Keep `onClose` in a ref |
| UI-034 | Change Password input has `minLength="6"`, the rule (client and server) is 8 ([ChangePassword.jsx:90](../client/src/components/ChangePassword.jsx:90)) | S | Set `minLength={8}` and show the rule as helper text (rule itself unchanged) |
| UI-035 | RM Issue: item column ~95 px, placeholder wraps over 3 lines while "Current stock" takes more width | B | Give item column `min-width: 260px` |
| UI-036 | Long popups at 375 px: footer scrolls away (Employee Save at y 996 px) | B | Sticky footer in popup shell |
| UI-037 | Items delete confirmation: title "Delete this?" and text says "permanently remove" then "record will remain in the database as deleted" | B + S | "Delete item "X"? It will be hidden from lists and reports." |
| UI-038 | API base URL hard-coded in `api.js` | S | `process.env.REACT_APP_API_URL` |

**Totals:** P0 = 3, P1 = 10, P2 = 14, P3 = 11 → **38**.
Confirmed in browser (B, alone or with S): 27. Source-confirmed only: 7. Computed: 1. Suspected: 2 (UI-027, UI-033). Mixed S + partial B: 1 (UI-026).

---

## 16. Suggested shared design system

Build on what exists (`tokens.css`, `common/ui`) – no new framework.

**Tokens to add or tighten**

```css
/* z-index – one scale, used everywhere */
--z-sticky: 10; --z-sidebar: 100; --z-dropdown: 1000;
--z-modal: 1100;      /* RouteModal, Modal, all legacy overlays */
--z-popover: 1200;    /* react-select menuPortal, date pickers inside modals */
--z-toast: 1300;      /* Popup / notifications */

/* breakpoints (documented; CSS media queries use these literals) */
/* 480 phone · 768 tablet · 1024 small laptop · 1366 laptop · 1600 wide */

/* accessible text/borders */
--color-text-tertiary: #66788a;     /* ≥ 4.5:1 on white */
--color-warning-text:  #8a5a0e;     /* ≥ 4.5:1 */
--color-input-border:  #9aaab8;     /* ≥ 3:1 */
--touch-target-min: 40px;
```

**Components (all already partly present)**

| Component | Status | Action |
|---|---|---|
| `Modal` (sm/md/lg/xl/drawer) | exists, good | Add Tab trap; stable `onClose`; sticky footer; `--z-modal` |
| `ConfirmDialog` / `useConfirm` | exists, good | Use for every destructive/financial confirmation and replace `window.confirm` |
| `Toast` | missing | Non-blocking success/info with `role="status"`; keep blocking `Popup` only for errors that need acknowledgement |
| `PageHeader` | exists | Make it render the page `<h1>`; use on every page |
| `DataTable` wrapper | missing | `overflow-x: auto`, sticky header, optional sticky Actions column, built-in pagination and empty state |
| `FormField` | missing | Label + control + hint + error with `htmlFor`, `aria-describedby`, `aria-invalid` |
| `Button` classes | `.btn` + variants exist in `buttons.css` | Map `.btn-submit`, `.ob-btn-submit`, `.erp-btn-*`, `.em-btn-*`, `.ipm-btn-*` … to them |
| `Select` | `select.css` | One `menuPortal` style with `zIndex: var(--z-popover)` |
| Formatters | `utils/formatters.js` | Use `formatCurrency` / add `formatDate` everywhere |

---

## 17. Recommended CSS and component architecture

1. **Keep plain CSS + tokens.** Replacing the styling stack is not needed.
2. **Layer order:** tokens → base → shared components (`styles/components/*`, `common/ui/ui.css`) → page CSS scoped under one root class per page (`.cash-ledger-page …`). Page CSS must not define global selectors such as `.btn`, `.modal-overlay`, `.form-group`, `.table-container`.
3. **Retire stub files** that only `@import` global sheets; import shared sheets once from `index.css`.
4. **Popups:** migrate in this order – Finance `sl-modal`/`cl-modal` (financial data), purchase payment popups, Cutlery forms, history/report detail popups – onto `<Modal>`; delete each family's selectors from `legacy-dialogs.css` as it moves (the file already says so).
5. **Route popups:** background-location routing (UI-007), RouteModal on the shared z-scale, Escape aware of nested widgets.
6. **Guardrails:** a CI script that fails on JSX class names with no CSS rule (scan in §19), on new `!important` outside `print.css`/`select.css`, and on hex colours outside `tokens.css`.

---

## 18. Before-and-after recommendations for major issues

| Issue | Before | After |
|---|---|---|
| UI-001 Outstanding Bills | `.table-container { overflow: hidden }` – Actions column invisible ≤ 1440 px | `.table-container { overflow-x: auto }` + sticky right Actions column; all columns reachable at 1024 |
| UI-002 Add Asset | Static overlay portaled below the layout, body scroll locked | `<Modal title="Add New Asset" size="md">` with the same fields |
| UI-004/005 Add New Purchase | Menu at z 10000 under overlay at 2.1 billion; Escape closes form | Menu at `--z-popover` above `--z-modal`; Escape closes only the menu; dirty-form prompt on close |
| UI-006 Finance popups | One backdrop click wipes the typed amount | Backdrop inert for forms; Cancel/×/Escape (with "Discard changes?" when dirty) |
| UI-007 Route popups | List unmounted; 24 s reload on close | List stays mounted under the popup; close is instant and keeps filters/scroll |
| UI-008 Login | Reload, no message | Inline "Incorrect username or password" (or lockout message) under the form, username kept |
| UI-012 Save buttons | Bare 14 px text "Save Issuance" | `btn btn-primary` with disabled/loading state (also fixes UI-003) |
| UI-011 Sidebar | `<div onClick>` headers | `<button aria-expanded>` headers reachable with Tab, toggled with Enter/Space |
| UI-014 Phone menu | 17 px ≡ strip mid-screen | 44 × 44 menu button in a slim top bar with the page title |

---

## 19. Regression testing checklist

**Automated (suggested)**

* [ ] Class-name scan: no JSX class without a CSS rule (Node script used in this audit: collect `className` tokens from `*.jsx`, collect `.class` selectors from `*.css`, diff).
* [ ] RTL: double-click on Save in AddWastage / AddReturn / AddOpeningBalance → one API call.
* [ ] RTL: Modal – Tab from last control returns to first; Escape closes; focus returns to trigger.
* [ ] RTL: RouteModal – Escape with an open react-select menu closes only the menu.
* [ ] RTL: Login – mocked 401 shows an inline error and does not change `window.location`.
* [ ] RTL: NavigationBar – module headers are buttons with `aria-expanded`.

**Manual / browser (each at 375, 768, 1024, 1366, 1440)**

* [ ] Outstanding Bills, Purchase Report, Purchase Returns History: every column visible or scrollable; Make Payment clickable.
* [ ] Cash & Bank Ledger: all filters visible.
* [ ] Petty Cash, Add Wastage, Add Return, Opening Balance History, Bank Charges, Wastage Report, Last Issue Date: no clipped content.
* [ ] Add New Purchase (from Purchase History): item menu visible and selectable by mouse and keyboard.
* [ ] Every popup in the inventory: opens in viewport, primary action reachable, Escape/backdrop behaviour as designed, no data loss.
* [ ] Cutlery Add Asset / Transfer / Purchase / Damage open as overlays.
* [ ] Purchase History: open and close Purchase Details – list stays, no reload.
* [ ] Keyboard-only: open every sidebar group and reach every page.
* [ ] QB login: entry forms read-only or hidden, no `alert()`.

---

## 20. Implementation roadmap

| Phase | Scope | Issues | Effort | Dependencies / risk |
|---|---|---|---|---|
| **1 – Critical & business-impacting** | Table wrapper overflow; Add Asset to Modal; submit locks on stock forms; login error; z-index of select menus; Escape handling in RouteModal | UI-001, 002, 003, 004, 005, 008, 010 | ~2–3 days | Low risk; each is local. `.table-container` change needs a pass over every page using it |
| **2 – Major popup & UX problems** | Backdrop data loss; background-location routing; finance popups to `<Modal>`; unstyled primary buttons and Edit Wastage; phone clipping on 8 pages | UI-006, 007, 009, 012 (primary screens), 015, 016, 017, 018, 025 | ~1.5–2 weeks | Routing change (UI-007) is medium risk – test all 16 modal routes and deep links |
| **3 – Design-system consistency** | z-index & breakpoint tokens; `DataTable`, `FormField`, `Toast`; formatters; remove global selectors from page CSS; retire stubs and Tailwind; class-name CI check | UI-012 (rest), 020, 021, 023, 024, 026, 027, 030, 031, 032 | ~2–3 weeks, incremental | Visual regressions possible – compare screenshots per page |
| **4 – Responsive & accessibility** | Sidebar buttons; labels; icon-button names and target size; headings; mobile top bar; Tab trap; view-only read-only forms | UI-011, 013, 014, 022, 028, 029, 033, 036 | ~1–2 weeks | Low risk |
| **5 – Polish & maintainability** | Wording, column widths, password hint, API base URL | UI-019, 034, 035, 037, 038 | ~1–2 days | Low risk |

---

## 21. Untested areas and technical limitations

* **Collection** and **FG Production** pages and popups: static review only (opening them contacts the live POS/Restaurant sites and, for Collection, writes pending rows).
* **8 of 9 `:id` routes** (Edit Purchase, Edit Item, Edit Issuance, Edit Wastage, Edit Adjustment, Asset view/edit, Transfer view) were not opened; their issues come from source (UI-004 for Edit Purchase/Issuance; UI-012 for Edit Wastage).
* **No submissions**: success/failure feedback, duplicate-submit behaviour, API timeouts and server validation messages were not exercised.
* **One role** signed in (Super Admin). QB, Accountant, Finance, Stores and Admin experiences are source-reviewed only.
* **Viewports 430 px and 1920 px** not measured; 320/768/1366/1440 only spot-checked.
* Popups needing data or a selection that was not present were not opened: Card Ledger *Realise*, Petty Cash *View*, Stores Adjustments details, Issuance details, Expense Summary breakdown, New Expenses payment/credit-note popups, purchase payment popups (*Pay Now*, *Invoice Payment*, *Settle Now*), Purchase Return settlement, Recipes popups, Collection dialogs, Edit/Delete Employee, Inhand approve/reject confirmations, global notification popup (it is destroyed on login failure; no safe trigger found).
* Screen-reader testing was not performed; accessibility results come from DOM inspection and computed contrast, not from assistive technology. This is not a WCAG conformance claim.
* No automated visual-regression or performance profiling tools were available; timings are wall-clock measurements in a development build.
* Screenshots were taken during testing for verification but were not added to the repository.

---

## 22. Final assessment and audit coverage summary

### Scores

| Category | Score | Basis | Issues | Tested / not tested |
|---|---|---|---|---|
| Visual design consistency | **5** | Good tokens and shared look; undermined by 649 unstyled classes, 17 popup styles, duplicate headers, mixed formats | P1: 1 · P2: 3 · P3: 2 | 76 pages at 1024 |
| CSS quality & maintainability | **4** | 131 `!important`, 21 z-index values, 21 breakpoints, globals redefined in up to 16 files, unused Tailwind, dead files | P1: 1 · P2: 1 · P3: 4 | Full static scan |
| UX & usability | **5** | Clear navigation and confirmations; failed-login silence, data loss on backdrop/Escape, blank reloads, huge tables | P1: 4 · P2: 4 · P3: 3 | Super Admin flows, no submissions |
| Popup & modal quality | **3** | Shared Modal is good but rarely used; one popup unusable, dropdown behind popup, data loss, inline "popups" | P0: 1 · P1: 4 · P2: 6 · P3: 2 | 30 of 89 opened |
| Responsive design | **5** | Most pages fit 375 px; but financial columns hidden up to 1440 px and 8 pages clip | P0: 1 · P1: 2 · P2: 1 · P3: 1 | 69 routes at 375, spot checks elsewhere; 430/1920 not tested |
| Accessibility | **3** | Focus ring and shared Modal good; keyboard nav blocked, labels missing broadly, low-contrast tokens, small targets | P1: 2 · P2: 4 · P3: 1 | DOM + computed; no AT testing |
| Functional UI reliability | **5** | Pages render without console errors; but invisible loading, unstyled actions, stock double-submit risk | P0: 2 · P1: 2 · P2: 1 | No submissions |
| User-role experience | **6 (provisional)** | Central, consistent rule table and server enforcement; QB UX relies on text-matching | P2: 1 | **Source only – excluded from the overall score** |

**Overall: 4.3 / 10** = unweighted mean of the seven browser-tested categories (5 + 4 + 5 + 3 + 5 + 3 + 5) / 7. The role category is excluded because it was not tested in the browser.

### Coverage summary

| | |
|---|---|
| Routes discovered / inspected in browser | 87 (+ login) / 76 (+ login) |
| Modules discovered / audited | 13 / 13 (11 in browser, 2 source-only) |
| Popup / overlay entries discovered | 89 |
| Popups opened through their real trigger and visually inspected | 30 (plus the shared `Modal` and `RouteModal` shells exercised through them, and 5 route forms inspected as full pages) |
| Popups tested at multiple viewport sizes | 15 |
| Forms / interactions functionally tested | 3 validations, 30 popup interaction probes, 2 data-loss reproductions, 1 Escape reproduction, keyboard sidebar test |
| Findings | 38 (P0 3 · P1 10 · P2 14 · P3 11) |

### Most common problems

* **CSS:** class names without styles; `overflow: hidden` on wrappers of wide tables; selectors redefined globally; arbitrary z-indexes.
* **UX:** popups that close (and lose data) on backdrop/Escape; route popups that reload the page; validation feedback that is not visible; large unpaginated lists; inconsistent currency/date formatting.

### Recommended order of remediation

Phase 1 (UI-001 → UI-003 → UI-004/005 → UI-008 → UI-010), then Phase 2 popups and phone clipping, then the design-system consolidation, then accessibility, then polish (§20).

### Confirmation

No application code, CSS, configuration, database record, role, permission or business logic was modified during this audit. The only files created are this report and [bsms-ui-ux-popup-inventory.md](bsms-ui-ux-popup-inventory.md). No form was submitted and no record was created, changed or deleted. The local QA test login was used only to view pages; passwords and keys are not reproduced in this report.
