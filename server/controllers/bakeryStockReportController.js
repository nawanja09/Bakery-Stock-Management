// server/controllers/bakeryStockReportController.js
const pool = require('../config/db');

const getBakeryStockReport = async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date || new Date().toISOString().split('T')[0];
    
    // Calculate previous day
    const prevDate = new Date(reportDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    console.log(`Generating bakery stock report for: ${reportDate}`);

    // Step 1: Get ONLY raw materials that were issued to bakery departments on previous day
    const [bakeryItems] = await pool.query(`
      SELECT DISTINCT 
        i.id as item_id,
        i.item_code,
        i.name as item_name,
        i.unit
      FROM items i
      JOIN issuance_items ii ON i.id = ii.item_id
      JOIN issuances iss ON ii.issuance_id = iss.id
      JOIN departments d ON iss.department_id = d.id
      WHERE DATE(iss.issuance_date) = ?
        AND (d.name LIKE '%Bakery%' OR d.name LIKE '%Kitchen%' OR d.name LIKE '%Production%' OR d.name = 'Bakery')
      ORDER BY i.item_code
    `, [prevDateStr]);

    if (bakeryItems.length === 0) {
      return res.json([]);
    }

    console.log(`Found ${bakeryItems.length} items issued to bakery`);

    // Extract item IDs for subsequent queries
    const itemIds = bakeryItems.map(item => item.item_id);
    const placeholders = itemIds.map(() => '?').join(',');

    // Step 2: Get opening balances for these items
    const [openingBalances] = await pool.query(`
      SELECT item_id, quantity 
      FROM opening_balances 
      WHERE date = ? AND item_id IN (${placeholders})
    `, [prevDateStr, ...itemIds]);

    // Step 3: Get total issuances to bakery departments for these items (for verification)
    const [issuances] = await pool.query(`
      SELECT ii.item_id, SUM(ii.quantity) as issued_quantity
      FROM issuance_items ii
      JOIN issuances iss ON ii.issuance_id = iss.id
      JOIN departments d ON iss.department_id = d.id
      WHERE DATE(iss.issuance_date) = ?
        AND ii.item_id IN (${placeholders})
        AND (d.name LIKE '%Bakery%' OR d.name LIKE '%Kitchen%' OR d.name LIKE '%Production%' OR d.name = 'Bakery')
      GROUP BY ii.item_id
    `, [prevDateStr, ...itemIds]);

    // Step 4: Get ingredient requirements for current day's production
    const [ingredientRequirements] = await pool.query(`
      SELECT 
        fgi.raw_material_id as item_id,
        SUM(fgi.quantity * pi.quantity) as required_quantity
      FROM finished_goods_ingredients fgi
      JOIN finished_goods_production_items pi ON fgi.finished_good_id = pi.item_id
      JOIN finished_goods_productions p ON pi.production_id = p.id
      WHERE DATE(p.production_date) = ?
        AND fgi.raw_material_id IN (${placeholders})
      GROUP BY fgi.raw_material_id
    `, [reportDate, ...itemIds]);

    // Step 5: Build the report
    const reportData = bakeryItems.map(item => {
      const openingBalance = openingBalances.find(ob => ob.item_id === item.item_id);
      const issuance = issuances.find(iss => iss.item_id === item.item_id);
      const requirement = ingredientRequirements.find(req => req.item_id === item.item_id);

      const opening = openingBalance ? parseFloat(openingBalance.quantity) : 0;
      const issued = issuance ? parseFloat(issuance.issued_quantity) : 0;
      const required = requirement ? parseFloat(requirement.required_quantity) : 0;
      const closing = opening + issued - required;

      return {
        item_id: item.item_id,
        item_code: item.item_code,
        item_name: item.item_name,
        unit: item.unit,
        opening_balance: opening,
        previous_day_issuance: issued,
        production_requirement: required,
        closing_balance: closing
      };
    });

    console.log(`Generated report with ${reportData.length} bakery items`);

    res.json(reportData);

  } catch (error) {
    console.error('Error in bakery stock report:', error);
    res.status(500).json({ 
      error: 'Failed to generate bakery stock report',
      details: error.message 
    });
  }
};

module.exports = {
  getBakeryStockReport
};