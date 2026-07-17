const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();

pool.getConnection()
  .then(() => console.log('MySQL Connected'))
  .catch(err => console.log(err));

const ensureItemTypeSchema = async () => {
  try {
    await pool.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) NULL DEFAULT 'Other' AFTER name");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_types (
        id INT NOT NULL AUTO_INCREMENT,
        type_name VARCHAR(50) NOT NULL UNIQUE,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    const defaultTypes = ['Vegetables', 'Meat', 'Packing', 'Other'];
    for (const typeName of defaultTypes) {
      await pool.query(
        'INSERT INTO item_types (type_name) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM item_types WHERE type_name = ?)',
        [typeName, typeName]
      );
    }
  } catch (error) {
    console.warn('Item type schema check skipped:', error.message);
  }
};

ensureItemTypeSchema();

const ensurePaymentMethodsSchema = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL UNIQUE,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    const defaults = ['Cash', 'Cheque', 'Bank'];
    for (const name of defaults) {
      await pool.query(
        'INSERT INTO payment_methods (name, is_active) SELECT ?, 1 WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = ?)',
        [name, name]
      );
    }
    console.log('✅ payment_methods table ready');
  } catch (error) {
    console.warn('Payment methods schema check skipped:', error.message);
  }
};

ensurePaymentMethodsSchema();

module.exports = pool;