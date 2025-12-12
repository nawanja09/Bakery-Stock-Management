const pool = require('../config/db');

const getInventoryReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Get all assets first
    const [assets] = await pool.query(`
      SELECT 
        ca.id,
        ca.asset_id,
        ca.asset_name
      FROM cutlery_assets ca
      ORDER BY ca.asset_id
    `);

    // Get all locations (store should be first, then others)
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

    // Get opening balance (closing balance of previous day)
    const openingBalances = await getOpeningBalances(start_date, assets);

    // Get purchases in date range
    const purchases = await getPurchases(start_date, end_date, assets);

    // Get transfers in date range
    const transfers = await getTransfers(start_date, end_date, assets, locations);

    // Get damages in date range
    const damages = await getDamages(start_date, end_date, assets);

    // Calculate for each asset
    const reportData = assets.map(asset => {
      const assetId = asset.id;
      const assetCode = asset.asset_id;
      const assetName = asset.asset_name;
      
      // Opening balance for this asset
      const openingBalance = openingBalances[assetId] || 0;
      
      // Purchases for this asset
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
      
      // Fill transfer data
      if (transfers[assetId]) {
        Object.keys(transfers[assetId]).forEach(locationId => {
          if (transferData[locationId]) {
            transferData[locationId].transfer_in = transfers[assetId][locationId].transfer_in || 0;
            transferData[locationId].transfer_out = transfers[assetId][locationId].transfer_out || 0;
          }
        });
      }
      
      // Damages for this asset
      const damageQty = damages[assetId] || 0;
      
      // Calculate total transfers (in as negative, out as positive)
      let totalTransferIn = 0;
      let totalTransferOut = 0;
      locations.forEach(location => {
        totalTransferIn += transferData[location.id].transfer_in;
        totalTransferOut += transferData[location.id].transfer_out;
      });
      
      // Calculate closing balance
      const closingBalance = openingBalance + purchaseQty - totalTransferIn + totalTransferOut - damageQty;
      
      return {
        item_id: assetCode,
        item_name: assetName,
        opening_balance: openingBalance,
        purchase: purchaseQty,
        transfers: transferData,
        damage: damageQty,
        closing_balance: closingBalance,
        transfer_in_total: totalTransferIn,
        transfer_out_total: totalTransferOut
      };
    });

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

// Helper function to get opening balances (closing balance of previous day)
const getOpeningBalances = async (startDate, assets) => {
  const balances = {};
  
  try {
    // Get closing balance for each asset from previous day
    for (const asset of assets) {
      const [results] = await pool.query(`
        WITH daily_totals AS (
          SELECT 
            asset_id,
            date,
            COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity ELSE 0 END), 0) as purchases,
            COALESCE(SUM(CASE WHEN type = 'transfer_in' THEN quantity ELSE 0 END), 0) as transfers_in,
            COALESCE(SUM(CASE WHEN type = 'transfer_out' THEN quantity ELSE 0 END), 0) as transfers_out,
            COALESCE(SUM(CASE WHEN type = 'damage' THEN quantity ELSE 0 END), 0) as damages
          FROM (
            -- Purchases
            SELECT 
              cp.purchase_date as date,
              cpi.asset_id,
              cpi.quantity,
              'purchase' as type
            FROM cutlery_purchases cp
            JOIN cutlery_purchase_items cpi ON cp.id = cpi.purchase_id
            WHERE cp.purchase_date < ?
            
            UNION ALL
            
            -- Transfers (incoming)
            SELECT 
              ct.transfer_date as date,
              ct.asset_id,
              ct.quantity,
              'transfer_in' as type
            FROM cutlery_transfers ct
            WHERE ct.transfer_date < ?
            
            UNION ALL
            
            -- Transfers (outgoing)
            SELECT 
              ct.transfer_date as date,
              ct.asset_id,
              -ct.quantity as quantity,
              'transfer_out' as type
            FROM cutlery_transfers ct
            WHERE ct.transfer_date < ?
            
            UNION ALL
            
            -- Damages
            SELECT 
              cd.damage_date as date,
              cdi.asset_id,
              -cdi.quantity as quantity,
              'damage' as type
            FROM cutlery_damages cd
            JOIN cutlery_damage_items cdi ON cd.id = cdi.damage_id
            WHERE cd.damage_date < ?
          ) as transactions
          WHERE asset_id = ?
          GROUP BY asset_id, date
        )
        SELECT 
          asset_id,
          COALESCE(SUM(purchases - transfers_in + transfers_out - damages), 0) as closing_balance
        FROM daily_totals
        GROUP BY asset_id
      `, [startDate, startDate, startDate, startDate, asset.id]);
      
      balances[asset.id] = results[0]?.closing_balance || 0;
    }
  } catch (error) {
    console.error('Error calculating opening balances:', error);
    // Return empty balances on error
    assets.forEach(asset => {
      balances[asset.id] = 0;
    });
  }
  
  return balances;
};

// Helper function to get purchases in date range
const getPurchases = async (startDate, endDate, assets) => {
  const purchases = {};
  
  try {
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
      purchases[row.asset_id] = row.total_quantity;
    });
    
    // Initialize all assets with 0
    assets.forEach(asset => {
      if (!purchases[asset.id]) {
        purchases[asset.id] = 0;
      }
    });
    
  } catch (error) {
    console.error('Error getting purchases:', error);
    assets.forEach(asset => {
      purchases[asset.id] = 0;
    });
  }
  
  return purchases;
};

// Helper function to get transfers in date range
const getTransfers = async (startDate, endDate, assets, locations) => {
  const transfers = {};
  
  try {
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
    
    // Fill with actual data
    results.forEach(row => {
      const assetId = row.asset_id;
      const fromLocation = row.location_from_id;
      const toLocation = row.location_to_id;
      const quantity = row.quantity;
      
      if (transfers[assetId]) {
        // Transfer out from source location
        if (fromLocation && transfers[assetId][fromLocation]) {
          transfers[assetId][fromLocation].transfer_out += quantity;
        }
        
        // Transfer in to destination location
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

// Helper function to get damages in date range
const getDamages = async (startDate, endDate, assets) => {
  const damages = {};
  
  try {
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
      damages[row.asset_id] = row.total_quantity;
    });
    
    // Initialize all assets with 0
    assets.forEach(asset => {
      if (!damages[asset.id]) {
        damages[asset.id] = 0;
      }
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