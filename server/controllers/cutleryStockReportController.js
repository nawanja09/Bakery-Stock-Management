const pool = require('../config/db');

const getStockReport = async (req, res) => {
  try {
    const { report_date } = req.query;
    
    console.log('Generating stock report for date:', report_date);
    
    // If no date provided, use today's date
    const targetDate = report_date ? new Date(report_date) : new Date();
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    // Get all locations (Stores should be id=1 based on your schema)
    const [locations] = await pool.query(`
      SELECT id, location_id, location_name 
      FROM cutlery_locations 
      ORDER BY id
    `);
    
    console.log('Found locations:', locations.length);
    
    // Get all assets
    const [assets] = await pool.query(`
      SELECT id, asset_id, asset_name, description 
      FROM cutlery_assets 
      ORDER BY id
    `);
    
    console.log('Found assets:', assets.length);
    
    // Find Stores location (main storage)
    const storesLocation = locations.find(loc => loc.location_name === 'Stores');
    if (!storesLocation) {
      return res.status(500).json({
        success: false,
        error: 'Stores location not found. Please make sure you have a location named "Stores"'
      });
    }
    
    // Create a map for quick location lookup
    const locationMap = {};
    const locationIdToName = {};
    locations.forEach(loc => {
      locationMap[loc.id] = loc.location_name;
      locationIdToName[loc.id] = loc.location_name;
    });
    
    // Initialize stock object for all assets in all locations
    const stock = {};
    assets.forEach(asset => {
      stock[asset.id] = {
        item_id: asset.id,
        item_code: asset.asset_id,
        item_name: asset.asset_name,
        description: asset.description,
        locations: {}
      };
      
      // Initialize all locations with 0 stock
      locations.forEach(location => {
        stock[asset.id].locations[location.location_name] = 0;
      });
    });
    
    // ============================================
    // METHOD 1: Calculate from all transactions
    // ============================================
    
    // Get ALL purchases up to the report date (including future dates)
    const [allPurchases] = await pool.query(`
      SELECT 
        cpi.asset_id,
        cpi.quantity,
        cp.purchase_date
      FROM cutlery_purchases cp
      JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
      WHERE DATE(cp.purchase_date) <= ?
      AND cp.payment_status = 'PAID'
    `, [targetDateStr]);
    
    console.log('Found purchases up to date:', allPurchases.length);
    
    // Get ALL transfers up to the report date
    const [allTransfers] = await pool.query(`
      SELECT 
        cti.asset_id,
        ct.location_from_id,
        ct.location_to_id,
        cti.quantity,
        ct.transfer_date
      FROM cutlery_transfers ct
      JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
      WHERE DATE(ct.transfer_date) <= ?
      AND ct.status = 'Completed'
    `, [targetDateStr]);
    
    console.log('Found transfers up to date:', allTransfers.length);
    
    // Get ALL damages up to the report date
    const [allDamages] = await pool.query(`
      SELECT 
        cdi.asset_id,
        cd.location_id,
        cdi.quantity,
        cd.damage_date
      FROM cutlery_damages cd
      JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
      WHERE DATE(cd.damage_date) <= ?
    `, [targetDateStr]);
    
    console.log('Found damages up to date:', allDamages.length);
    
    // Process purchases (all purchases go to Stores)
    allPurchases.forEach(purchase => {
      if (stock[purchase.asset_id]) {
        stock[purchase.asset_id].locations['Stores'] += purchase.quantity;
      }
    });
    
    console.log('Processed purchases');
    
    // Process transfers
    allTransfers.forEach(transfer => {
      if (stock[transfer.asset_id]) {
        const fromLocation = locationIdToName[transfer.location_from_id];
        const toLocation = locationIdToName[transfer.location_to_id];
        
        // Subtract from source location
        if (fromLocation && stock[transfer.asset_id].locations[fromLocation] !== undefined) {
          stock[transfer.asset_id].locations[fromLocation] -= transfer.quantity;
        }
        
        // Add to destination location
        if (toLocation && stock[transfer.asset_id].locations[toLocation] !== undefined) {
          stock[transfer.asset_id].locations[toLocation] += transfer.quantity;
        }
      }
    });
    
    console.log('Processed transfers');
    
    // Process damages (subtract from relevant location)
    allDamages.forEach(damage => {
      if (stock[damage.asset_id]) {
        const locationName = locationIdToName[damage.location_id];
        if (locationName && stock[damage.asset_id].locations[locationName] !== undefined) {
          stock[damage.asset_id].locations[locationName] -= damage.quantity;
        }
      }
    });
    
    console.log('Processed damages');
    
    // Ensure no negative values (safety check)
    const stockData = Object.values(stock).map(asset => {
      Object.keys(asset.locations).forEach(location => {
        if (asset.locations[location] < 0) {
          console.warn(`Negative stock for ${asset.item_name} at ${location}: ${asset.locations[location]}`);
          asset.locations[location] = 0;
        }
      });
      return asset;
    });
    
    console.log('Stock calculation complete');
    
    // ============================================
    // METHOD 2: For debugging, also show current stock table
    // ============================================
    const [currentStock] = await pool.query(`
      SELECT 
        cs.asset_id,
        cs.location_id,
        cs.quantity,
        cl.location_name,
        ca.asset_name
      FROM cutlery_stock cs
      JOIN cutlery_locations cl ON cs.location_id = cl.id
      JOIN cutlery_assets ca ON cs.asset_id = ca.id
      ORDER BY cs.asset_id, cs.location_id
    `);
    
    console.log('Current stock from cutlery_stock table:', currentStock.length);
    
    // ============================================
    // METHOD 3: Check stock history
    // ============================================
    const [stockHistory] = await pool.query(`
      SELECT 
        asset_id,
        location_id,
        SUM(quantity) as total_quantity
      FROM cutlery_stock_history
      WHERE recorded_at <= ?
      GROUP BY asset_id, location_id
    `, [targetDateStr]);
    
    console.log('Stock history records:', stockHistory.length);
    
    res.json({
      success: true,
      report_date: targetDateStr,
      locations: locations.map(loc => loc.location_name),
      data: stockData,
      debug: {
        purchases_count: allPurchases.length,
        transfers_count: allTransfers.length,
        damages_count: allDamages.length,
        current_stock_count: currentStock.length,
        stock_history_count: stockHistory.length
      }
    });
    
  } catch (err) {
    console.error('Error generating stock report:', err.message);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

const getStockReportByDateRange = async (req, res) => {
  try {
    const { start_date, end_date, asset_id } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }
    
    console.log('Getting stock report by date range:', start_date, 'to', end_date);
    
    // Get the asset if specified
    let assetFilter = '';
    let queryParams = [start_date, end_date];
    
    if (asset_id) {
      assetFilter = 'AND ca.id = ?';
      queryParams.push(asset_id);
    }
    
    // Query to get daily stock movement
    const query = `
      SELECT 
        dates.date,
        ca.id as asset_id,
        ca.asset_code,
        ca.asset_name,
        cl.id as location_id,
        cl.location_name,
        -- Opening balance (stock from previous day)
        COALESCE((
          SELECT SUM(
            CASE 
              WHEN sh.transaction_type = 'PURCHASE' THEN sh.quantity
              WHEN sh.transaction_type = 'TRANSFER' AND sh.location_id = cl.id THEN sh.quantity
              WHEN sh.transaction_type = 'DAMAGE' THEN sh.quantity
              ELSE 0
            END
          )
          FROM cutlery_stock_history sh
          WHERE sh.asset_id = ca.id 
            AND sh.location_id = cl.id
            AND sh.recorded_at < dates.date
        ), 0) as opening_balance,
        
        -- Purchases on this day
        COALESCE((
          SELECT SUM(cpi.quantity)
          FROM cutlery_purchases cp
          JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
          WHERE cpi.asset_id = ca.id
            AND DATE(cp.purchase_date) = dates.date
            AND cp.payment_status = 'PAID'
        ), 0) as purchases_today,
        
        -- Transfers FROM this location on this day
        COALESCE((
          SELECT SUM(cti.quantity)
          FROM cutlery_transfers ct
          JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
          WHERE cti.asset_id = ca.id
            AND ct.location_from_id = cl.id
            AND DATE(ct.transfer_date) = dates.date
            AND ct.status = 'Completed'
        ), 0) as transfers_out_today,
        
        -- Transfers TO this location on this day
        COALESCE((
          SELECT SUM(cti.quantity)
          FROM cutlery_transfers ct
          JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
          WHERE cti.asset_id = ca.id
            AND ct.location_to_id = cl.id
            AND DATE(ct.transfer_date) = dates.date
            AND ct.status = 'Completed'
        ), 0) as transfers_in_today,
        
        -- Damages on this day
        COALESCE((
          SELECT SUM(cdi.quantity)
          FROM cutlery_damages cd
          JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
          WHERE cdi.asset_id = ca.id
            AND cd.location_id = cl.id
            AND DATE(cd.damage_date) = dates.date
        ), 0) as damages_today,
        
        -- Calculate closing balance
        (
          COALESCE((
            SELECT SUM(
              CASE 
                WHEN sh.transaction_type = 'PURCHASE' THEN sh.quantity
                WHEN sh.transaction_type = 'TRANSFER' AND sh.location_id = cl.id THEN sh.quantity
                WHEN sh.transaction_type = 'DAMAGE' THEN sh.quantity
                ELSE 0
              END
            )
            FROM cutlery_stock_history sh
            WHERE sh.asset_id = ca.id 
              AND sh.location_id = cl.id
              AND sh.recorded_at < dates.date
          ), 0)
          + COALESCE((
            SELECT SUM(cpi.quantity)
            FROM cutlery_purchases cp
            JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
            WHERE cpi.asset_id = ca.id
              AND DATE(cp.purchase_date) = dates.date
              AND cp.payment_status = 'PAID'
          ), 0)
          - COALESCE((
            SELECT SUM(cti.quantity)
            FROM cutlery_transfers ct
            JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
            WHERE cti.asset_id = ca.id
              AND ct.location_from_id = cl.id
              AND DATE(ct.transfer_date) = dates.date
              AND ct.status = 'Completed'
          ), 0)
          + COALESCE((
            SELECT SUM(cti.quantity)
            FROM cutlery_transfers ct
            JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
            WHERE cti.asset_id = ca.id
              AND ct.location_to_id = cl.id
              AND DATE(ct.transfer_date) = dates.date
              AND ct.status = 'Completed'
          ), 0)
          - COALESCE((
            SELECT SUM(cdi.quantity)
            FROM cutlery_damages cd
            JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
            WHERE cdi.asset_id = ca.id
              AND cd.location_id = cl.id
              AND DATE(cd.damage_date) = dates.date
          ), 0)
        ) as closing_balance
        
      FROM (
        SELECT DATE(?) + INTERVAL seq.seq DAY as date
        FROM (
          SELECT 0 as seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
          UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
          UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
          UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
          UNION SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24
          UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29
          UNION SELECT 30
        ) seq
        WHERE DATE(?) + INTERVAL seq.seq DAY <= DATE(?)
      ) dates
      CROSS JOIN cutlery_assets ca
      CROSS JOIN cutlery_locations cl
      WHERE 1=1 ${assetFilter}
      ORDER BY dates.date, ca.asset_code, cl.location_name
    `;
    
    const [rows] = await pool.query(query, queryParams);
    
    res.json({
      success: true,
      data: rows,
      period: {
        start_date,
        end_date
      }
    });
    
  } catch (err) {
    console.error('Error generating date range stock report:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
  }
};

const getStockReportByAsset = async (req, res) => {
  try {
    const { asset_id, report_date } = req.query;
    
    console.log('Getting stock report for asset:', asset_id, 'date:', report_date);
    
    if (!asset_id) {
      return res.status(400).json({
        success: false,
        error: 'Asset ID is required'
      });
    }
    
    // If no date provided, use today's date
    const targetDate = report_date ? new Date(report_date) : new Date();
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    // Get asset details
    const [asset] = await pool.query(`
      SELECT * FROM cutlery_assets WHERE id = ?
    `, [asset_id]);
    
    if (asset.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Asset not found' 
      });
    }
    
    // Get current stock for this asset
    const [currentStock] = await pool.query(`
      SELECT 
        cs.location_id,
        cl.location_name,
        cs.quantity
      FROM cutlery_stock cs
      JOIN cutlery_locations cl ON cs.location_id = cl.id
      WHERE cs.asset_id = ?
    `, [asset_id]);
    
    // Get transactions for this asset
    const [transactions] = await pool.query(`
      (
        SELECT 
          'Purchase' as type,
          cp.purchase_date as date,
          cp.invoice_number as reference,
          cpi.quantity,
          'Stores' as location_name,
          'IN' as direction,
          CONCAT('Purchased ', cpi.quantity, ' units') as description
        FROM cutlery_purchases cp
        JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
        WHERE cpi.asset_id = ?
        AND DATE(cp.purchase_date) <= ?
      )
      UNION ALL
      (
        SELECT 
          'Transfer' as type,
          ct.transfer_date as date,
          ct.transfer_id as reference,
          cti.quantity,
          CONCAT('From: ', cl_from.location_name, ' To: ', cl_to.location_name) as location_name,
          CASE 
            WHEN ct.location_from_id = 1 THEN 'OUT'
            WHEN ct.location_to_id = 1 THEN 'IN'
            ELSE 'TRANSFER'
          END as direction,
          CONCAT('Transferred ', cti.quantity, ' units') as description
        FROM cutlery_transfers ct
        JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
        LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
        LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
        WHERE cti.asset_id = ?
        AND DATE(ct.transfer_date) <= ?
        AND ct.status = 'Completed'
      )
      UNION ALL
      (
        SELECT 
          'Damage' as type,
          cd.damage_date as date,
          cd.damage_id as reference,
          cdi.quantity,
          cl.location_name,
          'OUT' as direction,
          CONCAT('Damaged ', cdi.quantity, ' units (', cd.reason, ')') as description
        FROM cutlery_damages cd
        JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
        JOIN cutlery_locations cl ON cd.location_id = cl.id
        WHERE cdi.asset_id = ?
        AND DATE(cd.damage_date) <= ?
      )
      ORDER BY date ASC
    `, [asset_id, targetDateStr, asset_id, targetDateStr, asset_id, targetDateStr]);
    
    // Calculate stock at each location
    const locationStock = {};
    const [allLocations] = await pool.query('SELECT id, location_name FROM cutlery_locations');
    
    // Initialize all locations with 0
    allLocations.forEach(loc => {
      locationStock[loc.location_name] = 0;
    });
    
    // Calculate from transactions
    transactions.forEach(transaction => {
      if (transaction.type === 'Purchase' && transaction.direction === 'IN') {
        locationStock['Stores'] += transaction.quantity;
      } else if (transaction.type === 'Transfer') {
        // Parse location names from the concatenated string
        const match = transaction.location_name.match(/From: (.+?) To: (.+)/);
        if (match) {
          const fromLocation = match[1].trim();
          const toLocation = match[2].trim();
          
          if (transaction.direction === 'OUT' || fromLocation === 'Stores') {
            locationStock[fromLocation] -= transaction.quantity;
          }
          if (transaction.direction === 'IN' || toLocation === 'Stores') {
            locationStock[toLocation] += transaction.quantity;
          }
        }
      } else if (transaction.type === 'Damage' && transaction.direction === 'OUT') {
        locationStock[transaction.location_name] -= transaction.quantity;
      }
    });
    
    // Ensure no negative values
    Object.keys(locationStock).forEach(location => {
      if (locationStock[location] < 0) {
        locationStock[location] = 0;
      }
    });
    
    res.json({
      success: true,
      asset: asset[0],
      report_date: targetDateStr,
      current_stock: currentStock,
      transactions: transactions,
      calculated_stock: locationStock
    });
    
  } catch (err) {
    console.error('Error generating stock report by asset:', err);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      message: err.message 
    });
  }
};

// Test function to verify stock logic
const testStockLogic = async (req, res) => {
  try {
    // Create test scenario
    const testDate = req.query.date || new Date().toISOString().split('T')[0];
    
    // 1. Add a test purchase
    const [testAsset] = await pool.query('SELECT id FROM cutlery_assets LIMIT 1');
    const [testUser] = await pool.query('SELECT id FROM users LIMIT 1');
    const [storesLocation] = await pool.query('SELECT id FROM cutlery_locations WHERE location_name = "Stores" LIMIT 1');
    const [cafeLocation] = await pool.query('SELECT id FROM cutlery_locations WHERE location_name LIKE "%Café%" LIMIT 1');
    
    if (!testAsset[0] || !testUser[0] || !storesLocation[0] || !cafeLocation[0]) {
      return res.json({
        success: false,
        message: 'Missing test data'
      });
    }
    
    const assetId = testAsset[0].id;
    const userId = testUser[0].id;
    const storesId = storesLocation[0].id;
    const cafeId = cafeLocation[0].id;
    
    // Clean up any existing test data
    await pool.query('DELETE FROM cutlery_purchases WHERE invoice_number LIKE "TEST-%"');
    await pool.query('DELETE FROM cutlery_transfers WHERE transfer_id LIKE "TEST-%"');
    await pool.query('DELETE FROM cutlery_damages WHERE damage_id LIKE "TEST-%"');
    
    // Create test purchase (10 units to Stores)
    const purchaseResult = await pool.query(
      `INSERT INTO cutlery_purchases 
       (purchase_id, purchase_date, supplier_id, invoice_number, total_amount, payment_status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['TEST-P001', testDate, 1, 'TEST-PURCHASE-001', 1000.00, 'PAID', userId]
    );
    
    await pool.query(
      `INSERT INTO cutlery_purchase_items (purchase_id, asset_id, quantity, unit_price)
       VALUES (?, ?, ?, ?)`,
      [purchaseResult[0].insertId, assetId, 10, 100.00]
    );
    
    // Create test transfer (5 units from Stores to Café)
    const transferResult = await pool.query(
      `INSERT INTO cutlery_transfers 
       (transfer_id, transfer_date, location_from_id, location_to_id, transferred_by, status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['TEST-T001', testDate, storesId, cafeId, 'Test User', 'Completed', userId]
    );
    
    await pool.query(
      `INSERT INTO cutlery_transfer_items (transfer_id, asset_id, quantity)
       VALUES (?, ?, ?)`,
      [transferResult[0].insertId, assetId, 5]
    );
    
    // Create test damage (2 units at Café)
    const damageResult = await pool.query(
      `INSERT INTO cutlery_damages 
       (damage_id, damage_date, location_id, reason, reported_by, status, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['TEST-D001', testDate, cafeId, 'Broken', 'Test User', 'Reported', userId]
    );
    
    await pool.query(
      `INSERT INTO cutlery_damage_items (damage_id, asset_id, quantity, unit_price)
       VALUES (?, ?, ?, ?)`,
      [damageResult[0].insertId, assetId, 2, 100.00]
    );
    
    // Calculate expected stock
    const expectedStock = {
      Stores: 10 - 5, // Purchase 10, transfer out 5
      Café: 5 - 2 // Transfer in 5, damage 2
    };
    
    // Get actual stock from our calculation
    const stockReport = await getStockReportInternal(testDate);
    
    res.json({
      success: true,
      test_scenario: {
        purchase: '10 units to Stores',
        transfer: '5 units from Stores to Café',
        damage: '2 units at Café'
      },
      expected_stock: expectedStock,
      calculated_stock: stockReport,
      message: 'Test completed. Check expected vs calculated stock.'
    });
    
  } catch (err) {
    console.error('Test error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Test failed',
      message: err.message 
    });
  }
};

// Helper function for internal stock calculation
async function getStockReportInternal(dateStr) {
  const [locations] = await pool.query('SELECT id, location_name FROM cutlery_locations');
  const [assets] = await pool.query('SELECT id, asset_name FROM cutlery_assets LIMIT 1');
  
  if (assets.length === 0) return {};
  
  const assetId = assets[0].id;
  const stock = {};
  
  // Initialize all locations
  locations.forEach(loc => {
    stock[loc.location_name] = 0;
  });
  
  // Get purchases
  const [purchases] = await pool.query(`
    SELECT SUM(cpi.quantity) as total
    FROM cutlery_purchases cp
    JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
    WHERE cpi.asset_id = ? AND DATE(cp.purchase_date) <= ? AND cp.payment_status = 'PAID'
  `, [assetId, dateStr]);
  
  if (purchases[0].total) {
    stock['Stores'] += purchases[0].total;
  }
  
  // Get transfers
  const [transfersOut] = await pool.query(`
    SELECT cl.location_name, SUM(cti.quantity) as total
    FROM cutlery_transfers ct
    JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
    JOIN cutlery_locations cl ON ct.location_from_id = cl.id
    WHERE cti.asset_id = ? AND DATE(ct.transfer_date) <= ? AND ct.status = 'Completed'
    GROUP BY cl.location_name
  `, [assetId, dateStr]);
  
  transfersOut.forEach(t => {
    if (stock[t.location_name] !== undefined) {
      stock[t.location_name] -= t.total || 0;
    }
  });
  
  const [transfersIn] = await pool.query(`
    SELECT cl.location_name, SUM(cti.quantity) as total
    FROM cutlery_transfers ct
    JOIN cutlery_transfer_items cti ON ct.id = cti.transfer_id
    JOIN cutlery_locations cl ON ct.location_to_id = cl.id
    WHERE cti.asset_id = ? AND DATE(ct.transfer_date) <= ? AND ct.status = 'Completed'
    GROUP BY cl.location_name
  `, [assetId, dateStr]);
  
  transfersIn.forEach(t => {
    if (stock[t.location_name] !== undefined) {
      stock[t.location_name] += t.total || 0;
    }
  });
  
  // Get damages
  const [damages] = await pool.query(`
    SELECT cl.location_name, SUM(cdi.quantity) as total
    FROM cutlery_damages cd
    JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
    JOIN cutlery_locations cl ON cd.location_id = cl.id
    WHERE cdi.asset_id = ? AND DATE(cd.damage_date) <= ?
    GROUP BY cl.location_name
  `, [assetId, dateStr]);
  
  damages.forEach(d => {
    if (stock[d.location_name] !== undefined) {
      stock[d.location_name] -= d.total || 0;
    }
  });
  
  // Ensure no negative values
  Object.keys(stock).forEach(location => {
    if (stock[location] < 0) stock[location] = 0;
  });
  
  return stock;
}

module.exports = {
  getStockReport,
  getStockReportByDateRange,
  getStockReportByAsset,
  testStockLogic
};