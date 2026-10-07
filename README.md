<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Node.js-Express_4-339933?logo=node.js&logoColor=white" alt="Node.js and Express 4" />
  <img src="https://img.shields.io/badge/MySQL%20%2F%20MariaDB-database-4479A1?logo=mysql&logoColor=white" alt="MySQL / MariaDB" />
  <img src="https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-orange" alt="JWT and bcrypt" />
</p>

# Bakery Stock Management System (BSMS)

A full-stack web application for running a bakery business's **stock, production, expenses and finance** in one place. It covers raw-material purchasing and stock, finished-goods production and sales, cutlery assets, an expenses module, cash and bank ledgers, VAT and analyst reports, and stock adjustments. Access to every page and API call is controlled by **role-based permissions**, so each user only sees the modules they are allowed to use.

---

## Table of contents

- [Bakery Stock Management System (BSMS)](#bakery-stock-management-system-bsms)
  - [Table of contents](#table-of-contents)
  - [Tech stack](#tech-stack)
  - [Modules and features](#modules-and-features)
    - [Management (master data)](#management-master-data)
    - [Raw Materials](#raw-materials)
    - [Finished Goods](#finished-goods)
    - [Expenses](#expenses)
    - [Finance](#finance)
    - [Cutlery](#cutlery)
    - [FG Production](#fg-production)
    - [Adjustments](#adjustments)
    - [VAT](#vat)
    - [Analyst](#analyst)
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
RM Items, RM Item Types, Suppliers, Departments, Companies, Payment Methods, Bank Details, Expense Types, Sub Expense Types, Expense Payees, Bank Charges Types, Receive Types, and Employee Management.

### Raw Materials
- **Purchasing**: add purchase invoices, purchase returns, and **Orders** (low-stock list, pending orders, completed orders; an order can be turned into a purchase invoice).
- **Stock movements**: RM Issue (to departments), RM Wastage, Department Return.
- **Reports**: Stock Reports, Item Wise Stock Report, Purchasing Summary / Item Detail, Purchase Report, RM Issue / Wastage / Department Return summaries and item details.
- **Analysis**: Last Issued Date.
- **Supplier payments** are made against pending invoices (including multi-invoice payments), with payment history, credit settlement and outstanding-balance tracking.

### Finished Goods
Item management, opening balances, production, transfers, wastage (add and history), sales (add and history), and reports (item-wise stock, stock, production, wastage, transfer, bakery stock).

### Expenses
Petty Cash (vouchers and reimbursements), Bank Charges, **New Expenses** (bill entry, payment with partial-payment and overpayment handling, credit notes), Cash Expenses, **Hidden Expenses** (report-only records that do not post to the cash or bank books), and Expenses Reports.

### Finance
Cash Ledger and Cash Receive, Bank Ledger and Bank Receive, Cash / Bank Transfer, Bank-to-Bank Transfer, Expenses Cheque Registry, Staff Loans, and Intercompany Transaction. Cash and bank movements are recorded in a shared ledger with running balances per company (cash) and per bank account.

### Collection
A top-level **Collection** page - visible only to **Accountant, Admin and Super Admin** (full access) and **QB** (view only; approve / reject are refused by the API as well as hidden) - with **Pending**, **Completed** and **Rejected** tabs. Opening Pending, or pressing **Search** on it, makes the API pull the three POS endpoints (completed shift collections, credit payments, employee deductions) for the searched date range - the server logs in with its POS `finance` integration account (one shared login, also prepared when a Collection user logs in), so users never enter POS credentials. A From / To range is fetched from the POS in full (from the day before From to To plus `RAVON_POS_COMPLETION_LAG_DAYS`, because the POS dates shifts by completion) and then filtered inclusively on the collection date, so the To date is fully included and the range never depends on rows loaded earlier. Pending records post nothing. **Approve** (one, several or all) posts each payment method through the existing ledgers in one database transaction: Cash to the Cash Ledger, Bank / Online to the chosen company bank account, Card to the Card Ledger as Pending card transactions - for a shift, **one Card Ledger entry per individual POS card payment** (`card.transactions[]`: own date, POS receipt / order reference and details; never the shift's card total as one line; each linked in `collection_card_payments` under a unique POS key so it can never be posted twice; approval is refused when the payments do not add up to the card total - see the shift's "N payments" view and `migrations/028_collection_card_payments.sql`), AR to the **AR Account** Other Ledger and Short / Excess to the **Short/Excess Account** Other Ledger; an employee deduction credits the Short/Excess Account and is linked to its shift. **Reject** needs a reason and posts nothing. Each shift is stored with its Shift Reference (`shift_id-shift_no`, e.g. `211-0104`) and the existing department its POS branch maps to (`"Cafe - M"` -> `Cafe`, see `server/services/departmentMapper.js`); records from **every** POS branch the POS account can see are imported - the user's own department is never a filter (the POS limits each account to its `branch_ids`, so the server must use the POS `finance` account; the page warns when it cannot see every branch); POS `MASActive` is stored and shown as **MAS Intimo** (the original name stays in the record's raw POS payload); a branch that matches no department is still imported and shown as *Unmapped*, but cannot be approved until it maps. All three tabs share server-side filters - Search, Source, Department, From / To date - applied together when **Search** is pressed (`GET /api/collections?status=&search=&source=&department_id=&from_date=&to_date=&page=&limit=`). The same POS record can never be approved twice. Completed and Rejected are read from the BSMS database. See `server/services/collectionService.js` and `migrations/027_collections.sql`.

### Cutlery
Locations, Assets (with image upload), Transfers, Purchasing, Damages, and a Stock Report.

### FG Production
Recipes and FG Recipes Reports. Finished-goods items for recipes come from an external POS system (see [Integrations](#background-processing-and-integrations)).

### Adjustments
Stores balance adjustments, an Adjustment Summary Report, and **Inhand (Cash / Cheque)** adjustments with an approve / cancel workflow that posts to the finance ledgers.

### VAT
VAT Purchasing Report and Return VAT Report.

### Analyst
Income, Expenses and Balance Sheet views.

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
| **Admin** | Everything except Analyst |
| **Super Admin** | Everything, including Analyst |

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
- **Operations section**, shown to users with Raw Materials, Finished Goods or FG Production: key 7-day numbers (low stock, purchases, pending payments for users with Finance, issues, wastage, production), quick actions, an activity trend chart, low-stock list, top issued / wasted items, and (with FG Production) a recipe cost versus selling price chart.

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
│       │   ├── FinishedGoods/, FGProduction/, CostCalculator/, Cutlery/
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
| `JWT_SECRET` | Secret used to sign and verify JWTs (required) |
| `RAVON_POS_API_URL` | Base URL of the Ravon Bakers POS (example value in `.env.example`: `https://pos.ravonbakers.lk`) |
| `RAVON_POS_ITEMS_ENDPOINT` | POS items endpoint (example: `/api/items-list`) |
| `RAVON_POS_USERNAME`, `RAVON_POS_PASSWORD` | The POS's own service account (separate from every Stock Management login) used by the server for `POST /api/login`; the token is cached server-side, refreshed automatically and never sent to the browser. Required for Collection and FG items. `POS_USERNAME` / `POS_PASSWORD` / `POS_BASE_URL` are accepted as alternative names |
| `RAVON_POS_API_KEY` | Legacy static bearer token, used only when the username / password are not set |
| `RAVON_POS_SHIFT_COLLECTION_URL`, `RAVON_POS_CREDIT_PAYMENTS_URL`, `RAVON_POS_EMPLOYEE_DEDUCTIONS_URL` | Optional full-URL overrides for the three Collection endpoints |
| `RAVON_POS_COLLECTION_LOOKBACK_DAYS` | Optional: how many days back a Collection sync asks the POS for when no date range is searched (default `7`) |
| `RAVON_POS_COMPLETION_LAG_DAYS` | Optional: how many days after its closing date a shift may still be completed in the POS; a searched range is fetched up to To + this many days (default `14`, capped at today) |
| `RAVON_POS_BRANCH_DEPARTMENT_MAP` | Optional JSON for POS branch names the automatic rule cannot match, e.g. `{"Savoury": "Savory"}`. The rule itself maps `"Cafe - M"` to the existing department `"Cafe"` |
| `RAVON_POS_TIMEZONE` | Optional: time zone used to date POS timestamps (default `Asia/Colombo`) |
| `RAVON_POS_TIMEOUT_MS` | POS request timeout (example: `8000`) |
| `PERMISSION_CACHE_TTL_MS` | Optional: how long role grants are cached (default 30000 ms) |
| `FINANCE_PASSWORD` | Optional alternative to the CLI argument for `scripts/createFinanceUser.js` |

### Values set in code

- **API base URL (client):** `client/src/api.js` sets `baseURL` to `http://localhost:5000/api`; production URLs are present there as commented-out lines. Change it for each environment.
- **CORS origin (server):** `server/server.js` allows the origin `http://localhost:3000`; production origins are present as comments. Change it to match where the client is served.
- **Uploads:** files are stored in `server/uploads/` and served at `/uploads`. Uploads are limited to images, 5 MB each.

---

## Database and schema management

The schema is built from several sources, so it helps to know which does what:

1. **Baseline dump**, `bakery system db.sql` (62 tables, exported from MariaDB 10.4). It does not contain every table the current code uses.
2. **Self-migrating functions** in `server/config/db.js` (`ensure…Schema()`), run on server start. They create or alter tables with `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`. Examples: item types, payment methods, soft-delete status, username login, the finance ledgers, expense/finance links, bank charge types, orders, income, cash expenses, sub-expense types, credit notes, employees, staff loans, intercompany transactions. `chequeReleaseService.js` also ensures its own schema at startup.
3. **Numbered SQL files** in `server/migrations/`. Some mirror what `db.js` applies automatically; others (for example hidden expenses, inhand adjustments, and the role/privilege tables `024` and `025`) are **not** applied automatically and must be run manually. Check the header comment of each file, and run any that your database is missing. Several numbers appear twice (for example two `001_` and two `006_` files); they are independent files.
4. **One-off scripts** in `server/` (`migrate_adjustments.js`, `migrate_purchasing_decimals.js`, `migrate_receive_types.js`), each documented as "run once" in its header, e.g. `node migrate_receive_types.js`.

Practical guidance: import the dump, start the server once so the self-migrating functions run, then apply any manual migrations your database lacks (at minimum `024` and `025` for the role system).

**Ledger convention.** Cash and bank movements share one `finance_transactions` ledger: a **debit** is money in, a **credit** is money out, and `new balance = previous balance + debit − credit`.

---

## Background processing and integrations

- **Cheque release processor.** On startup, and then every 60 seconds, the server looks for registry cheques that are not Released / Returned / Deleted and whose release date has arrived, and posts their ledger entries. Cheques move through **Pending**, **Released** and **Returned**; the Expenses Cheque Registry also tags each cheque as an **Expense** or a **Transfer**.
- **Bank-to-Cash cheque transfers.** The bank ledger is deducted when the transfer is created; the cash ledger is credited only when the cheque is released.
- **Ravon Bakers POS.** Finished-goods items for FG Production are read live from the external POS through `server/services/ravonPosService.js`, using the `RAVON_POS_*` settings. The POS is the source of truth for those items; BSMS does not keep its own FG item master for recipes. If the POS is unreachable, the FG Production pages that depend on it are affected. All POS calls (FG items and Collection) authenticate through `server/services/posAuthService.js`; `node scripts/posCollectionProbe.js` (in `server/`) prints the real structure of the three Collection endpoints so the field mapping in `services/collectionMapper.js` can be checked.

---

## Using the system

1. **Log in** with your username and password. Your session token lasts 24 hours; when it expires you are sent back to the login page and returned to the page you were on after signing in again.
2. **Check the Dashboard.** It shows the sections your role is allowed to see.
3. **Set up master data** under Management: items, item types, suppliers, departments, companies, payment methods, bank details, expense types and payees, employees.
4. **Raw materials.** Record purchases (or create an Order from the low-stock list and invoice it), then pay supplier invoices from the pending-invoices view. Issue materials to departments, record wastage and department returns, and review the stock and purchasing reports.
5. **Finished goods and production.** Enter opening balances, record production, transfers, wastage and sales, and use the FG Production module for recipes and recipe cost reports.
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

The suites cover role permissions and API access rules, stock adjustments, the item / item-type / department / company controllers, low-stock orders, payment-method utilities, finance ledger date ranges, cheque release consistency and staff loans. A few of them (`staffLoans`, `chequeReleaseConsistency`, `inspectIncomeDb`) connect to the configured database.

**Client:**

```bash
cd client
npm test
```

Tests exist for the Orders page, the Staff Loans page, the popup component, report item selection and number formatters.

---

## Deployment notes

- Build the client with `npm run build` in `client/` and serve the output from any static host.
- Point `client/src/api.js` at your API URL and set the CORS origin in `server/server.js` to your client's URL before building / starting.
- Use a strong, private `JWT_SECRET`, keep `.env` out of version control, and run the API with a process manager rather than `nodemon` (`npm start` uses `nodemon`).
- Back up the database before applying manual migrations.

---

## License and author

Released under the MIT License for academic and portfolio use.

**Nawanjana Nethmini** (Nethmini M. A. N. Herath), BSc (Hons) IT, SLIIT

- Email: nawanjananethmi2000@gmail.com
- LinkedIn: [linkedin.com/in/nawanjana-nethmini](https://www.linkedin.com/in/nawanjana-nethmini)
- GitHub: [github.com/nawanja09](https://github.com/nawanja09)