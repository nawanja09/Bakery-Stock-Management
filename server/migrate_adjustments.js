const pool = require('./config/db');

async function runMigration() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id INT NOT NULL AUTO_INCREMENT,
        date DATETIME NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        reference_note VARCHAR(255),
        item_id INT NOT NULL,
        system_qty DECIMAL(10,3) NOT NULL,
        actual_qty DECIMAL(10,3) NOT NULL,
        variance DECIMAL(10,3) NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
    console.log("Migration successful: stock_adjustments table created.");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

runMigration();
