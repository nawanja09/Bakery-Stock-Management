const pool = require('../config/db');

const getStockReport = async (req, res) => {
  try {
    const { report_date } = req.query;
    
    // If no date provided, use today's date
    const targetDate = report_date ? new Date(report_date) : new Date();
    
    // Get all locations
    const [locations] = await pool.query(`
      SELECT id, location_id, location_name 
      FROM cutlery_locations 
      ORDER BY location_name
    `);
    
    // Get all assets
    const [assets] = await pool.query(`
      SELECT id, asset_id, asset_name, description 
      FROM cutlery_assets 
      ORDER BY asset_name
    `);
    
    // Get initial stock (opening balance) - for simplicity, we'll assume all stock starts at main store
    const [initialStock] = await pool.query(`
      SELECT 
        cs.location_id,
        cs.asset_id,
        cs.quantity
      FROM cutlery_stock cs
      WHERE cs.created_at <= ?
      GROUP BY cs.location_id, cs.asset_id
      HAVING MAX(cs.created_at)
    `, [targetDate]);
    
    // Get all purchases up to the report date
    const [purchases] = await pool.query(`
      SELECT 
        cpi.asset_id,
        cpi.quantity,
        'Stores' as location_name
      FROM cutlery_purchases cp
      JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
      WHERE cp.purchase_date <= ?
    `, [targetDate]);
    
    // Get all transfers up to the report date
    const [transfers] = await pool.query(`
      SELECT 
        asset_id,
        location_from_id,
        location_to_id,
        quantity,
        cl_from.location_name as from_location,
        cl_to.location_name as to_location
      FROM cutlery_transfers ct
      LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
      LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
      WHERE ct.transfer_date <= ?
      AND ct.status = 'Completed'
    `, [targetDate]);
    
    // Get all damages up to the report date
    const [damages] = await pool.query(`
      SELECT 
        cdi.asset_id,
        cd.location_id,
        cl.location_name,
        cdi.quantity
      FROM cutlery_damages cd
      JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
      JOIN cutlery_locations cl ON cd.location_id = cl.id
      WHERE cd.damage_date <= ?
    `, [targetDate]);
    
    // Calculate stock for each asset in each location
    const stockData = [];
    
    // For each asset, calculate stock in each location
    assets.forEach(asset => {
      const assetRow = {
        item_id: asset.id,
        item_code: asset.asset_id,
        item_name: asset.asset_name,
        description: asset.description,
        locations: {}
      };
      
      // Initialize all locations with 0 stock
      locations.forEach(location => {
        assetRow.locations[location.location_name] = 0;
      });
      
      // Add initial stock
      initialStock.forEach(stock => {
        if (stock.asset_id === asset.id) {
          const location = locations.find(l => l.id === stock.location_id);
          if (location) {
            assetRow.locations[location.location_name] = (assetRow.locations[location.location_name] || 0) + stock.quantity;
          }
        }
      });
      
      // Add purchases (all purchases go to Stores)
      purchases.forEach(purchase => {
        if (purchase.asset_id === asset.id && purchase.location_name === 'Stores') {
          assetRow.locations['Stores'] = (assetRow.locations['Stores'] || 0) + purchase.quantity;
        }
      });
      
      // Process transfers
      transfers.forEach(transfer => {
        if (transfer.asset_id === asset.id) {
          // Subtract from source location
          if (assetRow.locations[transfer.from_location] !== undefined) {
            assetRow.locations[transfer.from_location] -= transfer.quantity;
          }
          
          // Add to destination location
          if (assetRow.locations[transfer.to_location] !== undefined) {
            assetRow.locations[transfer.to_location] += transfer.quantity;
          }
        }
      });
      
      // Process damages (subtract from relevant location)
      damages.forEach(damage => {
        if (damage.asset_id === asset.id) {
          if (assetRow.locations[damage.location_name] !== undefined) {
            assetRow.locations[damage.location_name] -= damage.quantity;
          }
        }
      });
      
      // Ensure no negative values
      Object.keys(assetRow.locations).forEach(location => {
        if (assetRow.locations[location] < 0) {
          assetRow.locations[location] = 0;
        }
      });
      
      stockData.push(assetRow);
    });
    
    res.json({
      report_date: targetDate.toISOString().split('T')[0],
      locations: locations.map(loc => loc.location_name),
      data: stockData
    });
    
  } catch (err) {
    console.error('Error generating stock report:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getStockReportByAsset = async (req, res) => {
  try {
    const { asset_id, report_date } = req.query;
    
    // If no date provided, use today's date
    const targetDate = report_date ? new Date(report_date) : new Date();
    
    // Get asset details
    const [asset] = await pool.query(`
      SELECT * FROM cutlery_assets WHERE id = ?
    `, [asset_id]);
    
    if (asset.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    
    // Get stock history for this asset
    const [stockHistory] = await pool.query(`
      SELECT 
        cs.*,
        cl.location_name
      FROM cutlery_stock cs
      JOIN cutlery_locations cl ON cs.location_id = cl.id
      WHERE cs.asset_id = ?
      AND cs.created_at <= ?
      ORDER BY cs.created_at DESC
    `, [asset_id, targetDate]);
    
    // Get transactions (purchases, transfers, damages) for this asset
    const [transactions] = await pool.query(`
      (
        SELECT 
          'Purchase' as type,
          cp.purchase_date as date,
          cp.invoice_number as reference,
          cpi.quantity,
          'Stores' as location_name,
          'IN' as direction
        FROM cutlery_purchases cp
        JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
        WHERE cpi.asset_id = ?
        AND cp.purchase_date <= ?
      )
      UNION ALL
      (
        SELECT 
          'Transfer' as type,
          ct.transfer_date as date,
          ct.transfer_id as reference,
          ct.quantity,
          CONCAT('From: ', cl_from.location_name, ' To: ', cl_to.location_name) as location_name,
          'TRANSFER' as direction
        FROM cutlery_transfers ct
        LEFT JOIN cutlery_locations cl_from ON ct.location_from_id = cl_from.id
        LEFT JOIN cutlery_locations cl_to ON ct.location_to_id = cl_to.id
        WHERE ct.asset_id = ?
        AND ct.transfer_date <= ?
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
          'OUT' as direction
        FROM cutlery_damages cd
        JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
        JOIN cutlery_locations cl ON cd.location_id = cl.id
        WHERE cdi.asset_id = ?
        AND cd.damage_date <= ?
      )
      ORDER BY date DESC
    `, [asset_id, targetDate, asset_id, targetDate, asset_id, targetDate]);
    
    res.json({
      asset: asset[0],
      report_date: targetDate.toISOString().split('T')[0],
      stock_history: stockHistory,
      transactions: transactions
    });
    
  } catch (err) {
    console.error('Error generating stock report by asset:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getStockReport,
  getStockReportByAsset
};