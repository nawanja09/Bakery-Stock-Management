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

ALTER TABLE finished_goods_wastages 
ADD COLUMN destination_id INT NULL AFTER department_id;

ALTER TABLE finished_goods_wastages 
ADD CONSTRAINT fk_wastage_destination_id 
FOREIGN KEY (destination_id) REFERENCES transfer_destinations(id);

-- Update finished_goods_production_items table
ALTER TABLE `finished_goods_production_items` 
ADD COLUMN `unit_price` DECIMAL(10,2) DEFAULT 0,
ADD COLUMN `cost_price` DECIMAL(10,2) DEFAULT 0,
ADD COLUMN `total_cost` DECIMAL(10,2) DEFAULT 0,
ADD COLUMN `output_quantity` INT DEFAULT 1,
ADD COLUMN `utility_cost` DECIMAL(10,2) DEFAULT 0,
ADD COLUMN `per_unit_cost` DECIMAL(10,2) DEFAULT 0;

-- Create production_cost_calculations table
CREATE TABLE IF NOT EXISTS `production_cost_calculations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_id` int NOT NULL,
  `item_id` int NOT NULL,
  `total_raw_materials` DECIMAL(10,3) DEFAULT 0,
  
  `id` int NOT NULL AUTO_INCREMENT,
  `return_number` varchar(50) NOT NULL,
  `return_date` date NOT NULL,
  `department_id` int NOT NULL,
  `received_by` varchar(255) NOT NULL,
  `remarks` text,
  `entered_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `return_number` (`return_number`),
  KEY `department_id` (`department_id`),
  KEY `entered_by` (`entered_by`),
  CONSTRAINT `returns_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `returns_ibfk_2` FOREIGN KEY (`entered_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `return_items`
CREATE TABLE IF NOT EXISTS `return_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `return_id` int NOT NULL,
  `item_id` int NOT NULL,
  `quantity` decimal(10,3) NOT NULL,
  `reason` enum('Excess','Damaged','Wrong Issue','Expired','Other') NOT NULL DEFAULT 'Excess',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `return_id` (`return_id`),
  KEY `item_id` (`item_id`),
  CONSTRAINT `return_items_ibfk_1` FOREIGN KEY (`return_id`) REFERENCES `returns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `return_items_ibfk_2` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

------
-- Add a deleted column to items table
ALTER TABLE items ADD COLUMN deleted BOOLEAN DEFAULT FALSE;

-- 1. Update finished_goods_items table to make output_quantity required
ALTER TABLE finished_goods_items 
MODIFY COLUMN output_quantity INT NOT NULL DEFAULT 1;

-- 2. Update existing records safely
SET SQL_SAFE_UPDATES = 0;

UPDATE finished_goods_items 
SET output_quantity = 1 
WHERE output_quantity IS NULL OR output_quantity = 0;

SET SQL_SAFE_UPDATES = 1;

-- 3. Verify the changes
SELECT id, item_code, name, output_quantity 
FROM finished_goods_items;

--To remove the 'CREDIT' option from the payment_method column, you need to modify the enum type.

--1️⃣ First, update all 'CREDIT' records:
UPDATE purchases 
SET payment_method = 'CASH' 
WHERE payment_method = 'CREDIT';

--2️⃣ Then, modify the column to exclude 'CREDIT':
ALTER TABLE purchases 
MODIFY payment_method ENUM('CASH', 'BANK_TRANSFER') NOT NULL;

--------------------------------------------------------------------

-- Table structure for table `cutlery_locations`
CREATE TABLE `cutlery_locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` varchar(20) NOT NULL,
  `location_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `location_id` (`location_id`),
  UNIQUE KEY `location_name` (`location_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `cutlery_assets`
CREATE TABLE `cutlery_assets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` varchar(20) NOT NULL,
  `asset_name` varchar(255) NOT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `asset_id` (`asset_id`),
  UNIQUE KEY `asset_name` (`asset_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `cutlery_transfers`
CREATE TABLE `cutlery_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_id` varchar(20) NOT NULL,
  `transfer_date` date NOT NULL,
  `location_from_id` int NOT NULL,
  `location_to_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `notes` text,
  `transferred_by` varchar(255) NOT NULL,
  `status` enum('Pending','Completed','Cancelled') DEFAULT 'Pending',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transfer_id` (`transfer_id`),
  KEY `location_from_id` (`location_from_id`),
  KEY `location_to_id` (`location_to_id`),
  KEY `asset_id` (`asset_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `cutlery_transfers_ibfk_1` FOREIGN KEY (`location_from_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_2` FOREIGN KEY (`location_to_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_3` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Optional: Table for tracking stock at each location
CREATE TABLE `cutlery_stock` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `location_asset` (`location_id`,`asset_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_stock_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_stock_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `cutlery_suppliers`
CREATE TABLE `cutlery_suppliers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(255) NOT NULL,
  `contact_person` varchar(255),
  `phone` varchar(20),
  `email` varchar(255),
  `address` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `supplier_name` (`supplier_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert some sample suppliers
INSERT INTO `cutlery_suppliers` (`supplier_name`, `contact_person`, `phone`, `email`, `address`) VALUES
('Cutlery World Ltd', 'John Smith', '0112345678', 'john@cutleryworld.lk', '123 Main Street, Colombo'),
('Kitchen Supplies Co', 'Mary Johnson', '0118765432', 'mary@kitchensupplies.lk', '456 High Street, Kandy');

-- Table structure for table `cutlery_purchases`
CREATE TABLE `cutlery_purchases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_id` varchar(20) NOT NULL,
  `purchase_date` date NOT NULL,
  `supplier_id` int NOT NULL,
  `invoice_number` varchar(100) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` enum('CASH','BANK_TRANSFER','CREDIT') DEFAULT 'CASH',
  `payment_status` enum('PENDING','PAID','PARTIAL') DEFAULT 'PENDING',
  `notes` text,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_id` (`purchase_id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `supplier_id` (`supplier_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `cutlery_purchases_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `cutlery_suppliers` (`id`),
  CONSTRAINT `cutlery_purchases_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `cutlery_purchase_items`
CREATE TABLE `cutlery_purchase_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `unit_price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_price` decimal(10,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) STORED,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `purchase_id` (`purchase_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_purchase_items_ibfk_1` FOREIGN KEY (`purchase_id`) REFERENCES `cutlery_purchases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cutlery_purchase_items_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `cutlery_damages`
CREATE TABLE `cutlery_damages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `damage_id` varchar(20) NOT NULL,
  `damage_date` date NOT NULL,
  `location_id` int NOT NULL,
  `reason` enum('Broken','Lost','Worn Out','Theft','Other') NOT NULL,
  `notes` text,
  `reported_by` varchar(255) NOT NULL,
  `status` enum('Reported','Confirmed','Repaired','Written Off') DEFAULT 'Reported',
  `estimated_loss` decimal(10,2) DEFAULT 0.00,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `damage_id` (`damage_id`),
  KEY `location_id` (`location_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `cutlery_damages_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_damages_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table structure for table `cutlery_damage_items`
CREATE TABLE `cutlery_damage_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `damage_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `unit_price` decimal(10,2) DEFAULT 0.00,
  `total_loss` decimal(10,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) STORED,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `damage_id` (`damage_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_damage_items_ibfk_1` FOREIGN KEY (`damage_id`) REFERENCES `cutlery_damages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cutlery_damage_items_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- From your schema
CREATE TABLE `cutlery_stock` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `location_asset` (`location_id`,`asset_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_stock_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_stock_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- First, let's check if purchase_items table has the right structure
SHOW COLUMNS FROM cutlery_purchase_items;

-- If the asset_id column doesn't exist or has wrong name, fix it:
ALTER TABLE cutlery_purchase_items 
CHANGE COLUMN item_id asset_id INT NOT NULL;

-- Or if item_id doesn't exist, add asset_id:
ALTER TABLE cutlery_purchase_items 
ADD COLUMN asset_id INT NOT NULL AFTER purchase_id;

-- Add foreign key constraint
ALTER TABLE cutlery_purchase_items 
ADD CONSTRAINT fk_cutlery_purchase_items_asset 
FOREIGN KEY (asset_id) REFERENCES cutlery_assets(id);

-- Also check the damage_items table
ALTER TABLE cutlery_damage_items 
CHANGE COLUMN item_id asset_id INT NOT NULL;

-- Add foreign key constraint for damages
ALTER TABLE cutlery_damage_items 
ADD CONSTRAINT fk_cutlery_damage_items_asset 
FOREIGN KEY (asset_id) REFERENCES cutlery_assets(id);

-- Create a view to debug purchase data
CREATE OR REPLACE VIEW purchase_debug_view AS
SELECT 
  cp.id as purchase_id,
  cp.purchase_date,
  cp.invoice_number,
  cpi.asset_id,
  ca.asset_name,
  cpi.quantity,
  cpi.unit_price
FROM cutlery_purchases cp
JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
JOIN cutlery_assets ca ON cpi.asset_id = ca.id
ORDER BY cp.purchase_date DESC;

-- Step 1: Drop dependent tables first (in correct order)
DROP TABLE IF EXISTS backery_system.cutlery_damage_items;
DROP TABLE IF EXISTS backery_system.cutlery_damages;
DROP TABLE IF EXISTS backery_system.cutlery_purchase_items;
DROP TABLE IF EXISTS backery_system.cutlery_purchases;
DROP TABLE IF EXISTS backery_system.cutlery_transfers;
DROP TABLE IF EXISTS backery_system.cutlery_stock;
DROP TABLE IF EXISTS backery_system.cutlery_suppliers;
DROP TABLE IF EXISTS backery_system.cutlery_stock_history;
DROP TABLE IF EXISTS backery_system.location_mapping;
DROP TABLE IF EXISTS backery_system.cutlery_assets;
DROP TABLE IF EXISTS backery_system.cutlery_locations;

-- =============================================
-- 1. LOCATIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` varchar(20) NOT NULL,
  `location_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `location_id` (`location_id`),
  UNIQUE KEY `location_name` (`location_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert default locations
INSERT INTO `cutlery_locations` (`location_id`, `location_name`) VALUES
('L001', 'Stores'),
('L002', 'Café M'),
('L003', 'Café N'),
('L004', 'Ayathi'),
('L005', 'Active'),
('L006', 'Kreeda'),
('L007', 'Brew'),
('L008', 'Restaurant');

-- =============================================
-- 2. ASSETS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_assets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `asset_id` varchar(20) NOT NULL,
  `asset_name` varchar(255) NOT NULL,
  `image_path` varchar(500) DEFAULT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `asset_id` (`asset_id`),
  UNIQUE KEY `asset_name` (`asset_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert sample assets including Affogato Cup
INSERT INTO `cutlery_assets` (`asset_id`, `asset_name`, `description`) VALUES
('A001', 'Spoon', 'Standard stainless steel spoon'),
('A002', 'Fork', 'Standard stainless steel fork'),
('A003', 'Knife', 'Standard stainless steel knife'),
('A004', 'Plate', 'Ceramic dinner plate'),
('A005', 'Bowl', 'Ceramic soup bowl'),
('A006', 'Cup', 'Coffee/Tea cup'),
('A007', 'Affogato Cup', 'Special cup for Affogato'),
('A008', 'Saucer', 'Tea saucer'),
('A009', 'Tray', 'Serving tray'),
('A010', 'Teapot', 'Ceramic teapot');

-- =============================================
-- 3. SUPPLIERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_suppliers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(255) NOT NULL,
  `contact_person` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `supplier_name` (`supplier_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert sample suppliers
INSERT INTO `cutlery_suppliers` (`supplier_name`, `contact_person`, `phone`, `email`, `address`) VALUES
('Cutlery World Ltd', 'John Smith', '0112345678', 'john@cutleryworld.lk', '123 Main Street, Colombo'),
('Kitchen Supplies Co', 'Mary Johnson', '0118765432', 'mary@kitchensupplies.lk', '456 High Street, Kandy');

-- =============================================
-- 4. PURCHASES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_purchases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_id` varchar(20) NOT NULL,
  `purchase_date` date NOT NULL,
  `supplier_id` int NOT NULL,
  `invoice_number` varchar(100) NOT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `payment_method` enum('CASH','BANK_TRANSFER','CREDIT') DEFAULT 'CASH',
  `payment_status` enum('PENDING','PAID','PARTIAL') DEFAULT 'PENDING',
  `notes` text,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `purchase_id` (`purchase_id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `supplier_id` (`supplier_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `cutlery_purchases_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `cutlery_suppliers` (`id`),
  CONSTRAINT `cutlery_purchases_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================
-- 5. PURCHASE ITEMS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_purchase_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_price` decimal(10,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) STORED,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `purchase_id` (`purchase_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_purchase_items_ibfk_1` FOREIGN KEY (`purchase_id`) REFERENCES `cutlery_purchases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cutlery_purchase_items_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================
-- 6. TRANSFERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_id` varchar(20) NOT NULL,
  `transfer_date` date NOT NULL,
  `location_from_id` int NOT NULL,
  `location_to_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `notes` text,
  `transferred_by` varchar(255) NOT NULL,
  `status` enum('Pending','Completed','Cancelled') DEFAULT 'Pending',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transfer_id` (`transfer_id`),
  KEY `location_from_id` (`location_from_id`),
  KEY `location_to_id` (`location_to_id`),
  KEY `asset_id` (`asset_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `cutlery_transfers_ibfk_1` FOREIGN KEY (`location_from_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_2` FOREIGN KEY (`location_to_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_3` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================
-- 7. DAMAGES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_damages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `damage_id` varchar(20) NOT NULL,
  `damage_date` date NOT NULL,
  `location_id` int NOT NULL,
  `reason` enum('Broken','Lost','Worn Out','Theft','Other') NOT NULL,
  `notes` text,
  `reported_by` varchar(255) NOT NULL,
  `status` enum('Reported','Confirmed','Repaired','Written Off') DEFAULT 'Reported',
  `estimated_loss` decimal(10,2) DEFAULT '0.00',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `damage_id` (`damage_id`),
  KEY `location_id` (`location_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `cutlery_damages_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_damages_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================
-- 8. DAMAGE ITEMS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_damage_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `damage_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) DEFAULT '0.00',
  `total_loss` decimal(10,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) STORED,
  `notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `damage_id` (`damage_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_damage_items_ibfk_1` FOREIGN KEY (`damage_id`) REFERENCES `cutlery_damages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cutlery_damage_items_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================
-- 9. STOCK TABLE (Current stock tracking)
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_stock` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `location_asset` (`location_id`,`asset_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_stock_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_stock_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================
-- 10. STOCK HISTORY TABLE (For reporting)
-- =============================================

CREATE TABLE IF NOT EXISTS `cutlery_stock_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `location_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '0',
  `transaction_type` enum('PURCHASE','TRANSFER','DAMAGE','ADJUSTMENT') NOT NULL,
  `transaction_id` int DEFAULT NULL,
  `reference` varchar(50) DEFAULT NULL,
  `notes` text,
  `recorded_at` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `location_id` (`location_id`),
  KEY `asset_id` (`asset_id`),
  KEY `recorded_at` (`recorded_at`),
  CONSTRAINT `cutlery_stock_history_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_stock_history_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- =============================================
-- CORRECTED TRIGGERS (WITH DECLARE AT BEGINNING)
-- =============================================

DELIMITER $$

-- Trigger for purchases
CREATE TRIGGER after_purchase_insert
AFTER INSERT ON cutlery_purchase_items
FOR EACH ROW
BEGIN
    DECLARE purchase_date_val DATE;
    DECLARE purchase_id_val VARCHAR(20);
    
    SELECT purchase_date, purchase_id INTO purchase_date_val, purchase_id_val 
    FROM cutlery_purchases 
    WHERE id = NEW.purchase_id;
    
    -- Add stock to Stores
    INSERT INTO cutlery_stock_history 
    (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
    VALUES (
        1,
        NEW.asset_id,
        NEW.quantity,
        'PURCHASE',
        NEW.purchase_id,
        purchase_id_val,
        purchase_date_val
    );
    
    INSERT INTO cutlery_stock (location_id, asset_id, quantity)
    VALUES (1, NEW.asset_id, NEW.quantity)
    ON DUPLICATE KEY UPDATE 
    quantity = quantity + NEW.quantity,
    updated_at = CURRENT_TIMESTAMP;
END$$

-- Trigger for transfers
CREATE TRIGGER after_transfer_insert
AFTER INSERT ON cutlery_transfers
FOR EACH ROW
BEGIN
    IF NEW.status = 'Completed' THEN
        -- Deduct from source
        INSERT INTO cutlery_stock_history 
        (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
        VALUES (
            NEW.location_from_id,
            NEW.asset_id,
            -NEW.quantity,
            'TRANSFER',
            NEW.id,
            NEW.transfer_id,
            NEW.transfer_date
        );
        
        -- Add to destination
        INSERT INTO cutlery_stock_history 
        (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
        VALUES (
            NEW.location_to_id,
            NEW.asset_id,
            NEW.quantity,
            'TRANSFER',
            NEW.id,
            NEW.transfer_id,
            NEW.transfer_date
        );
        
        -- Update source stock
        INSERT INTO cutlery_stock (location_id, asset_id, quantity)
        VALUES (NEW.location_from_id, NEW.asset_id, -NEW.quantity)
        ON DUPLICATE KEY UPDATE 
        quantity = quantity - NEW.quantity,
        updated_at = CURRENT_TIMESTAMP;
        
        -- Update destination stock
        INSERT INTO cutlery_stock (location_id, asset_id, quantity)
        VALUES (NEW.location_to_id, NEW.asset_id, NEW.quantity)
        ON DUPLICATE KEY UPDATE 
        quantity = quantity + NEW.quantity,
        updated_at = CURRENT_TIMESTAMP;
    END IF;
END$$

-- Trigger for damages
CREATE TRIGGER after_damage_insert
AFTER INSERT ON cutlery_damage_items
FOR EACH ROW
BEGIN
    DECLARE damage_location_id INT;
    DECLARE damage_date_val DATE;
    DECLARE damage_id_val VARCHAR(20);
    
    SELECT location_id, damage_date, damage_id 
    INTO damage_location_id, damage_date_val, damage_id_val
    FROM cutlery_damages 
    WHERE id = NEW.damage_id;
    
    INSERT INTO cutlery_stock_history 
    (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
    VALUES (
        damage_location_id,
        NEW.asset_id,
        -NEW.quantity,
        'DAMAGE',
        NEW.damage_id,
        damage_id_val,
        damage_date_val
    );
    
    INSERT INTO cutlery_stock (location_id, asset_id, quantity)
    VALUES (damage_location_id, NEW.asset_id, -NEW.quantity)
    ON DUPLICATE KEY UPDATE 
    quantity = quantity - NEW.quantity,
    updated_at = CURRENT_TIMESTAMP;
END$$

DELIMITER ;

-- =============================================
-- STORED PROCEDURES FOR REPORTS
-- =============================================

DELIMITER $$

DROP PROCEDURE IF EXISTS GetStockReportByDate$$
CREATE PROCEDURE GetStockReportByDate(IN report_date DATE)
BEGIN
    IF report_date IS NULL THEN
        SET report_date = CURDATE();
    END IF;
    
    SELECT 
        a.asset_id as asset_code,
        a.asset_name,
        a.description,
        COALESCE(SUM(CASE WHEN l.location_name = 'Stores' THEN sh.total_qty ELSE 0 END), 0) as Stores,
        COALESCE(SUM(CASE WHEN l.location_name = 'Café M' THEN sh.total_qty ELSE 0 END), 0) as `Café M`,
        COALESCE(SUM(CASE WHEN l.location_name = 'Café N' THEN sh.total_qty ELSE 0 END), 0) as `Café N`,
        COALESCE(SUM(CASE WHEN l.location_name = 'Ayathi' THEN sh.total_qty ELSE 0 END), 0) as Ayathi,
        COALESCE(SUM(CASE WHEN l.location_name = 'Active' THEN sh.total_qty ELSE 0 END), 0) as Active,
        COALESCE(SUM(CASE WHEN l.location_name = 'Kreeda' THEN sh.total_qty ELSE 0 END), 0) as Kreeda,
        COALESCE(SUM(CASE WHEN l.location_name = 'Brew' THEN sh.total_qty ELSE 0 END), 0) as Brew,
        COALESCE(SUM(CASE WHEN l.location_name = 'Restaurant' THEN sh.total_qty ELSE 0 END), 0) as Restaurant,
        COALESCE(SUM(sh.total_qty), 0) as Total
    FROM cutlery_assets a
    CROSS JOIN cutlery_locations l
    LEFT JOIN (
        SELECT 
            asset_id,
            location_id,
            SUM(quantity) as total_qty
        FROM cutlery_stock_history
        WHERE recorded_at <= report_date
        GROUP BY asset_id, location_id
    ) sh ON a.id = sh.asset_id AND l.id = sh.location_id
    GROUP BY a.id, a.asset_id, a.asset_name, a.description
    ORDER BY a.asset_code;
END$$

DELIMITER ;


-- =============================================
-- SAMPLE DATA (Matching your screenshot)
-- =============================================

-- Sample purchase: Affogato Cup x10 to Stores
INSERT INTO `cutlery_purchases` (`purchase_id`, `purchase_date`, `supplier_id`, `invoice_number`, `total_amount`, `payment_method`, `payment_status`, `created_by`) VALUES
('P001', '2025-12-15', 1, 'INV-2025-001', 5000.00, 'CASH', 'PAID', 2);

INSERT INTO `cutlery_purchase_items` (`purchase_id`, `asset_id`, `quantity`, `unit_price`) VALUES
(1, 7, 10, 500.00);  -- Affogato Cup x10 @ 500 LKR each

-- Sample transfer: Affogato Cup x3 from Stores to Café M
INSERT INTO `cutlery_transfers` (`transfer_id`, `transfer_date`, `location_from_id`, `location_to_id`, `asset_id`, `quantity`, `transferred_by`, `status`, `created_by`) VALUES
('T001', '2025-12-16', 1, 2, 7, 3, 'John Doe', 'Completed', 2);

-- Expected result:
-- Stores: 10 (purchase) - 3 (transfer) = 7
-- Café M: 0 + 3 (transfer) = 3
-- Other locations: 0

-- =============================================
-- TEST THE REPORT
-- =============================================

-- Test the stored procedure
CALL GetStockReportByDate('2025-12-16');

-- Should show:
-- Affogato Cup: Stores=7, Café M=3, others=0

COMMIT;

-- Drop dependent tables first (in correct order)
DROP TABLE IF EXISTS cutlery_transfer_items;
DROP TABLE IF EXISTS cutlery_transfers;

-- Recreate cutlery_transfers without asset_id and quantity
CREATE TABLE IF NOT EXISTS `cutlery_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_id` varchar(20) NOT NULL,
  `transfer_date` date NOT NULL,
  `location_from_id` int NOT NULL,
  `location_to_id` int NOT NULL,
  `notes` text,
  `transferred_by` varchar(255) NOT NULL,
  `status` enum('Pending','Completed','Cancelled') DEFAULT 'Pending',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transfer_id` (`transfer_id`),
  KEY `location_from_id` (`location_from_id`),
  KEY `location_to_id` (`location_to_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `cutlery_transfers_ibfk_1` FOREIGN KEY (`location_from_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_2` FOREIGN KEY (`location_to_id`) REFERENCES `cutlery_locations` (`id`),
  CONSTRAINT `cutlery_transfers_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Recreate cutlery_transfer_items
CREATE TABLE IF NOT EXISTS `cutlery_transfer_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `transfer_id` int NOT NULL,
  `asset_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `transfer_id` (`transfer_id`),
  KEY `asset_id` (`asset_id`),
  CONSTRAINT `cutlery_transfer_items_ibfk_1` FOREIGN KEY (`transfer_id`) REFERENCES `cutlery_transfers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cutlery_transfer_items_ibfk_2` FOREIGN KEY (`asset_id`) REFERENCES `cutlery_assets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Drop existing triggers
DROP TRIGGER IF EXISTS after_purchase_insert;
DROP TRIGGER IF EXISTS after_transfer_insert;
DROP TRIGGER IF EXISTS after_damage_insert;

DELIMITER $$

-- Trigger for purchases
CREATE TRIGGER after_purchase_insert
AFTER INSERT ON cutlery_purchase_items
FOR EACH ROW
BEGIN
    DECLARE purchase_date_val DATE;
    DECLARE purchase_id_val VARCHAR(20);
    
    SELECT purchase_date, purchase_id INTO purchase_date_val, purchase_id_val 
    FROM cutlery_purchases 
    WHERE id = NEW.purchase_id;
    
    -- Add stock to Stores (assuming Stores has id = 1)
    INSERT INTO cutlery_stock_history 
    (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
    VALUES (
        1, -- Stores location_id
        NEW.asset_id,
        NEW.quantity,
        'PURCHASE',
        NEW.purchase_id,
        purchase_id_val,
        purchase_date_val
    );
    
    -- Update current stock
    INSERT INTO cutlery_stock (location_id, asset_id, quantity)
    VALUES (1, NEW.asset_id, NEW.quantity)
    ON DUPLICATE KEY UPDATE 
    quantity = quantity + NEW.quantity,
    updated_at = CURRENT_TIMESTAMP;
END$$

-- Trigger for transfers
CREATE TRIGGER after_transfer_insert
AFTER INSERT ON cutlery_transfer_items
FOR EACH ROW
BEGIN
    DECLARE transfer_status VARCHAR(20);
    DECLARE location_from_id_val INT;
    DECLARE location_to_id_val INT;
    DECLARE transfer_date_val DATE;
    DECLARE transfer_id_val VARCHAR(20);
    
    -- Get transfer details
    SELECT ct.status, ct.location_from_id, ct.location_to_id, ct.transfer_date, ct.transfer_id 
    INTO transfer_status, location_from_id_val, location_to_id_val, transfer_date_val, transfer_id_val
    FROM cutlery_transfers ct
    WHERE ct.id = NEW.transfer_id;
    
    IF transfer_status = 'Completed' THEN
        -- Deduct from source location
        INSERT INTO cutlery_stock_history 
        (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
        VALUES (
            location_from_id_val,
            NEW.asset_id,
            -NEW.quantity,
            'TRANSFER',
            NEW.transfer_id,
            transfer_id_val,
            transfer_date_val
        );
        
        -- Add to destination location
        INSERT INTO cutlery_stock_history 
        (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
        VALUES (
            location_to_id_val,
            NEW.asset_id,
            NEW.quantity,
            'TRANSFER',
            NEW.transfer_id,
            transfer_id_val,
            transfer_date_val
        );
        
        -- Update source stock
        INSERT INTO cutlery_stock (location_id, asset_id, quantity)
        VALUES (location_from_id_val, NEW.asset_id, -NEW.quantity)
        ON DUPLICATE KEY UPDATE 
        quantity = quantity - NEW.quantity,
        updated_at = CURRENT_TIMESTAMP;
        
        -- Update destination stock
        INSERT INTO cutlery_stock (location_id, asset_id, quantity)
        VALUES (location_to_id_val, NEW.asset_id, NEW.quantity)
        ON DUPLICATE KEY UPDATE 
        quantity = quantity + NEW.quantity,
        updated_at = CURRENT_TIMESTAMP;
    END IF;
END$$

-- Trigger for damages
CREATE TRIGGER after_damage_insert
AFTER INSERT ON cutlery_damage_items
FOR EACH ROW
BEGIN
    DECLARE damage_location_id INT;
    DECLARE damage_date_val DATE;
    DECLARE damage_id_val VARCHAR(20);
    
    SELECT location_id, damage_date, damage_id 
    INTO damage_location_id, damage_date_val, damage_id_val
    FROM cutlery_damages 
    WHERE id = NEW.damage_id;
    
    -- Deduct from location
    INSERT INTO cutlery_stock_history 
    (location_id, asset_id, quantity, transaction_type, transaction_id, reference, recorded_at)
    VALUES (
        damage_location_id,
        NEW.asset_id,
        -NEW.quantity,
        'DAMAGE',
        NEW.damage_id,
        damage_id_val,
        damage_date_val
    );
    
    -- Update current stock
    INSERT INTO cutlery_stock (location_id, asset_id, quantity)
    VALUES (damage_location_id, NEW.asset_id, -NEW.quantity)
    ON DUPLICATE KEY UPDATE 
    quantity = quantity - NEW.quantity,
    updated_at = CURRENT_TIMESTAMP;
END$$

DELIMITER ;