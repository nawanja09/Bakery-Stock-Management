const pool = require('../config/db');

const getInventoryReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    console.log('DEBUG - Report request:', { start_date, end_date });

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Get all assets
    const [assets] = await pool.query(`
      SELECT 
        ca.id,
        ca.asset_id,
        ca.asset_name
      FROM cutlery_assets ca
      ORDER BY ca.asset_id
    `);

    console.log('DEBUG - Assets found:', assets.length);

    // Get all locations
    const [locations] = await pool.query(`
      SELECT 
        cl.id,
        cl.location_id,
        cl.location_name
      FROM cutlery_locations cl
      ORDER BY 
        CASE WHEN cl.location_name LIKE '%store%' OR cl.location_name LIKE '%main%' THEN 0 ELSE 1 END,
        cl.location_name
    `);

    console.log('DEBUG - Locations found:', locations.length);

    // Get cumulative opening balance up to the day BEFORE start_date
    const openingBalances = await getCumulativeOpeningBalances(start_date, assets);
    console.log('DEBUG - Opening balances:', openingBalances);

    // Get purchases in date range
    const purchases = await getPurchases(start_date, end_date, assets);
    console.log('DEBUG - Purchases in range:', purchases);

    // Get transfers in date range
    const transfers = await getTransfers(start_date, end_date, assets, locations);
    console.log('DEBUG - Transfers in range:', transfers);

    // Get damages in date range
    const damages = await getDamages(start_date, end_date, assets);
    console.log('DEBUG - Damages in range:', damages);

    // Calculate for each asset
    const reportData = assets.map(asset => {
      const assetId = asset.id;
      const assetCode = asset.asset_id;
      const assetName = asset.asset_name;
      
      // Opening balance for this asset (cumulative up to day before start_date)
      const openingBalance = openingBalances[assetId] || 0;
      
      // Purchases for this asset in date range
      const purchaseQty = purchases[assetId] || 0;
      
      // Initialize transfer data for each location
      const transferData = {};
      locations.forEach(location => {
        transferData[location.id] = {
          location_name: location.location_name,
          transfer_in: 0,
          transfer_out: 0
        };
      });
      
      // Fill transfer data for the date range
      if (transfers[assetId]) {
        Object.keys(transfers[assetId]).forEach(locationId => {
          if (transferData[locationId]) {
            transferData[locationId].transfer_in = transfers[assetId][locationId].transfer_in || 0;
            transferData[locationId].transfer_out = transfers[assetId][locationId].transfer_out || 0;
          }
        });
      }
      
      // Damages for this asset in date range
      const damageQty = damages[assetId] || 0;
      
      // Calculate total transfers for this asset (for display only)
      let totalTransferIn = 0;
      let totalTransferOut = 0;
      locations.forEach(location => {
        totalTransferIn += transferData[location.id].transfer_in || 0;
        totalTransferOut += transferData[location.id].transfer_out || 0;
      });
      
      // IMPORTANT: Calculate closing balance CORRECTLY
      // Formula: Closing = Opening + Purchases - Damages
      // Transfers don't affect total system stock
      const closingBalance = openingBalance + purchaseQty - damageQty;
      
      // Debug each asset calculation
      console.log('DEBUG - Asset calculation:', {
        assetId,
        assetCode,
        assetName,
        openingBalance,
        purchaseQty,
        damageQty,
        closingBalance,
        totalTransferIn,
        totalTransferOut
      });
      
      return {
        item_id: assetCode,
        item_name: assetName,
        opening_balance: openingBalance,
        purchase: purchaseQty,
        transfers: transferData,
        damage: damageQty,
        closing_balance: closingBalance, // This should be correctly calculated now
        transfer_in_total: totalTransferIn,
        transfer_out_total: totalTransferOut
      };
    });

    // Calculate totals for debugging
    const totals = {
      opening: reportData.reduce((sum, item) => sum + (item.opening_balance || 0), 0),
      purchase: reportData.reduce((sum, item) => sum + (item.purchase || 0), 0),
      damage: reportData.reduce((sum, item) => sum + (item.damage || 0), 0),
      closing: reportData.reduce((sum, item) => sum + (item.closing_balance || 0), 0),
      transferIn: reportData.reduce((sum, item) => sum + (item.transfer_in_total || 0), 0),
      transferOut: reportData.reduce((sum, item) => sum + (item.transfer_out_total || 0), 0),
    };

    console.log('DEBUG - Report totals:', totals);
    console.log('DEBUG - Expected closing:', totals.opening + totals.purchase - totals.damage);

    res.json({
      start_date,
      end_date,
      locations: locations.map(loc => ({ 
        id: loc.id, 
        name: loc.location_name 
      })),
      data: reportData
    });

  } catch (err) {
    console.error('Error fetching inventory report:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get cumulative opening balances (all purchases minus damages before start_date)
const getCumulativeOpeningBalances = async (startDate, assets) => {
  const balances = {};
  
  try {
    // First, initialize all assets with 0
    assets.forEach(asset => {
      balances[asset.id] = 0;
    });

    // Get all purchases before start_date
    const [purchases] = await pool.query(`
      SELECT 
        cpi.asset_id,
        SUM(cpi.quantity) as total_quantity
      FROM cutlery_purchases cp
      JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
      WHERE cp.purchase_date < ?
      GROUP BY cpi.asset_id
    `, [startDate]);

    purchases.forEach(row => {
      balances[row.asset_id] = (balances[row.asset_id] || 0) + (row.total_quantity || 0);
    });

    // Subtract all damages before start_date
    const [damages] = await pool.query(`
      SELECT 
        cdi.asset_id,
        SUM(cdi.quantity) as total_quantity
      FROM cutlery_damages cd
      JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
      WHERE cd.damage_date < ?
      GROUP BY cdi.asset_id
    `, [startDate]);

    damages.forEach(row => {
      balances[row.asset_id] = (balances[row.asset_id] || 0) - (row.total_quantity || 0);
    });

    console.log('DEBUG - Calculated opening balances:', balances);

  } catch (error) {
    console.error('Error calculating opening balances:', error);
    assets.forEach(asset => {
      balances[asset.id] = 0;
    });
  }
  
  return balances;
};

// Get purchases in date range
const getPurchases = async (startDate, endDate, assets) => {
  const purchases = {};
  
  try {
    // Initialize all assets with 0
    assets.forEach(asset => {
      purchases[asset.id] = 0;
    });

    const [results] = await pool.query(`
      SELECT 
        cpi.asset_id,
        SUM(cpi.quantity) as total_quantity
      FROM cutlery_purchases cp
      JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
      WHERE cp.purchase_date BETWEEN ? AND ?
      GROUP BY cpi.asset_id
    `, [startDate, endDate]);
    
    results.forEach(row => {
      purchases[row.asset_id] = row.total_quantity || 0;
    });
    
  } catch (error) {
    console.error('Error getting purchases:', error);
    assets.forEach(asset => {
      purchases[asset.id] = 0;
    });
  }
  
  return purchases;
};

// Get transfers in date range
const getTransfers = async (startDate, endDate, assets, locations) => {
  const transfers = {};
  
  try {
    // Initialize transfers object for all assets
    assets.forEach(asset => {
      transfers[asset.id] = {};
      locations.forEach(location => {
        transfers[asset.id][location.id] = {
          transfer_in: 0,
          transfer_out: 0
        };
      });
    });

    const [results] = await pool.query(`
      SELECT 
        ct.asset_id,
        ct.location_from_id,
        ct.location_to_id,
        ct.quantity
      FROM cutlery_transfers ct
      WHERE ct.transfer_date BETWEEN ? AND ?
      AND ct.status != 'Cancelled'
    `, [startDate, endDate]);
    
    console.log('DEBUG - Transfer results:', results.length);
    
    // Fill with actual data
    results.forEach(row => {
      const assetId = row.asset_id;
      const fromLocation = row.location_from_id;
      const toLocation = row.location_to_id;
      const quantity = row.quantity || 0;
      
      if (transfers[assetId]) {
        // Transfer out FROM source location
        if (fromLocation && transfers[assetId][fromLocation]) {
          transfers[assetId][fromLocation].transfer_out += quantity;
        }
        
        // Transfer in TO destination location
        if (toLocation && transfers[assetId][toLocation]) {
          transfers[assetId][toLocation].transfer_in += quantity;
        }
      }
    });
    
  } catch (error) {
    console.error('Error getting transfers:', error);
    assets.forEach(asset => {
      transfers[asset.id] = {};
      locations.forEach(location => {
        transfers[asset.id][location.id] = {
          transfer_in: 0,
          transfer_out: 0
        };
      });
    });
  }
  
  return transfers;
};

// Get damages in date range
const getDamages = async (startDate, endDate, assets) => {
  const damages = {};
  
  try {
    // Initialize all assets with 0
    assets.forEach(asset => {
      damages[asset.id] = 0;
    });

    const [results] = await pool.query(`
      SELECT 
        cdi.asset_id,
        SUM(cdi.quantity) as total_quantity
      FROM cutlery_damages cd
      JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
      WHERE cd.damage_date BETWEEN ? AND ?
      GROUP BY cdi.asset_id
    `, [startDate, endDate]);
    
    results.forEach(row => {
      damages[row.asset_id] = row.total_quantity || 0;
    });
    
  } catch (error) {
    console.error('Error getting damages:', error);
    assets.forEach(asset => {
      damages[asset.id] = 0;
    });
  }
  
  return damages;
};

module.exports = {
  getInventoryReport
};