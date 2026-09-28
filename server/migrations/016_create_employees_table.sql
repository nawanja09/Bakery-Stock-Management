-- 016_create_employees_table.sql
-- Employee Management module.
-- Non-destructive / additive only. This file documents the schema; the app
-- also self-applies it at startup via config/db.js (ensureEmployeesSchema),
-- following this project's existing migration convention (no separate
-- migration-runner).
--
-- `employees` are company staff records used for HR purposes and are
-- intentionally separate from `users` (application login accounts).
-- department_id reuses the existing `departments` master table.
-- Staff Loans (a future module) will reference employees.id - not
-- implemented here.

CREATE TABLE IF NOT EXISTS `employees` (
  `id`               INT NOT NULL AUTO_INCREMENT,
  `employee_code`    VARCHAR(30) NOT NULL,
  `employee_name`    VARCHAR(150) NOT NULL,
  `nic`              VARCHAR(20) NULL,
  `contact_number`   VARCHAR(15) NULL,
  `department_id`    INT NULL,
  `designation`      VARCHAR(100) NULL,
  `company`          VARCHAR(100) NULL,
  `joining_date`     DATE NULL,
  `status`           ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_by`       INT NULL,
  `created_at`       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_employees_employee_code` (`employee_code`),
  UNIQUE KEY `uniq_employees_nic` (`nic`),
  KEY `idx_employees_department` (`department_id`),
  KEY `idx_employees_status` (`status`),
  CONSTRAINT `fk_employees_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
