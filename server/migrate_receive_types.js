// migrate_receive_types.js
// Run once: node migrate_receive_types.js
const pool = require('./config/db');

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS receive_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type_name VARCHAR(100) NOT NULL UNIQUE,
        status TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('receive_types table created (or already exists).');

    const seeds = ['Customer Payment', 'Owner Capital', 'Other Income', 'Adjustment'];
    for (const name of seeds) {
      const [rows] = await pool.query(
        'SELECT id FROM receive_types WHERE type_name = ?',
        [name]
      );
      if (rows.length === 0) {
        await pool.query('INSERT INTO receive_types (type_name) VALUES (?)', [name]);
        console.log('  Seeded:', name);
      } else {
        console.log('  Already exists:', name);
      }
    }
    console.log('Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
