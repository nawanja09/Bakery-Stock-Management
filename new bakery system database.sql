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