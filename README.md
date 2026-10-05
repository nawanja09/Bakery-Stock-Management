# Bakery Stock Management System

A full-stack bakery operations platform for managing raw material stock, finished goods production, finance records, and operational reporting. The project is built as a React frontend and an Express + MySQL backend, and it includes role-based access control for different bakery user types.

## Overview

This application handles the day-to-day business records of a bakery operation, including:

- raw material purchasing, stock management, issuances, wastage, and returns
- finished goods item and production tracking
- production cost calculation and recipe management
- sales, transfers, and stock reporting for finished goods
- cutlery inventory and asset tracking
- expenses, petty cash, reimbursements, bank/cash ledger activity, and payment records
- dashboard and report generation for finance and operational visibility

The frontend is implemented in `client/src`, while the API, database access, and business logic live in `server/`.

## Technology Stack

### Frontend
- React 19
- React Router DOM
- Axios
- Chart.js and `react-chartjs-2`
- XLSX for spreadsheet exports
- jsPDF + jsPDF AutoTable for printable/exportable reports
- Font Awesome and React Icons
- date-fns and dayjs for date handling

### Backend
- Node.js
- Express.js
- MySQL via `mysql2`
- JWT authentication
- bcrypt password hashing
- CORS, dotenv, multer
- nodemon for local development

### Database and persistence
- MySQL database accessed through `server/config/db.js`
- SQL schema support in `bakery system db.sql`
- Migration scripts in `server/migrations/`
- Startup schema bootstrap logic in `server/config/db.js`

## Core Features

### 1. Raw materials and purchasing
The raw materials module includes:

- item master data and item types
- supplier management
- purchase entry and purchase history
- purchase-return workflows
- previous purchase price lookup
- non-paid purchase tracking and payment forms
- opening balances, issuances, wastage, and department returns
- purchasing and stock reports

Relevant server routes include:
- `/api/purchases`
- `/api/items`
- `/api/suppliers`
- `/api/opening-balance`
- `/api/issuances`
- `/api/wastages`
- `/api/returns`
- `/api/purchase-returns`
- `/api/reports`

### 2. Finished goods management
The finished goods area covers product management and production operations:

- finished goods item master records
- opening balances
- production records and recipe-based output tracking
- transfers between stock locations
- sales records
- wastage tracking
- stock, production, transfer, and bakery stock reports
- cost calculation and saved costing history

Relevant routes include:
- `/api/finished-goods-items`
- `/api/finished-goods-opening-balance`
- `/api/productions`
- `/api/finished-goods-transfers`
- `/api/finished-goods-wastages`
- `/api/finished-goods-sales`
- `/api/cost-calculations`
- `/api/finished-goods-reports`
- `/api/fg-production`

### 3. Finished goods production module
This module is implemented as an independent production workflow under `/api/fg-production` and is separate from the earlier finished goods routes.

It includes:

- recipe management for finished goods items
- production creation and updates
- recipe reports for production planning
- Ravon POS integration for item lookup via configured POS API settings
- production dashboards for recipe and output analysis

The POS integration config is defined in `server/.env` using:
- `RAVON_POS_API_URL`
- `RAVON_POS_ITEMS_ENDPOINT`
- `RAVON_POS_API_KEY`
- `RAVON_POS_TIMEOUT_MS`

### 4. Expenses and finance
The accounting side includes a range of finance and expense workflows:

- expense types and sub-expense types
- payees and company records
- bank details and bank charges
- petty cash vouchers and reimbursements
- new expenses and hidden expenses
- cash and bank ledgers
- bank cash transfers and intercompany transfers
- payment methods and receive types
- staff loans
- expenses cheque registry
- card ledger tracking
- income tracking

Relevant route groups:
- `/api/expenses`
- `/api/new-expenses`
- `/api/cash-expenses`
- `/api/hidden-expenses`
- `/api/finance`
- `/api/payment-methods`
- `/api/staff-loans`
- `/api/incomes`
- `/api/receive-types`

### 5. Cutlery inventory
The project also includes a separate cutlery management domain:

- asset management
- location tracking
- purchases
- transfers
- damages
- stock reports

Relevant routes:
- `/api/cutlery-locations`
- `/api/cutlery-assets`
- `/api/cutlery-transfers`
- `/api/cutlery-purchases`
- `/api/cutlery-damages`
- `/api/cutlery-reports`

### 6. Dashboard, reports, and analysis
The app includes dashboard data and reporting views for:

- overview stats for inventory and operational activity
- finance overview cards
- top items reporting by date range
- purchasing, stock, wastage, and return reports
- VAT-related report screens
- last-issued-date analysis
- chart-driven summary widgets

The dashboard logic is served by `server/routes/dashboardRoutes.js` and controller logic in `server/controllers/dashboardController.js`.

### 7. Authentication and authorization
The app uses JWT-based login and access rules stored in central permission files:

- `server/config/rolePermissions.js`
- `client/src/config/rolePermissions.js`
- `server/middleware/authorizeApi.js`

Defined roles include:
- `STORES`
- `ACCOUNTANT`
- `QB` (view-only role)
- `FINANCE_USER`
- `ADMIN`
- `SUPER_ADMIN`

The UI also protects pages and navigation by module and role. View-only users are blocked from write actions.

## Project Structure

```text
Bakery-Stock-Management/
├── README.md
├── bakery system db.sql
├── client/
│   ├── package.json
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── components/
│       ├── config/
│       ├── hooks/
│       └── api/
├── server/
│   ├── .env
│   ├── package.json
│   ├── server.js
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── migrations/
│   ├── tests/
│   └── uploads/
└── Screenshot/
```

## Local Setup

### Prerequisites
- Node.js 20+
- npm
- MySQL or MariaDB compatible with the app
- Git

### 1. Clone the repository

```bash
git clone https://github.com/nawanja09/Bakery-Stock-Management.git
cd Bakery-Stock-Management
```

### 2. Configure environment variables
The server reads its configuration from `server/.env`.

Example values used by the application:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=backery_systems
PORT=5000
JWT_SECRET=mysecretkey123

RAVON_POS_API_URL=https://pos.ravonbakers.lk
RAVON_POS_ITEMS_ENDPOINT=/api/items-list
RAVON_POS_API_KEY=
RAVON_POS_TIMEOUT_MS=8000
```

Important notes:
- The project default database name in the app configuration is `bakery_systems`.
- The repository also contains `bakery system db.sql`, which is a schema/data dump and may use a slightly different database name depending on how it was imported.
- Ensure your MySQL database name matches the value in `server/.env`, or update the `DB_NAME` setting to the database you created.

### 3. Create the database

```sql
CREATE DATABASE bakery_systems;
```

If you are importing the provided SQL dump, use the same database name or adjust the import target accordingly.

### 4. Import the database schema/data
You can use MySQL Workbench, phpMyAdmin, or the CLI:

```bash
mysql -u root -p bakery_systems < "bakery system db.sql"
```

### 5. Install backend dependencies

```bash
cd server
npm install
```

### 6. Run the backend

```bash
npm start
```

The API runs at:

```text
http://localhost:5000
```

### 7. Install frontend dependencies

```bash
cd ../client
npm install
```

### 8. Run the frontend

```bash
npm start
```

The frontend runs at:

```text
http://localhost:3000
```

The React app is configured with a proxy to the Express backend at `http://localhost:5000`.

## Typical Usage Workflows

### Raw material workflow
1. Add or maintain item records.
2. Add suppliers and company metadata.
3. Record purchases.
4. Track payments and due balances.
5. Issue materials to departments.
6. Record wastage and returns.
7. Review stock and purchasing reports.

### Finished goods workflow
1. Create finished goods items.
2. Record opening balances.
3. Add production records and recipes.
4. Track transfers, sales, and wastage.
5. Review stock and production reports.
6. Use cost calculation screens to estimate cost per unit.

### Finance workflow
1. Manage payees, expense types, bank details, and payment methods.
2. Record vouchers, expenses, petty cash activity, and reimbursements.
3. Review cash and bank ledger balances.
4. Process transfers and cheque registry updates.
5. Use dashboard finance summaries and report screens.

### Role-based access workflow
- Login through the auth endpoint `/api/login`.
- The JWT includes user role information.
- Role rules are enforced both in the React app and on the backend API.
- `QB` users are treated as view-only and cannot edit or delete records.

## Operational Notes

- The backend creates or updates several schema elements during startup, including payment methods and financial adjustment records.
- Uploaded files are stored under `server/uploads`.
- The app includes multiple finance and stock adjustment features, so some data entry screens are specifically permission-scoped to finance or raw-material roles.
- The codebase contains migration scripts under `server/migrations/` and a large SQL dump, indicating an evolving database schema rather than a single static table design.

## License

The project currently does not declare a project-level license in the repository metadata. The code should be treated as a project-specific internal or academic implementation unless otherwise noted by the repository owner.

## Notes

This README reflects the implementation that is present in the current codebase. The app includes a broad set of operational modules and reports, and the README intentionally documents only the functionality that is represented in the repository code and route structure.
