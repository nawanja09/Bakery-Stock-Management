--User Table
CREATE TABLE backery_system.users(
	id INT AUTO_INCREMENT PRIMARY KEY,
	email VARCHAR(255) NOT NULL,
	password VARCHAR(255) NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchases Table
CREATE TABLE backery_system.purchases (
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
    FOREIGN KEY (supplier_id) REFERENCES supplier(id)
);

-- Purchase Items Table
CREATE TABLE backery_system.purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
);

-- Insert sample users
INSERT INTO users(email,password) VALUES
('user@bakery.com', '$2a$12$AqOQrrSSoh8hDm47A9tfkuUyhQTvpON5rdUCrDQ/YZK9JjH1zFtNi');


-- Insert sample purchases
INSERT INTO purchases (invoice_no, purchase_date, supplier_id, bill_amount, paid_amount, payment_method, remarks, prepared_by) VALUES
('PUR-20240601-1234', '2024-06-01 10:00:00', 1, 25000.00, 25000.00, 'CASH', 'Monthly flour order', 1),
('PUR-20240605-5678', '2024-06-05 14:30:00', 2, 15000.00, 10000.00, 'BANK_TRANSFER', 'Sugar for cakes', 1),
('PUR-20240610-9012', '2024-06-10 09:15:00', 3, 18000.00, 18000.00, 'CREDIT', 'Dairy products', 1);

-- Insert sample purchase items
INSERT INTO purchase_items (purchase_id, item_name, quantity, unit_price) VALUES
(1, 'Wheat Flour', 500, 40.00),
(1, 'Bread Flour', 300, 45.00),
(2, 'White Sugar', 200, 50.00),
(2, 'Brown Sugar', 100, 55.00),
(3, 'Fresh Milk', 150, 80.00),
(3, 'Butter', 50, 120.00),
(3, 'Cheese', 30, 200.00);

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
  CHECK (contact_email IS NULL OR contact_email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

INSERT INTO supplier (name, address, city, contact_name, contact_phone, contact_email)
VALUES 
  ('Golden Grain Flour Mills', '123 Mill Road', 'Colombo', 'Nimal Perera', '0771234567', 'nimal@goldenflour.lk'),
  ('SweetSugar Distributors', '45 Sweet Street', 'Kandy', 'Ruwan Silva', '0712345678', 'ruwan@sweetsugar.com'),
  ('Bakers Butter Supply', '10 Dairy Lane', 'Galle', 'Sunil Fernando', '0759876543', 'sunil@bakersbutter.lk'),
  ('FreshEggs Ltd.', '88 Farm Avenue', 'Kurunegala', 'Kumari Jayasinghe', '0761231234', NULL),
  ('ChocoDelight Suppliers', '200 Cocoa Drive', 'Matara', 'Anura Wijesinghe', '0784567890', 'anura@chocodelight.lk');


CREATE TABLE backery_system.items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    unit ENUM('kg', 'g', 'L', 'ml', 'quantity') NOT NULL,
    reorder_level DECIMAL(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO items (item_code, name, unit, reorder_level) VALUES
('I001', 'Wheat Flour', 'kg', 50),
('I002', 'Sugar', 'kg', 30),
('I003', 'Eggs', 'quantity', 100),
('I004', 'Butter', 'g', 5000),
('I005', 'Milk', 'L', 20);