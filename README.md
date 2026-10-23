<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Node.js-Express_4-339933?logo=node.js&logoColor=white" alt="Node.js and Express 4" />
  <img src="https://img.shields.io/badge/MySQL%20%2F%20MariaDB-database-4479A1?logo=mysql&logoColor=white" alt="MySQL / MariaDB" />
  <img src="https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-orange" alt="JWT and bcrypt" />
</p>

# Bakery Stock Management System (BSMS)

A full-stack web application for running a bakery business's **stock, production, expenses and finance** in one place. It covers raw-material purchasing and stock, finished-goods (FG) production recipes and costing, cutlery assets, an expenses module, cash and bank ledgers, VAT and analyst reports, and stock adjustments. Access to every page and API call is controlled by **role-based permissions**, so each user only sees the modules they are allowed to use.

---

## Table of contents

- [Bakery Stock Management System (BSMS)](#bakery-stock-management-system-bsms)
  - [Table of contents](#table-of-contents)
  - [Tech stack](#tech-stack)
  - [Modules and features](#modules-and-features)
    - [Management (master data)](#management-master-data)
    - [Raw Materials](#raw-materials)
    - [Expenses](#expenses)
    - [Finance](#finance)
    - [Cutlery](#cutlery)
    - [FG Production](#fg-production)
    - [Adjustments](#adjustments)
    - [VAT](#vat)
    - [Analyst](#analyst)
    - [Audit Trail](#audit-trail)
    - [Period Close](#period-close)
    - [Settings / Admin](#settings--admin)
  - [Roles and access control](#roles-and-access-control)
  - [Dashboard](#dashboard)
  - [Project structure](#project-structure)
  - [Getting started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [1. Clone](#1-clone)
    - [2. Create the database](#2-create-the-database)
    - [3. Configure the server](#3-configure-the-server)
    - [4. Install and start the API](#4-install-and-start-the-api)
    - [5. Create the role and privilege tables (once)](#5-create-the-role-and-privilege-tables-once)
    - [6. Install and start the client](#6-install-and-start-the-client)
  - [Configuration reference](#configuration-reference)
    - [Server `.env`](#server-env)
    - [Values set in code](#values-set-in-code)
  - [Database and schema management](#database-and-schema-management)
  - [Background processing and integrations](#background-processing-and-integrations)
  - [Using the system](#using-the-system)
  - [Testing](#testing)
  - [Deployment notes](#deployment-notes)
  - [License and author](#license-and-author)

---

## Tech stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19 (Create React App / `react-scripts` 5), React Router 7, Axios, Chart.js with `react-chartjs-2`, `react-select`, Swiper, Font Awesome and `react-icons`, `dayjs` / `date-fns` |
| **Reports and export** | `xlsx` (Excel export) and `jspdf` + `jspdf-autotable` (PDF export), used by a number of report pages; some pages also print through the browser |
| **Backend** | Node.js, Express 4, `mysql2` (connection pool), `jsonwebtoken`, `bcrypt`, `multer`, `cors`, `dotenv`, `uuid`; `nodemon` for development |
| **Database** | MySQL-compatible. The bundled dump comes from **MariaDB 10.4**, and the startup schema code uses `ADD COLUMN IF NOT EXISTS`, which is MariaDB syntax, so **MariaDB 10.4+ is the supported target** |
| **Auth** | Username + password login, bcrypt-hashed passwords, JWT bearer tokens (24 h expiry) |
| **Testing** | Node's built-in test runner (`node:test`) on the server; Jest / React Testing Library (via `react-scripts test`) on the client |

---

## Modules and features

The left-hand navigation is grouped into the modules below. Which of them a user sees depends on their role (see [Roles and access control](#roles-and-access-control)).

### Management (master data)
RM Items, RM Item Types, Suppliers, Departments, Companies, Payment Methods, Bank Details, Expense Types, Sub Expense Types, Expense Payees, Bank Charges Types, Receive Types, Other Ledgers, Credit Card Rate, Employee Management, and **VAT Rate Settings** (a single management-editable, system-wide VAT rate used by purchase and expense VAT calculations, VAT reports and recipe costing).

### Raw Materials
- **Purchasing**: add purchase invoices, purchase returns, and **Orders** (low-stock list, pending orders, completed orders; an order can be turned into a purchase invoice).
- **Stock movements**: RM Issue (to departments), RM Wastage, Department Return.
- **Reports**: Stock Reports, Item Wise Stock Report, Purchasing Summary / Item Detail, Purchase Report, Discounted Purchases Report, RM Issue / Wastage / Department Return summaries and item details.
- **Analysis**: Last Issued Date.
- **Supplier payments** are made against pending invoices (including multi-invoice payments), with payment history, credit settlement, outstanding-balance tracking, and an optional per-payment **discount amount** (the discount reduces the invoice balance like cash would, but never moves ledger money - it is tracked separately for reporting, see Discounted Purchases Report).

### Expenses
Petty Cash (vouchers and reimbursements), Bank Charges, **New Expenses** (bill entry, payment with partial-payment and overpayment handling, credit notes), Cash Expenses, **Hidden Expenses** (report-only records that do not post to the cash or bank books), and Expenses Reports.

### Finance
Cash Ledger and Cash Receive, Bank Ledger and Bank Receive, Cash / Bank Transfer, Bank-to-Bank Transfer, Expenses Cheque Registry, Staff Loans, and Intercompany Transaction. Cash and bank movements are recorded in a shared ledger with running balances per company (cash) and per bank account.

### Collection
A top-level **Collection** page - visible only to **Accountant, Admin and Super Admin** (full access) and **QB** (view only; approve / reject are refused by the API as well as hidden) - with **Pending**, **Completed** and **Rejected** tabs. Opening Pending, or pressing **Search** on it, makes the API pull the three POS endpoints (completed shift collections, credit payments, employee deductions) for the searched date range - the server uses the session of the Finance account obtained when it logged in to Stock Management (its typed credentials are also tried once on RAVON POS and RAVON Restaurant; only the token is kept, encrypted - no password is stored anywhere, so there is no background sync). **RAVON Restaurant** (`RAVON_RESTAURANT_API_URL`, same three endpoints) is imported the same way into the same list: each record shows its **System** (POS / Restaurant, filterable), both go through the identical approve / reject / restore and ledger posting, ids never collide (`UNIQUE (source_system, source_type, source_id)`; Restaurant ledger references are `RST-...`, POS ones unchanged) and one system failing never stops the other. When a system is not connected / expired the page shows it and offers a one-time **Connect** (password sent once, not stored) - see `server/services/integrationAuthService.js` and `migrations/031_restaurant_collections_integration_sessions.sql`. A From / To range is fetched from the POS in full (from the day before From to To plus `RAVON_POS_COMPLETION_LAG_DAYS`, because the POS dates shifts by completion) and then filtered inclusively on the collection date, so the To date is fully included and the range never depends on rows loaded earlier. Pending records post nothing. **Approve** (one, several or all) posts each payment method through the existing ledgers in one database transaction: Cash to the Cash Ledger, Bank / Online to the chosen company bank account, Card to the Card Ledger as Pending card transactions - for a shift, **one Card Ledger entry per individual POS card payment** (`card.transactions[]`: own date, POS receipt / order reference and details; never the shift's card total as one line; each linked in `collection_card_payments` under a unique POS key so it can never be posted twice; approval is refused when the payments do not add up to the card total - see the shift's "N payments" view and `migrations/028_collection_card_payments.sql`), AR to the **AR Account** Other Ledger and Short / Excess to the **Short/Excess Account** Other Ledger; an employee deduction credits the Short/Excess Account and is linked to its shift. **Reject** needs a reason and posts nothing. Each shift is stored with its Shift Reference (`shift_id-shift_no`, e.g. `211-0104`) and the existing department its POS branch maps to (`"Cafe - M"` -> `Cafe`, see `server/services/departmentMapper.js`); records from **every** POS branch the POS account can see are imported - the user's own department is never a filter (the POS limits each account to its `branch_ids`, so the server must use the POS `finance` account; the page warns when it cannot see every branch); POS `MASActive` is stored and shown as **MAS Intimo** (the original name stays in the record's raw POS payload); a branch that matches no department is still imported and shown as *Unmapped*, but cannot be approved until it maps. All three tabs share server-side filters - Search, Source, Department, From / To date - applied together when **Search** is pressed (`GET /api/collections?status=&search=&source=&department_id=&from_date=&to_date=&page=&limit=`). The same POS record can never be approved twice. Completed and Rejected are read from the BSMS database. See `server/services/collectionService.js` and `migrations/027_collections.sql`.

### Cutlery
Locations, Assets (with image upload), Transfers, Purchasing, Damages, and a Stock Report.

### FG Production
Recipes and FG Recipes Reports. Finished-goods items for recipes come from an external POS system (see [Integrations](#background-processing-and-integrations)).

### Adjustments
Stores balance adjustments, an Adjustment Summary Report, and **Inhand (Cash / Cheque)** adjustments with an approve / cancel workflow that posts to the finance ledgers.

### VAT
VAT Purchasing Report, **VAT Exempt Purchasing Report** (purchase item lines filtered by date, company, supplier, item and VAT status, defaulting to items marked VAT Not Applicable, with Excel export), and Return VAT Report.

### Analyst
Income, Expenses and Balance Sheet views.

### Audit Trail
**Admin and Super Admin only.** Every sign-in, sign-out, password change, data change and refused request, newest first, with filters (event type: sign-in/out, data changes, access denied, POS/Restaurant sync) and detail view. Rows are written server-side (`server/services/auditLog.js`) and can never be edited or deleted from the UI (`audit_log` table, migration `037_audit_log.sql`).

### Period Close
**Admin and Super Admin only.** Only the current and previous month stay open for posting; older months are closed so a finished month's reports never change after the fact (`PERIOD_OPEN_MONTHS`, default 2). To correct a closed month, an Admin submits a re-open request with a reason; a **Super Admin** approves it for a limited number of hours (default 24, up to 168); while open, only an **Admin** may post or edit inside it. Enforced server-side in `server/services/periodLock.js` (`periodGuard` middleware refuses writes dated into a closed month) with no bypass. See migration `038_period_reopen_requests.sql`.

### Settings / Admin
Change Password. The **Dashboard** link is also reachable from here.

---

## Roles and access control

Access is enforced in **three places**: the navigation, the React routes, and the Express API.

| Role (`users.role`) | Modules |
| --- | --- |
| **Store Keeper** (Stores) | Management, Raw Materials, FG Production |
| **Accountant** | Management, Raw Materials, Finance, Expenses, FG Production, VAT |
| **View Only** (QB) | Management, Raw Materials, FG Production, Finance, Expenses, VAT, **read-only** |
| **Finance** | Expenses only |
| **Admin** | Everything except Analyst; Audit Trail and Period Close |
| **Super Admin** | Everything, including Analyst, Audit Trail and Period Close |

Two logins hold the Accountant role: `accountant1` (Accountant 1) and `accountant2` (Accountant 2 - the former `accountant` login, renamed in place at server start-up so its id, password and history are kept). Both get exactly the Accountant grants above.

All roles can also reach the Dashboard and Change Password. Roles that exist in the `users` table but have no privilege definition (for example `Staff`, `Manager`, `User`) get no module access.

**How it works**

- **Privileges live in the database.** Tables `roles`, `permission_modules` and `role_permissions` define which role may use which module, and `users.role_id` links a user to a role (migration `025_roles_permissions.sql`). A role can be flagged `is_view_only` or disabled with `status = 0`. Adding a user with an existing privilege, or a whole new role, needs only database rows.
- **Built-in defaults.** `server/config/rolePermissions.js` holds the same table as a default and as the seed for the migration. It is used when the roles tables are missing (so the app still runs before migration `025`), and for built-in roles the table does not mention. The path-to-module rules (which URL and API prefix belongs to which module) are defined here too. `client/src/config/rolePermissions.js` mirrors it for the UI, and a test checks that the two copies agree.
- **API gate.** Every `/api` route except login, change-password, refresh-token and `/me` passes through `authenticate` and `authorizeApi`. A request for a module the role does not hold returns **403**; unknown paths are denied; view-only roles are rejected on every `POST` / `PUT` / `PATCH` / `DELETE`. Role grants are cached for about 30 seconds (`PERMISSION_CACHE_TTL_MS`).
- **Login response.** `POST /api/login` returns `{ user, permissions, modules, viewOnly }`; `GET /api/me` returns the same shape and is called when the app loads, so a privilege change applies without logging in again.
- **Frontend.** The sidebar, route guard (shows an **Access Denied** page for blocked URLs), dashboard sections and write controls are all driven from those permissions. For view-only users, add / edit / delete / pay style controls are hidden. No code compares usernames.

---

## Dashboard

The dashboard is built from the signed-in user's modules rather than being the same for everyone:

- **Header**: "Welcome, *username*" (taken from the login response), the user's role, a *View only* badge when applicable, and the modules they hold.
- **Expenses section**, shown to users with the Expenses module: cards for total, paid, pending and outstanding expenses, petty cash, cash expenses and open credit notes / overpayments (current month unless stated), a 6-month trend, top expense types for the month, and the latest 8 entries. The data comes from one read-only endpoint, `GET /api/expenses/dashboard-summary`.
- **Operations section**, shown to users with Raw Materials or FG Production: key 7-day numbers (low stock, purchases, pending payments for users with Finance, issues, wastage), quick actions, an activity trend chart, low-stock list, top issued / wasted items, and (with FG Production) a recipe cost versus selling price chart.

A user with none of these modules sees a short message instead.

---

## Project structure

```
Bakery-Stock-Management/
├── client/                         # React application
│   ├── public/
│   └── src/
│       ├── App.js                  # routes and route wrappers
│       ├── api.js                  # Axios instance (base URL, token, 401 handling)
│       ├── config/rolePermissions.js   # client copy of the permission rules
│       ├── hooks/usePermissions.js     # permission helpers for components
│       ├── components/
│       │   ├── NavigationBar.jsx, Layout.jsx, Login.jsx, Dashboard.jsx
│       │   ├── dashboard/          # Expenses and Operations dashboard sections
│       │   ├── common/             # route guard, Access Denied, view-only guard, popups
│       │   ├── RawMaterial/, purchase/, issuance/, wastage/, returns/, purchasereturn/,
│       │   │   supplierPayments/, Items/, Suppliers/, OpeningBalance/, Analysis/
│       │   ├── FGProduction/, Cutlery/
│       │   ├── Expenses/, Finance/, adjustments/, Income/, Analyst/
│       │   ├── report/             # stock, purchasing, VAT and other reports
│       │   └── Employees/, admin/, ChangePassword.jsx
│       └── utils/, css/, images/
├── server/                         # Express API
│   ├── server.js                   # app setup, route mounting, startup
│   ├── config/
│   │   ├── db.js                   # MySQL pool + self-migrating schema functions
│   │   ├── rolePermissions.js      # default role/module grants and API rules
│   │   └── permissionStore.js      # loads role grants from the database (cached)
│   ├── middleware/                 # authenticate, authorizeApi, readOnly, moduleAccess, ...
│   ├── routes/                     # one router per area
│   ├── controllers/                # request handlers and business logic
│   ├── services/                   # cheque release, POS integration, RM stock, inhand posting, ...
│   ├── utils/                      # ledger helpers, unit conversion, expense classification, ...
│   ├── migrations/                 # numbered .sql files (see "Database and schema management")
│   ├── scripts/                    # createFinanceUser.js and diagnostics
│   ├── tests/                      # node:test suites
│   ├── uploads/                    # uploaded images (cutlery assets)
│   └── migrate_*.js                # one-off migration scripts
├── bakery system db.sql            # baseline database dump
└── README.md
```

---

## Getting started

### Prerequisites

- **Node.js** and **npm** (no `engines` field is declared; a current LTS release is recommended)
- **MariaDB 10.4+** (or a compatible MySQL server; see the note under [Tech stack](#tech-stack))

### 1. Clone

```bash
git clone https://github.com/nawanja09/Bakery-Stock-Management.git
cd Bakery-Stock-Management
```

### 2. Create the database

Create an empty database and import the baseline dump (it was exported from a database named `backery_system`, and does not contain `CREATE DATABASE` / `USE` statements, so use any name as long as `DB_NAME` matches):

```bash
mysql -u root -p -e "CREATE DATABASE backery_system CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
mysql -u root -p backery_system < "bakery system db.sql"
```

You can also import it with phpMyAdmin or MySQL Workbench. See [Database and schema management](#database-and-schema-management) for how the newer tables get created.

### 3. Configure the server

```bash
cd server
cp .env.example .env
```

Fill in `.env` (see the [configuration reference](#configuration-reference)). **Do not commit `.env`.**

### 4. Install and start the API

```bash
npm install
npm start          # runs: nodemon server.js
```

The API listens on `http://localhost:5000` by default (`PORT`). On startup it applies its self-migrating schema functions and starts the cheque release processor.

### 5. Create the role and privilege tables (once)

```bash
mysql -u root -p backery_system < migrations/024_add_finance_role_and_user.sql
mysql -u root -p backery_system < migrations/025_roles_permissions.sql
```

`024` adds the `Finance` role value and the `finance` user (stored as a bcrypt hash). `025` creates `roles`, `permission_modules`, `role_permissions` and `users.role_id`, seeds the built-in roles, and links existing users to their role. Both are safe to re-run. Until `025` is applied the app falls back to the built-in grants.

To create or reset the `finance` user with a password of your choice instead of running `024`:

```bash
node scripts/createFinanceUser.js '<password, 8+ characters>'
```

### 6. Install and start the client

```bash
cd ../client
npm install
npm start
```

The client runs at `http://localhost:3000`. Log in with an account that exists in your `users` table.

---

## Configuration reference

### Server `.env`

| Variable | Purpose |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Database connection |
| `PORT` | API port (default `5000`) |
| `JWT_SECRET` | Secret used to sign and verify JWTs (required, 32+ bytes, must differ from `POS_SESSION_SECRET` - the server refuses to start otherwise, see `config/secrets.js`). Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `POS_SESSION_SECRET` | Required alongside `JWT_SECRET`; encrypts the stored RAVON POS / Restaurant session tokens (`pos_sessions`, AES-256-GCM) |
| `ACCOUNTANT1_PASSWORD` | Optional initial password for the `accountant1` login, used only when that user is first created. If unset, a random password is generated and printed once in the server log |
| `RAVON_POS_API_URL`, `RAVON_RESTAURANT_API_URL` | Base URLs of the Ravon Bakers POS and Restaurant systems (examples: `https://pos.ravonbakers.lk`, `https://restaurant.ravonbakers.lk`). Leave the Restaurant one empty to skip it (reported "not configured"; POS unaffected) |
| `RAVON_POS_ITEMS_ENDPOINT` | POS finished-goods items endpoint (example: `/api/items-list`) |
| `RAVON_POS_INTEGRATION_PRIVATE_KEY`, `RAVON_RESTAURANT_INTEGRATION_PRIVATE_KEY` | **Server key mode (recommended).** Each system's private ECDSA signing key (generate a pair per system with `node scripts/generateIntegrationKeys.js`; the matching public key goes into that system's own `BSMS_INTEGRATION_PUBLIC_KEYS`). Every request is signed with a nonce + timestamp (5-minute replay window) instead of any user's password, so the Collection page works with **no** POS / Restaurant login at all, for every branch |
| *(no credentials; per-user mode)* | With no private key set above, BSMS falls back to **per-user mode**: when a user whose role can see Collection or FG Production logs in to Stock Management, the same typed username/password are also sent once to each system's `/api/login`. Only the returned token and that user's own POS/Restaurant privileges are kept (server-side, AES-256-GCM, never sent to the browser) - the password itself is discarded, never stored, so there is no background sync. A different POS/Restaurant password is connected once from the Collection page's **Connect** action. There are **no** POS / Restaurant usernames, passwords or API keys read from the environment (`RAVON_POS_USERNAME`, `RAVON_POS_PASSWORD`, `RAVON_POS_API_KEY`, `POS_USERNAME`, `POS_PASSWORD` are not read) |
| `RAVON_LOGIN_RELAY` | Optional, per-user mode only: `on` also sends each user's typed BSMS password to POS/Restaurant `/api/login` at BSMS login. Off by default and never auto-enables itself |
| `RAVON_POS_LOGIN_ENDPOINT`, `RAVON_RESTAURANT_LOGIN_ENDPOINT`, `RAVON_RESTAURANT_TIMEOUT_MS`, `RAVON_INTEGRATION_SESSION_HOURS` | Optional: login path (default `/api/login`), Restaurant timeout (default `RAVON_POS_TIMEOUT_MS`), maximum session age in hours (default `24`) |
| `RAVON_POS_SHIFT_COLLECTION_URL`, `RAVON_POS_CREDIT_PAYMENTS_URL`, `RAVON_POS_EMPLOYEE_DEDUCTIONS_URL`, `RAVON_RESTAURANT_SHIFT_COLLECTION_URL`, `RAVON_RESTAURANT_CREDIT_PAYMENTS_URL`, `RAVON_RESTAURANT_EMPLOYEE_DEDUCTIONS_URL` | Optional full-URL overrides for the three Collection endpoints of each system |
| `RAVON_POS_COLLECTION_LOOKBACK_DAYS` | Optional: how many days back a Collection sync asks the POS for when no date range is searched (default `7`) |
| `RAVON_POS_COMPLETION_LAG_DAYS` | Optional: how many days after its closing date a shift may still be completed in the POS; a searched range is fetched up to To + this many days (default `14`, capped at today) |
| `RAVON_POS_BRANCH_DEPARTMENT_MAP` | Optional JSON for POS branch names the automatic rule cannot match, e.g. `{"Savoury": "Savory"}`. The rule itself maps `"Cafe - M"` to the existing department `"Cafe"` |
| `RAVON_POS_TIMEZONE` | Optional: time zone used to date POS timestamps (default `Asia/Colombo`) |
| `RAVON_POS_TIMEOUT_MS` | POS request timeout (example: `8000`) |
| `COLLECTION_SCHEMA_MODE` | Optional: how a POS/Restaurant record that doesn't match the verified RAVON payload shape is handled - `strict` (default) quarantines it, `warn` accepts but reports it, `off` disables the check |
| `LOGIN_MAX_FAILURES_PER_USER`, `LOGIN_MAX_FAILURES_PER_IP` | Optional login brute-force limits (`services/loginThrottle.js`): failed passwords allowed per account / per IP in 15 minutes (defaults `5` and `50`) |
| `CORS_ORIGINS` | Comma-separated browser origin(s) allowed to call the API. **Required in production** - without it only `http://localhost:3000` is allowed and a deployed client is blocked by the browser |
| `TRUST_PROXY` | Required when the API runs behind nginx / a load balancer, so the Audit Trail logs the real client IP and the per-IP login limit isn't shared by every user: `loopback`, a proxy count, or proxy address(es) |
| `PERIOD_OPEN_MONTHS` | Optional: how many months stay open for posting, counting the current month (default `2`, range `1`-`24`). Older months are closed - see [Period Close](#period-close) |
| `CASH_ALLOW_NEGATIVE` | Optional: a cash payment that would take a cash book negative is refused by default; set `on` to disable that check (e.g. while fixing opening balances) |
| `DB_NAME_TEST` | Database used only by the MySQL-backed test suites (`server/tests/db/*`), never `DB_NAME`. Must end in `_test`; create/reset it with `node scripts/createTestDatabase.js` |
| `PERMISSION_CACHE_TTL_MS` | Optional: how long role grants are cached (default 30000 ms) |
| `FINANCE_PASSWORD` | Optional alternative to the CLI argument for `scripts/createFinanceUser.js` |

### Values set in code

- **API base URL (client):** `client/src/api.js` sets `baseURL` to `http://localhost:5000/api`; production URLs are present there as commented-out lines. Change it for each environment.
- **CORS origin (server):** read from `CORS_ORIGINS` (see the configuration table above) - not hardcoded.
- **Uploads:** files are stored in `server/uploads/` and served at `/uploads`. Uploads are limited to images, 5 MB each.

---

## Database and schema management

The schema is built from several sources, so it helps to know which does what:

1. **Baseline dump**, `bakery system db.sql` (62 tables, exported from MariaDB 10.4). It does not contain every table the current code uses.
2. **Self-migrating functions** in `server/config/db.js` (`ensure…Schema()`), run on server start. They create or alter tables with `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`. Examples: item types, payment methods, soft-delete status, username login, the finance ledgers, expense/finance links, bank charge types, orders, income, cash expenses, sub-expense types, credit notes, employees, staff loans, intercompany transactions, the double-entry journal, period-reopen requests, reference locks, VAT rate settings and payment discount amounts. `chequeReleaseService.js` and `services/auditLog.js` also ensure their own schema at startup.
3. **Numbered SQL files** in `server/migrations/`. Some mirror what `db.js` applies automatically; others (for example hidden expenses, inhand adjustments, and the role/privilege tables `024` and `025`) are **not** applied automatically and must be run manually. Check the header comment of each file, and run any that your database is missing. Several numbers appear twice (for example two `001_` and two `006_` files); they are independent files.
4. **One-off scripts** in `server/` (`migrate_adjustments.js`, `migrate_purchasing_decimals.js`, `migrate_receive_types.js`), each documented as "run once" in its header, e.g. `node migrate_receive_types.js`.

Practical guidance: import the dump, start the server once so the self-migrating functions run, then apply any manual migrations your database lacks (at minimum `024` and `025` for the role system).

**Ledger convention.** Cash and bank movements share one `finance_transactions` ledger: a **debit** is money in, a **credit** is money out, and `new balance = previous balance + debit − credit`.

**Data integrity.** Nothing is hard-deleted: records are soft-deleted (`is_deleted` / `deleted_by` columns, migration `039_soft_delete_and_line_history.sql`), ledger rows are voided rather than removed, and replaced invoice/order lines are archived - every read filters `is_deleted = 0`. Every Cash/Bank posting is also mirrored into a balanced double-entry `journal_entries` / `journal_lines` pair (`utils/financeLedger.js`, `ensureJournalSchema` in `server/config/db.js`) for a trial-balance view alongside the per-account ledgers.

---

## Background processing and integrations

- **Cheque release processor.** On startup, and then every 60 seconds, the server looks for registry cheques that are not Released / Returned / Deleted and whose release date has arrived, and posts their ledger entries. Cheques move through **Pending**, **Released** and **Returned**; the Expenses Cheque Registry also tags each cheque as an **Expense** or a **Transfer**.
- **Bank-to-Cash cheque transfers.** The bank ledger is deducted when the transfer is created; the cash ledger is credited only when the cheque is released.
- **Ravon Bakers POS.** Finished-goods items for FG Production are read live from the external POS through `server/services/ravonPosService.js`, using the `RAVON_POS_*` settings. The POS is the source of truth for those items; BSMS does not keep its own FG item master for recipes. If the POS is unreachable, the FG Production pages that depend on it are affected. All POS / Restaurant calls (FG items and Collection) authenticate through `server/services/integrationAuthService.js` (`posAuthService.js` is its POS-only facade), either with a per-system signed server key (recommended - no user login involved) or with a signed-in user's own POS/Restaurant session - see [Server `.env`](#server-env) for both modes; there are no stored passwords either way. Requests are pull-based (BSMS calls RAVON; there is no inbound webhook), nonce + timestamp signed with a 5-minute replay window, and a payload that doesn't match the verified RAVON shape is quarantined rather than guessed (`COLLECTION_SCHEMA_MODE`). `node scripts/posCollectionProbe.js --unauth` (in `server/`) checks both hosts without credentials; `node scripts/posCollectionProbe.js --login restaurant` prompts for a login (nothing stored) and prints the real structure of the three Collection endpoints so the field mapping in `services/collectionMapper.js` can be checked.

---

## Using the system

1. **Log in** with your username and password. Your session token lasts 24 hours; when it expires you are sent back to the login page and returned to the page you were on after signing in again.
2. **Check the Dashboard.** It shows the sections your role is allowed to see.
3. **Set up master data** under Management: items, item types, suppliers, departments, companies, payment methods, bank details, expense types and payees, employees.
4. **Raw materials.** Record purchases (or create an Order from the low-stock list and invoice it), then pay supplier invoices from the pending-invoices view. Issue materials to departments, record wastage and department returns, and review the stock and purchasing reports.
5. **FG Production.** Maintain finished-goods recipes in the FG Production module and review recipe cost reports.
6. **Expenses.** Enter bills in New Expenses and pay them (cash, cheque or bank, with partial payments, overpayments and credit notes), record petty cash vouchers and reimbursements, cash expenses and bank charges, and review Expenses Reports.
7. **Finance.** Use the cash and bank ledgers for receipts and transfers, track cheques in the Cheque Registry, manage staff loans and intercompany transactions.
8. **Adjustments.** Adjust stores balances and process Inhand adjustments (approve or cancel).
9. **Reports.** VAT reports, stock reports and the Analyst views (Super Admin only). Many report pages can be exported to Excel and/or PDF.

View-only (QB) users can open their modules and read records, but cannot add, edit, delete, pay or adjust anything.

---

## Testing

**Server** (Node's built-in runner; there is no `npm test` script):

```bash
cd server
node --test tests/
# or a single file
node --test tests/rolePermissions.test.js
```

Around 40 suites directly under `tests/` cover role permissions and API access rules, money/decimal precision, stock rules and adjustments, the Collection module (schema validation, idempotency, card payments, credit-payment AR, versioning), audit logging, period-lock enforcement, finance ledger and cheque-release consistency, default accounts, document line history, and a block of security-focused suites (`securityCritical`, `securityHigh`, `securityPriority1`). A further set under **`tests/db/`** (soft delete, reference locks, period close, audit trail, cash balance, staff loans, supplier payments/credit settlement, stock availability/parity, collection data issues) runs only against the separate `DB_NAME_TEST` database (never `DB_NAME`) - create/reset it once with `node scripts/createTestDatabase.js`, then run with `node --test tests/db/`.

**Client:**

```bash
cd client
npm test
```

Tests cover routing (`AppRoutes`), the Axios API wrapper, login, the navigation bar, Period Close and Period-Closed popup, Audit Trail, Card Ledger / Cash Receive / Staff Loans / Credit Card Rate Management, the Orders page, RM management lists, cutlery assets, the shared popup / confirm / route-modal UI components, report item selection, role permissions and number formatters.

---

## Deployment notes

- Build the client with `npm run build` in `client/` and serve the output from any static host.
- Point `client/src/api.js` at your API URL and set `CORS_ORIGINS` to your client's URL before building / starting.
- Use strong, private values for `JWT_SECRET` and `POS_SESSION_SECRET` (they must differ from each other), keep `.env` out of version control, and run the API with a process manager rather than `nodemon` (`npm start` uses `nodemon`).
- Set `TRUST_PROXY` when running behind nginx / a load balancer, so the Audit Trail and login throttling see the real client IP.
- Back up the database before applying manual migrations.

---

## License and author

Released under the MIT License for academic and portfolio use.

**Nawanjana Nethmini** (Nethmini M. A. N.), BSc (Hons) IT, SLIIT

- Email: nawanjananethmi2000@gmail.com
- LinkedIn: [linkedin.com/in/nawanjana-nethmini](https://www.linkedin.com/in/nawanjana-nethmini)
- GitHub: [github.com/nawanja09](https://github.com/nawanja09)