const pool = require('../config/db');

const createOpeningBalance = async (req, res) => {
    const { date, item_id, quantity, unit_cost, entered_by } = req.body;
    
    try {
        const [result] = await pool.query(
            `INSERT INTO opening_balances (date, item_id, quantity, unit_cost, entered_by)
             VALUES (?, ?, ?, ?, ?)`,
            [date, item_id, quantity, unit_cost, entered_by]
        );
        
        res.status(201).json({
            id: result.insertId,
            message: 'Opening balance recorded successfully'
        });
    } catch (error) {
        console.error('Error creating opening balance:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getAllOpeningBalances = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                ob.id, 
                ob.date, 
                i.name AS item_name, 
                ob.quantity, 
                i.unit, 
                ob.unit_cost, 
                ob.total_value,
                u.email AS entered_by
            FROM opening_balances ob
            JOIN items i ON ob.item_id = i.id
            JOIN users u ON ob.entered_by = u.id
            ORDER BY ob.date DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching opening balances:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    createOpeningBalance,
    getAllOpeningBalances
};