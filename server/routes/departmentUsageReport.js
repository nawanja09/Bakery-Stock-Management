const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get department usage report
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, departmentId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    // Get all raw materials items
    const itemsQuery = `
      SELECT id, item_code, name, unit 
      FROM items 
      ORDER BY item_code
    `;
    const [items] = await db.execute(itemsQuery);

    // Get opening balances for the start date
    const openingBalancesQuery = `
      SELECT 
        ob.item_id,
        ob.quantity as opening_balance
      FROM opening_balances ob
      WHERE ob.date = ?
    `;
    const [openingBalances] = await db.execute(openingBalancesQuery, [startDate]);

    // Create opening balance map
    const openingBalanceMap = {};
    openingBalances.forEach(ob => {
      openingBalanceMap[ob.item_id] = parseFloat(ob.opening_balance);
    });

    // Get department-wise issuances between dates
    const issuancesQuery = `
      SELECT 
        ii.item_id,
        d.name as department_name,
        SUM(ii.quantity) as issued_quantity
      FROM issuance_items ii
      INNER JOIN issuances i ON ii.issuance_id = i.id
      INNER JOIN departments d ON i.department_id = d.id
      WHERE i.issuance_date BETWEEN ? AND ?
      GROUP BY ii.item_id, d.name
    `;
    const [issuances] = await db.execute(issuancesQuery, [startDate, endDate]);

    // Create department issuance map
    const departmentIssuanceMap = {};
    issuances.forEach(issuance => {
      const itemId = issuance.item_id;
      const deptName = issuance.department_name;
      const quantity = parseFloat(issuance.issued_quantity);

      if (!departmentIssuanceMap[itemId]) {
        departmentIssuanceMap[itemId] = {};
      }
      departmentIssuanceMap[itemId][deptName] = quantity;
    });

    // Prepare the final report data
    const reportData = items.map(item => {
      const openingBalance = openingBalanceMap[item.id] || 0;
      const deptIssuances = departmentIssuanceMap[item.id] || {};

      // Calculate total issued quantity
      const totalIssued = Object.values(deptIssuances).reduce((sum, qty) => sum + qty, 0);
      
      // Calculate due balance
      const dueBalance = openingBalance - totalIssued;

      return {
        item_code: item.item_code,
        item_name: item.name,
        unit: item.unit,
        opening_balance: openingBalance,
        bakery: deptIssuances['Bakery'] || 0,
        pastry: deptIssuances['Pastry'] || 0,
        savory: deptIssuances['Savory'] || 0,
        cake: deptIssuances['Cake'] || 0,
        due_balance: dueBalance
      };
    });

    res.json(reportData);
  } catch (error) {
    console.error('Error generating department usage report:', error);
    res.status(500).json({ error: 'Failed to generate department usage report' });
  }
});

module.exports = router;