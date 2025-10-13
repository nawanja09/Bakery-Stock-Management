--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('Admin','Staff','Manager','User','Inventory Officer','Production Staff') NOT NULL DEFAULT 'Staff',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` VALUES 
(2,'Admin','admin@bakery.com','$2b$10$OBIeLkeX/uU.uXtwxWlJL.77zUs3oQ6l8BZ/lsHXAi6Jx9PqkkWjy','Admin','2025-08-11 09:45:42'), -- Password : Admin@123
(5,'User 1','user@bakery.com','$2b$10$Jgx.T4oQUmam5fTM7gAUKe13YdI6EKUcV4yTf4EqC4gtMIbezzv3W','Staff','2025-08-11 11:00:53'); -- Password : User@123

--
-- Table structure for table `supplier`
--

CREATE TABLE `supplier` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `city` varchar(100) NOT NULL,
  `contact_name` varchar(255) NOT NULL,
  `contact_phone` varchar(10) NOT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `supplier_chk_1` CHECK (regexp_like(`contact_phone`,_utf8mb4'^[0-9]{10}$')),
  CONSTRAINT `supplier_chk_2` CHECK (((`contact_email` is null) or regexp_like(`contact_email`,_utf8mb4'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `supplier`
--

INSERT INTO `supplier` VALUES 
(1,'Golden Grain Flour Mills','123 Mill Road','Colombo','Nimal Perera','0771234567','nimal@goldenflour.lk','2025-08-11 09:36:31'),
(2,'SweetSugar Distributors','45 Sweet Street','Kandy','Ruwan Silva','0712345678','ruwan@sweetsugar.com','2025-08-11 09:36:31'),
(3,'Bakers Butter Supply','10 Dairy Lane','Galle','Sunil Fernando','0759876543','sunil@bakersbutter.lk','2025-08-11 09:36:31'),
(4,'FreshEggs Ltd.','88 Farm Avenue','Kurunegala','Kumari Jayasinghe','0761231234',NULL,'2025-08-11 09:36:31'),
(5,'ChocoDelight Suppliers','200 Cocoa Drive','Matara','Anura Wijesinghe','0784567890','anura@chocodelight.lk','2025-08-11 09:36:31');

--
-- Table structure for table `items`
--

CREATE TABLE `items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `unit` enum('kg','g','L','ml','quantity') NOT NULL,
  `reorder_level` decimal(10,0) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `item_code` (`item_code`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `items`
--

INSERT INTO `items` VALUES 
(1,'I001','Wheat Flour','kg',50,'2025-08-11 09:36:31'),
(2,'I002','Sugar','kg',30,'2025-08-11 09:36:31'),
(3,'I003','Eggs','quantity',100,'2025-08-11 09:36:31'),
(4,'I004','Butter','g',5000,'2025-08-11 09:36:31'),
(5,'I005','Milk','L',20,'2025-08-11 09:36:31'),
(6,'I006','Bread Flour','kg',40,'2025-08-11 09:36:31'),
(7,'I007','Brown Sugar','kg',25,'2025-08-11 09:36:31'),
(8,'I008','Cheese','g',3000,'2025-08-11 09:36:31'),
(9,'I009','Fresh Milk','L',30,'2025-08-11 09:36:31');

--
-- Table structure for table `departments`
--

CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `departments`
--

INSERT INTO `departments` VALUES 
(1,'Cake','2025-08-11 09:36:31'),
(2,'Bakery','2025-08-11 09:36:31'),
(3,'Pastry','2025-08-11 09:36:31'),
(4,'Chinese','2025-08-11 09:36:31'),
(5,'Savory','2025-08-11 09:36:31'),
(6,'Staff','2025-08-11 09:36:31'),
(7, 'Cafe', '2025-08-25 08:22:46'),
(8, 'Office', '2025-08-25 08:59:43');

--
-- Table structure for table `purchases`
--

CREATE TABLE `purchases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(50) NOT NULL,
  `purchase_date` datetime NOT NULL,
  `supplier_id` int NOT NULL,
  `bill_amount` decimal(10,2) NOT NULL,
  `paid_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payment_method` enum('CASH','BANK_TRANSFER','CREDIT') NOT NULL,
  `remarks` text,
  `prepared_by` int NOT NULL,
  `company_id` int DEFAULT NULL,
  `attachment_path` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_no` (`invoice_no`),
  KEY `supplier_id` (`supplier_id`),
  KEY `prepared_by` (`prepared_by`),
  KEY `fk_purchases_company` (`company_id`),
  CONSTRAINT `fk_purchases_company` FOREIGN KEY (`company_id`) REFERENCES `company` (`id`),
  CONSTRAINT `purchases_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `supplier` (`id`),
  CONSTRAINT `purchases_ibfk_2` FOREIGN KEY (`prepared_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `purchases`
--

INSERT INTO `purchases` VALUES 
(9,'PUR-A3F630AF','2025-08-13 00:00:00',4,1000.00,1000.00,'CASH','',5,NULL),
(10,'PUR-57495291','2025-08-14 00:00:00',1,12000.00,12000.00,'CASH','',5,NULL),
(11,'PUR-2E4D5C0B','2025-08-14 00:00:00',1,1200.00,1200.00,'CASH','',5,NULL),
(14,'PUR-06FB5DEF','2025-08-14 00:00:00',1,1100.00,1100.00,'BANK_TRANSFER','',5,NULL),
(15,'PUR-F9CB6A5E','2025-08-14 00:00:00',1,1100.00,1100.00,'CASH','',5,NULL),
(16,'PUR-D4D43AC9','2025-08-14 00:00:00',4,1001.00,1000.00,'CASH','',5,NULL);

--
-- Table structure for table `purchase_items`
--

CREATE TABLE `purchase_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_id` int NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` decimal(10,3) DEFAULT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `total_price` decimal(10,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) STORED,
  `item_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `purchase_id` (`purchase_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `purchase_items_ibfk_1` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `purchase_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `purchase_items`
--

INSERT INTO `purchase_items` (`id`, `purchase_id`, `item_name`, `quantity`, `unit_price`, `item_id`) VALUES 
(12,9,'Eggs',50,20.00,3),
(13,10,'Sugar',100,120.00,2),
(14,11,'Sugar',10,120.00,2),
(15,14,'Wheat Flour',10,110.00,1),
(16,15,'Wheat Flour',10,110.00,1),
(17,16,'Eggs',50,20.02,3);

--
-- Table structure for table `opening_balances`
--

CREATE TABLE `opening_balances` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `item_id` INT NOT NULL,
  `quantity` DECIMAL(10,3) NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_id` (`item_id`),
  CONSTRAINT `fk_ob_item_id` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE opening_balances DROP FOREIGN KEY opening_balances_ibfk_2;

ALTER TABLE opening_balances
DROP COLUMN unit_cost,
DROP COLUMN entered_by,
DROP COLUMN total_value;

--
-- Dumping data for table `opening_balances`
--

INSERT INTO `opening_balances` (`id`, `date`, `item_id`, `quantity`, `unit_cost`, `entered_by`, `created_at`) VALUES 
(1,'2025-08-11',3,200,20.00,2,'2025-08-11 09:47:48'),
(2,'2025-08-12',1,50,100.00,2,'2025-08-12 10:48:29'),
(3,'2025-08-13',2,500,120.00,5,'2025-08-14 03:45:22');

--
-- Table structure for table `issuances`
--

CREATE TABLE `issuances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `issuance_date` datetime NOT NULL,
  `issued_by` int NOT NULL,
  `department_id` int NOT NULL,
  `received_by` varchar(255) NOT NULL,
  `remarks` text,
  `approved_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `department_id` (`department_id`),
  KEY `issued_by` (`issued_by`),
  CONSTRAINT `issuances_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `issuances_ibfk_2` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `issuances`
--

INSERT INTO `issuances` VALUES 
(2,'2025-08-14 00:00:00',5,2,'Admin','','Admin','2025-08-14 03:46:41'),
(3,'2025-08-14 00:00:00',5,1,'Admin','','Admin','2025-08-14 03:59:17');

--
-- Table structure for table `issuance_items`
--

CREATE TABLE `issuance_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `issuance_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` decimal(10,3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `issuance_id` (`issuance_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `issuance_items_ibfk_1` FOREIGN KEY (`issuance_id`) REFERENCES `issuances` (`id`) ON DELETE CASCADE,
  CONSTRAINT `issuance_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `issuance_items`
--

INSERT INTO `issuance_items` VALUES 
(2,2,2,200),
(3,3,2,20);


--
-- Table structure for table `wastage_items`
--

CREATE TABLE `wastage_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wastage_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` decimal(10,3) DEFAULT NULL,
  `estimated_loss` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `wastage_id` (`wastage_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `wastage_items_ibfk_1` FOREIGN KEY (`wastage_id`) REFERENCES `wastages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `wastage_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `wastage_items`
--

INSERT INTO `wastage_items` VALUES (3,12,2,10,1200.00);

--
-- Table structure for table `wastages`
--

CREATE TABLE `wastages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wastage_note_number` varchar(20) NOT NULL,
  `date` date NOT NULL,
  `approved_by` varchar(255) NOT NULL,
  `reason` enum('Expired','Damaged','Overproduction','Poor Storage','Forecasting errors','Human error','Other') NOT NULL,
  `remarks` text,
  `attachment_path` varchar(255) DEFAULT NULL,
  `entered_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wastage_note_number` (`wastage_note_number`),
  KEY `entered_by` (`entered_by`),
  CONSTRAINT `wastages_ibfk_1` FOREIGN KEY (`entered_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `wastages`
--

INSERT INTO `wastages` VALUES (12,'WN-008193CB','2025-08-14','Admin','Human error','',NULL,5,'2025-08-14 09:41:30');


-- Table structure for table `FinishedGoodsItems`
--

CREATE TABLE IF NOT EXISTS `finished_goods_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_code` varchar(20) NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` enum('Cake','Bakery','Pastry','Chinese','Savory','Beverage','Other') NOT NULL DEFAULT 'Other',
  `unit_price` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `item_code` (`item_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert sample data
INSERT INTO `finished_goods_items` (`item_code`, `name`, `category`, `unit_price`) VALUES 
('FG001', 'Chocolate Cake', 'Cake', 1500.00),
('FG002', 'Blueberry Muffin', 'Bakery', 300.00),
('FG003', 'Croissant', 'Pastry', 250.00),
('FG004', 'Spring Roll', 'Chinese', 100.00),
('FG005', 'Chicken Pie', 'Savory', 400.00),
('FG006', 'Cappuccino', 'Beverage', 200.00),
('FG007', 'Lemon Tart', 'Pastry', 350.00);

-- Table structure for table `FinishedGoodsOpeningBalances`
--

CREATE TABLE IF NOT EXISTS `finished_goods_opening_balances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `date` date NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_item_id` (`item_id`),
  KEY `fk_fgob_item_id` (`item_id`),
  CONSTRAINT `fk_fgob_item_id` FOREIGN KEY (`item_id`) REFERENCES `finished_goods_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert sample data
INSERT INTO `finished_goods_opening_balances` (`date`, `item_id`, `quantity`) VALUES 
('2025-08-25', 1, 10),
('2025-08-25', 2, 25),
('2025-08-25', 3, 30),
('2025-08-25', 4, 50),
('2025-08-25', 5, 15);

-- Table structure for table `FinishedGoodsProduction`
--
CREATE TABLE `finished_goods_productions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_date` date NOT NULL,
  `prepared_by` varchar(255) NOT NULL,
  `status` enum('Draft','Completed','Cancelled') NOT NULL DEFAULT 'Draft',
  `remarks` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `FinishedGoodsProductionItems`
CREATE TABLE `finished_goods_production_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `production_id` (`production_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `production_items_ibfk_1` FOREIGN KEY (`production_id`) REFERENCES `finished_goods_productions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `production_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `finished_goods_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- Insert sample data into productions table
INSERT INTO `finished_goods_productions` (`production_date`, `prepared_by`, `remarks`, `status`, `created_at`) VALUES 
('2025-08-25', 'Chef John', 'Morning batch production', 'Completed', '2025-08-25 08:30:00'),
('2025-08-25', 'Baker Mary', 'Special orders for events', 'Completed', '2025-08-25 10:15:00'),
('2025-08-26', 'Pastry Chef Alex', 'Weekly pastry production', 'Completed', '2025-08-26 07:45:00'),
('2025-08-26', 'Baker Robert', 'Bread and muffin batch', 'Completed', '2025-08-26 09:30:00'),
('2025-08-27', 'Chef Sarah', 'Draft production for testing', 'Draft', '2025-08-27 08:00:00');

-- Insert sample data into production_items table
INSERT INTO `finished_goods_productions` (`id`, `item_id`, `quantity`) VALUES 
(1, 1, 5),   -- Chocolate Cake x5
(1, 4, 20),  -- Blueberry Muffin x20
(1, 6, 15),  -- Croissant x15
(2, 2, 3),   -- Vanilla Cake x3
(2, 3, 2),   -- Red Velvet Cake x2
(2, 15, 4),  -- Cheese Cake x4
(3, 6, 25),  -- Croissant x25
(3, 7, 20),  -- Danish Pastry x20
(3, 13, 10), -- Lemon Tart x10
(3, 14, 8),  -- Apple Pie x8
(4, 4, 30),  -- Blueberry Muffin x30
(4, 5, 25),  -- Chocolate Chip Muffin x25
(4, 9, 15),  -- Chicken Pie x15
(4, 10, 40), -- Vegetable Samosa x40
(5, 1, 2),   -- Chocolate Cake x2 (Draft)
(5, 11, 10); -- Cappuccino x10 (Draft)

-- Table for transfer destinations/departments
CREATE TABLE IF NOT EXISTS `transfer_destinations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert transfer destinations
INSERT INTO `transfer_destinations` (`name`) VALUES 
('Cafe'),
('MAS Ayathi'),
('MAS Brew Bar'),
('MAS Kreedy');

-- Table for finished goods transfers
CREATE TABLE IF NOT EXISTS `finished_goods_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_date` date NOT NULL,
  `transfer_number` varchar(50) NOT NULL,
  `transferred_by` varchar(255) NOT NULL,
  `destination_id` int NOT NULL,
  `remarks` text,
  `status` enum('Draft','Completed','Cancelled') NOT NULL DEFAULT 'Draft',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transfer_number` (`transfer_number`),
  KEY `destination_id` (`destination_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `fg_transfers_ibfk_1` FOREIGN KEY (`destination_id`) REFERENCES `transfer_destinations` (`id`),
  CONSTRAINT `fg_transfers_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table for transfer items
CREATE TABLE IF NOT EXISTS `finished_goods_transfer_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `transfer_id` (`transfer_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `fg_transfer_items_ibfk_1` FOREIGN KEY (`transfer_id`) REFERENCES `finished_goods_transfers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fg_transfer_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `finished_goods_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `finished_goods_transfers` (`transfer_date`, `transfer_number`, `transferred_by`, `destination_id`, `remarks`, `created_by`) 
VALUES ('2025-08-25', 'TRF-A1B2C3D4E5', 'John Baker', 1, 'Morning delivery for cafe opening', 2);

-- Transfer items for sample 1
INSERT INTO `finished_goods_transfer_items` (`transfer_id`, `item_id`, `quantity`) VALUES 
(1, 1, 5), 
(1, 2, 20),
(1, 6, 15),
(1, 5, 30);

-- Table for finished goods wastages
CREATE TABLE IF NOT EXISTS `finished_goods_wastages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wastage_number` varchar(50) NOT NULL,
  `date` date NOT NULL,
  `approved_by` varchar(255) NOT NULL,
  `reason` enum('Expired','Damaged','Overproduction','Poor Storage','Forecasting errors','Human error','Other') NOT NULL,
  `remarks` text,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wastage_number` (`wastage_number`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `fg_wastages_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table for finished goods wastage items
CREATE TABLE IF NOT EXISTS `finished_goods_wastage_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wastage_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `estimated_loss` decimal(10,2) DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `wastage_id` (`wastage_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `fg_wastage_items_ibfk_1` FOREIGN KEY (`wastage_id`) REFERENCES `finished_goods_wastages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fg_wastage_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `finished_goods_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert sample wastage record
INSERT INTO `finished_goods_wastages` (`wastage_number`, `date`, `approved_by`, `reason`, `remarks`, `created_by`) 
VALUES ('WST-0011223344', '2025-08-26', 'Manager Alice', 'Expired', 'Wastage due to expired items in storage', 2);  

-- Insert sample wastage items
INSERT INTO `finished_goods_wastage_items` (`wastage_id`, `item_id`, `quantity`, `estimated_loss`) VALUES
(1, 1, 10, 100.00),
(1, 2, 5, 50.00),
(1, 3, 2, 20.00);

-- Add production_id to finished_goods_wastage_items table
ALTER TABLE finished_goods_wastage_items 
ADD COLUMN production_id INT NULL AFTER item_id,
ADD CONSTRAINT fk_wastage_production_id 
FOREIGN KEY (production_id) REFERENCES finished_goods_productions(id);

-- Add wastage_type to finished_goods_wastages table
ALTER TABLE finished_goods_wastages 
ADD COLUMN wastage_type ENUM('General', 'Production') NOT NULL DEFAULT 'General';

-- Add department_id column to finished_goods_wastages table
ALTER TABLE finished_goods_wastages 
ADD COLUMN department_id INT NULL AFTER wastage_type;

-- Add foreign key constraint
ALTER TABLE finished_goods_wastages 
ADD CONSTRAINT fk_wastage_department_id 
FOREIGN KEY (department_id) REFERENCES departments(id);

-- Update existing records if needed (set to a default department or leave as NULL)
UPDATE finished_goods_wastages SET department_id = 1 WHERE department_id IS NULL;

-- Add department_id to finished_goods_transfers table
ALTER TABLE finished_goods_transfers 
ADD COLUMN department_id INT NULL AFTER transferred_by;

-- Add foreign key constraint
ALTER TABLE finished_goods_transfers 
ADD CONSTRAINT fk_transfer_department_id 
FOREIGN KEY (department_id) REFERENCES departments(id);

-- Update existing records with a default department
UPDATE finished_goods_transfers SET department_id = 1 WHERE department_id IS NULL;

-- Create cost_calculations table
CREATE TABLE `cost_calculations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `finished_good_id` int NOT NULL,
  `finished_good_name` varchar(255) NOT NULL,
  `output_quantity` int NOT NULL,
  `total_cost` decimal(10,2) NOT NULL,
  `per_unit_cost` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `finished_good_id` (`finished_good_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Create cost_calculation_ingredients table
CREATE TABLE `cost_calculation_ingredients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `calculation_id` int NOT NULL,
  `item_id` int NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `unit` varchar(20) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `cost` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `calculation_id` (`calculation_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `fk_cost_calc_ingredients_calc` FOREIGN KEY (`calculation_id`) REFERENCES `cost_calculations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table for finished goods ingredients
CREATE TABLE IF NOT EXISTS `finished_goods_ingredients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `finished_good_id` int NOT NULL,
  `raw_material_id` int NOT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `finished_good_id` (`finished_good_id`),
  KEY `raw_material_id` (`raw_material_id`),
  CONSTRAINT `fk_fg_ingredients_fg` FOREIGN KEY (`finished_good_id`) REFERENCES `finished_goods_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fg_ingredients_rm` FOREIGN KEY (`raw_material_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Make sure the finished_goods_ingredients table exists
CREATE TABLE IF NOT EXISTS `finished_goods_ingredients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `finished_good_id` int NOT NULL,
  `raw_material_id` int NOT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `finished_good_id` (`finished_good_id`),
  KEY `raw_material_id` (`raw_material_id`),
  CONSTRAINT `fk_fg_ingredients_fg` FOREIGN KEY (`finished_good_id`) REFERENCES `finished_goods_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fg_ingredients_rm` FOREIGN KEY (`raw_material_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table for finished goods sales (designation as foreign key to transfer_destinations)
CREATE TABLE IF NOT EXISTS `finished_goods_sales` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_number` varchar(50) NOT NULL,
  `sale_date` date NOT NULL,
  `designation` int NOT NULL,
  `cashier_name` varchar(255) NOT NULL,
  `remarks` text,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sale_number` (`sale_number`),
  KEY `created_by` (`created_by`),
  KEY `designation` (`designation`),
  CONSTRAINT `fg_sales_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fg_sales_ibfk_2` FOREIGN KEY (`designation`) REFERENCES `transfer_destinations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table for finished goods sale items
CREATE TABLE IF NOT EXISTS `finished_goods_sale_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sale_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `total_value` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sale_id` (`sale_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `fg_sale_items_ibfk_1` FOREIGN KEY (`sale_id`) REFERENCES `finished_goods_sales` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fg_sale_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `finished_goods_items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;