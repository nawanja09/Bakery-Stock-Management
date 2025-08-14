-- Create database if not exists
CREATE DATABASE IF NOT EXISTS backery;
USE backery;

-- Users Table 
CREATE TABLE users(
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supplier Table 
CREATE TABLE supplier (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(10) NOT NULL,
    contact_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (contact_phone REGEXP '^[0-9]{10}$'),
    CHECK (contact_email IS NULL OR contact_email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
);

-- Items Table 
CREATE TABLE items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    unit ENUM('kg', 'g', 'L', 'ml', 'quantity') NOT NULL,
    reorder_level DECIMAL(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departments Table 
CREATE TABLE departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchases Table 
CREATE TABLE purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    purchase_date DATETIME NOT NULL,
    supplier_id INT NOT NULL,
    bill_amount DECIMAL(10,2) NOT NULL,
    paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payment_method ENUM('CASH', 'BANK_TRANSFER', 'CREDIT') NOT NULL,
    remarks TEXT,
    prepared_by INT NOT NULL,
    attachment_path VARCHAR(255),
    FOREIGN KEY (supplier_id) REFERENCES supplier(id),
    FOREIGN KEY (prepared_by) REFERENCES users(id)
);

-- Purchase Items Table
CREATE TABLE purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
);

-- Opening Balances Table 
CREATE TABLE opening_balances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    item_id INT NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL,
    total_value DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    entered_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (entered_by) REFERENCES users(id)
);

-- Issuances Table 
CREATE TABLE issuances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issuance_date DATETIME NOT NULL,
    issued_by INT NOT NULL,
    department_id INT NOT NULL,
    received_by VARCHAR(255) NOT NULL,
    remarks TEXT,
    approved_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (issued_by) REFERENCES users(id)
);

-- Issuance Items Table 
CREATE TABLE issuance_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    issuance_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    FOREIGN KEY (issuance_id) REFERENCES issuances(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Wastages Table
CREATE TABLE wastages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wastage_note_number VARCHAR(20) UNIQUE NOT NULL,
    date DATE NOT NULL,
    approved_by VARCHAR(255) NOT NULL,
    reason ENUM('Expired', 'Damaged', 'Overproduction', 'Poor Storage', 'Forecasting errors', 'Human error', 'Other') NOT NULL,
    remarks TEXT,
    attachment_path VARCHAR(255),
    entered_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entered_by) REFERENCES users(id)
);

-- Wastage Items Table 
CREATE TABLE wastage_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wastage_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    estimated_loss DECIMAL(10,2),
    FOREIGN KEY (wastage_id) REFERENCES wastages(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- =================================================================
-- SAMPLE DATA INSERTION (in proper dependency order)
-- =================================================================

-- 1. Insert users
INSERT INTO users (email, password) VALUES
('admin@bakery.com', '$2a$12$SD046euRGXliGfAAedXiQ.mECP/0NgOiZnIMAx.k.vaIbcxd0JuCi'),
('admin1@bakery.com', '$2a$12$eqtWphr./ecI48be8feIf.UJTeKloEvyYu6Ma1rgG3kh8imSjdpZq');

-- 2. Insert suppliers
INSERT INTO supplier (name, address, city, contact_name, contact_phone, contact_email) VALUES
('Golden Grain Flour Mills', '123 Mill Road', 'Colombo', 'Nimal Perera', '0771234567', 'nimal@goldenflour.lk'),
('SweetSugar Distributors', '45 Sweet Street', 'Kandy', 'Ruwan Silva', '0712345678', 'ruwan@sweetsugar.com'),
('Bakers Butter Supply', '10 Dairy Lane', 'Galle', 'Sunil Fernando', '0759876543', 'sunil@bakersbutter.lk'),
('FreshEggs Ltd.', '88 Farm Avenue', 'Kurunegala', 'Kumari Jayasinghe', '0761231234', NULL),
('ChocoDelight Suppliers', '200 Cocoa Drive', 'Matara', 'Anura Wijesinghe', '0784567890', 'anura@chocodelight.lk');

-- 3. Insert items
INSERT INTO items (item_code, name, unit, reorder_level) VALUES
('I001', 'Wheat Flour', 'kg', 50),
('I002', 'Sugar', 'kg', 30),
('I003', 'Eggs', 'quantity', 100),
('I004', 'Butter', 'g', 5000),
('I005', 'Milk', 'L', 20),
('I006', 'Bread Flour', 'kg', 40),
('I007', 'Brown Sugar', 'kg', 25),
('I008', 'Cheese', 'g', 3000),
('I009', 'Fresh Milk', 'L', 30);

-- 4. Insert departments
INSERT INTO departments (name) VALUES
('Cake'),
('Bakery'),
('Pastry'),
('Chinese'),
('Savory'),
('Staff');

-- 5. Insert purchases (after suppliers and users)
INSERT INTO purchases (invoice_no, purchase_date, supplier_id, bill_amount, paid_amount, payment_method, remarks, prepared_by) VALUES
('PUR-20240601-1234', '2024-07-01 10:00:00', 1, 25000.00, 25000.00, 'CASH', 'Monthly flour order', 1),
('PUR-20240605-5678', '2024-08-05 14:30:00', 2, 15000.00, 10000.00, 'BANK_TRANSFER', 'Sugar for cakes', 1),
('PUR-20240610-9012', '2024-07-10 09:15:00', 3, 18000.00, 18000.00, 'CREDIT', 'Dairy products', 1);

-- 6. Insert purchase items (after purchases)
INSERT INTO purchase_items (purchase_id, item_name, quantity, unit_price) VALUES
(1, 'Wheat Flour', 500.000, 40.00),
(1, 'Bread Flour', 300.000, 45.00),
(2, 'White Sugar', 200.000, 50.00),
(2, 'Brown Sugar', 100.000, 55.00),
(3, 'Fresh Milk', 150.000, 80.00),
(3, 'Butter', 50.000, 120.00),
(3, 'Cheese', 30.000, 200.00);

-- 7. Insert opening balances (after items and users)
INSERT INTO opening_balances (date, item_id, quantity, unit_cost, entered_by) VALUES 
('2025-07-01', 1, 50.000, 120.00, 1),
('2025-07-01', 2, 30.000, 50.00, 1),
('2025-07-01', 3, 100.000, 15.00, 1),
('2025-07-01', 4, 5000.000, 0.80, 1),
('2025-07-01', 9, 20.000, 120.00, 1);

-- 8. Insert issuances (after departments and users)
INSERT INTO issuances (issuance_date, issued_by, department_id, received_by, remarks, approved_by) VALUES
('2024-07-01 10:00:00', 1, 1, 'John Doe', 'Monthly supply for Cake department', 'Jane Smith'),
('2024-07-05 14:30:00', 1, 2, 'Alice Brown', 'Weekly supply for Bakery department', 'Bob Johnson'),
('2024-07-10 09:15:00', 1, 3, 'Charlie White', 'Daily supply for Pastry department', 'Diana Green');

-- 9. Insert issuance items (after issuances and items)
INSERT INTO issuance_items (issuance_id, item_id, quantity) VALUES    
(1, 1, 20.000),
(1, 2, 10.000),
(2, 3, 50.000),
(2, 4, 30.000),
(3, 9, 15.000),
(3, 1, 25.000);

-- 10. Insert wastages (after departments and users)
INSERT INTO wastages (wastage_note_number, date, approved_by, reason, remarks, entered_by) VALUES
('WST-20240601-001', '2024-07-01', 'Jane Smith', 'Expired', 'Expired flour batch', 2),
('WST-20240605-002', '2024-07-05', 'Bob Johnson', 'Damaged', 'Damaged sugar bags during transport', 2),
('WST-20240610-003', '2024-07-10', 'Diana Green', 'Overproduction', 'Excess bread production', 2);

-- 11. Insert wastage items (after wastages and items)
INSERT INTO wastage_items (wastage_id, item_id, quantity, estimated_loss) VALUES
(1, 1, 10.000, 120.00),
(1, 2, 5.000, 50.00),
(2, 3, 20.000, 300.00),
(2, 4, 15.000, 180.00),
(3, 9, 30.000, 360.00),
(3, 1, 25.000, 300.00);


--delete the department_id column in the wastages table
ALTER TABLE backery.wastages DROP FOREIGN KEY wastages_ibfk_2;
ALTER TABLE backery.wastages DROP COLUMN department_id;