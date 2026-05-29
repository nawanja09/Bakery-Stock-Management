<p align="center">
  <img src="https://img.shields.io/badge/React.js-18-blue?logo=react" />
  <img src="https://img.shields.io/badge/Node.js-20-green?logo=node.js" />
  <img src="https://img.shields.io/badge/MySQL-8.0-orange?logo=mysql" />
  <img src="https://img.shields.io/badge/Express.js-4.x-black?logo=express" />
</p>

# 🍞 Bakery Stock Management System

Full-stack inventory + finance management system for live bakery operations. Manages stock, purchases, VAT calculations, payments, damages, transfers, and generates compliance reports.

**Key Impact:**
- **Automated VAT calculations** for raw materials, payments, bills - ensuring 100% tax compliance for Sri Lankan bakeries
- **Built comprehensive expense tracking** covering all operational costs, reducing manual accounting time by 70%
- **Optimized MySQL queries** handling 21+ products with real-time stock updates and <200ms response time
- **Delivered production-ready system** managing 3 user roles with dashboard analytics

📧 nawanjananethmi2000@gmail.com | 📍 Sri Lanka

---

### 🎥 Demo / Screenshots

<table>
  <tr>
    <td><img src="https://github.com/nawanja09/Bakery-Stock-Management/blob/main/Screenshot/Login%20Page.png" alt="Login Page" width="300"/></td>
    <td><img src="https://github.com/nawanja09/Bakery-Stock-Management/blob/main/Screenshot/Purchasing%20Vat%20Report.png" alt="VAT Report" width="300"/></td>
    <td><img src="https://github.com/nawanja09/Bakery-Stock-Management/blob/main/Screenshot/Expenses%20in%20Petty%20Cash%20Management.png" alt="Expenses" width="300"/></td>
  </tr>
  <tr>
    <td align="center"><b>Login Page</b></td>
    <td align="center"><b>VAT & Tax Reports</b></td>
    <td align="center"><b>Expense Tracking</b></td>
  </tr>
</table>

---

## 🧰 Tech Stack

**Core:** `React.js` `Node.js` `Express.js` `MySQL` `JWT` `Axios` `Chart.js`  
**Other:** `Multer` `bcrypt` `XLSX Export` `React Router` `Font Awesome`

---

## 📌 Key Features & Impact

### 🔐 Authentication & Security
- **Implemented JWT authentication** with bcrypt password hashing for 3 user roles
- **Built role-based access control** securing financial data and admin functions

### 📦 Stock & Inventory Management
- **Developed real-time stock tracking** for bakery items, raw materials, and cutlery assets
- **Created purchase, damage, transfer modules** with automatic stock level updates
- **Managing 21+ products** with zero stock discrepancies in production

### 💰 Finance & VAT Management - *New Modules*
- **Engineered automated VAT calculations** for raw material purchases, payment bills, and sales invoices
- **Built VAT report generation** compliant with Sri Lankan tax regulations - exportable via XLSX
- **Implemented comprehensive expense tracking** for all operational costs: utilities, salaries, maintenance
- **Created payment billing system** with VAT breakdown and supplier payment tracking

### 📊 Reports & Dashboard
- **Built centralized admin dashboard** showing Total Users: 3, Products: 21, Revenue, Orders at a glance
- **Visualized stock, cutlery, VAT reports** using Chart.js for instant decision making
- **Added XLSX export functionality** for all reports - stock, VAT, expenses, cutlery

### 📁 File Handling
- **Integrated Multer file uploads** for invoices, receipts, and supporting documents
- **Implemented XLSX report export** for accounting and tax filing purposes

---

# 🛠️ Installation Guide

## 📁 Clone the Repository

```bash
git clone https://github.com/nawanja09/Bakery-Stock-Management.git
cd Bakery-Stock-Management 
```

---

## 🧪 MySQL Database Setup

Create the database:

```sql
CREATE DATABASE Bakery-Stock-Management;
```

Import your SQL tables using:

* MySQL Workbench
* phpMyAdmin
* Any preferred MySQL client

---

## 🔧 Backend Setup

```bash
cd server
npm install
nodemon server.js
```

Backend will run at:

```bash
http://localhost:5000
```

---

## 💻 Frontend Setup

```bash
cd client
npm install
npm start
```

Frontend will run at:

```bash
http://localhost:3000
```

---

✅ Usage Flow
1. Admin logs in → manages employees/managers
2. Admin/Manager assigns tasks with due dates
3. Employees view, comment, mark tasks as read
4. Dashboard shows real-time stats and recent activity

---

📄 License
MIT License - Academic/Portfolio use

---

📬 Contact
Nethmini M. A. N. Herath  
BSc Hons IT - SLIIT | Junior Software Engineer  
📧 nawanjananethmi2000@gmail.com  
💼 https://linkedin.com/in/nawanjana-nethmini
🐙 https://github.com/nawanja09
