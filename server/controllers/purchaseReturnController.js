// controllers/purchaseReturnController.js
const pool = require('../config/db');

// Get all purchases for return selection
const getPurchasesForReturn = async (req, res) => {
  try {
    const [purchases] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.total_with_vat AS total_amount,
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.vat_registered
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      WHERE (p.deleted = FALSE OR p.deleted IS NULL)
      ORDER BY p.purchase_date DESC
    `);

    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases for return:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get purchase items for return with available quantities
const getPurchaseItemsForReturn = async (req, res) => {
  const { purchaseId } = req.params;

  try {
    const [purchase] = await pool.query(`
      SELECT 
        p.*,
        s.vat_registered AS supplier_vat_registered,
        s.name AS supplier_name
      FROM purchases p
      JOIN supplier s ON p.supplier_id = s.id
      WHERE p.id = ?
    `, [purchaseId]);

    if (purchase.length === 0) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    const [items] = await pool.query(`
      SELECT 
        pi.id AS purchase_item_id,
        pi.item_id,
        pi.item_name,
        pi.quantity AS purchased_quantity,
        pi.unit_price,
        i.unit,
        i.vat_applicable,
        COALESCE((
          SELECT SUM(pri.quantity)
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pri.return_id = pr.id
          WHERE pri.purchase_item_id = pi.id
        ), 0) AS returned_quantity
      FROM purchase_items pi
      JOIN items i ON pi.item_id = i.id
      WHERE pi.purchase_id = ?
    `, [purchaseId]);

    const itemsWithAvailability = items.map(item => ({
      ...item,
      purchased_quantity: parseFloat(item.purchased_quantity),
      returned_quantity: parseFloat(item.returned_quantity || 0),
      available_quantity: parseFloat(item.purchased_quantity) - parseFloat(item.returned_quantity || 0),
      unit_price: parseFloat(item.unit_price)
    }));

    res.json({
      purchase: purchase[0],
      items: itemsWithAvailability
    });
  } catch (error) {
    console.error('Error fetching purchase items for return:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get supplier bills with available balance for settlement
const getSupplierBillsWithBalance = async (req, res) => {
  const { supplierId } = req.params;

  try {
    const [bills] = await pool.query(`
      SELECT 
        p.id,
        p.invoice_no,
        p.purchase_date,
        p.total_with_vat,
        p.paid_amount,
        p.balance_amount,
        p.balance_status
      FROM purchases p
      WHERE p.supplier_id = ? 
        AND p.balance_status = 1 
        AND p.balance_amount > 0
        AND (p.deleted = FALSE OR p.deleted IS NULL)
      ORDER BY p.purchase_date ASC
    `, [supplierId]);

    res.json(bills);
  } catch (error) {
    console.error('Error fetching supplier bills:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Create new purchase return with settlement
const createPurchaseReturn = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      return_number,
      purchase_id,
      supplier_id,
      return_date,
      items,
      remarks,
      returned_by,
      payment_method,
      company_id,
      check_number,
      settlements
    } = req.body;

    console.log('=== CREATE PURCHASE RETURN DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Items:', items);
    console.log('Items length:', items?.length);
    console.log('Settlements:', settlements);

    // Validate required fields
    if (!return_number) {
      throw new Error('Return number is required');
    }
    if (!supplier_id) {
      throw new Error('Supplier ID is required');
    }
    if (!return_date) {
      throw new Error('Return date is required');
    }
    if (!items || items.length === 0) {
      throw new Error('At least one item is required');
    }
    if (!returned_by) {
      throw new Error('Returned by user ID is required');
    }

    // Calculate totals
    let subtotal = 0;
    let totalVat = 0;
    let totalAmount = 0;

    // Process each item
    const processedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`Processing item ${i}:`, item);
      
      const quantity = parseFloat(item.return_quantity) || 0;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const amount = quantity * unitPrice;
      subtotal += amount;
      
      const isVatApplicable = item.vat_applicable === true || item.vat_applicable === 1;
      const vatAmount = isVatApplicable ? (amount * 0.18) : 0;
      totalVat += vatAmount;
      totalAmount += amount + vatAmount;
      
      processedItems.push({
        originalItem: item,
        quantity: quantity,
        unit_price: unitPrice,
        amount: amount,
        vat_amount: vatAmount,
        total_amount: amount + vatAmount
      });
    }

    console.log('Calculated totals:', { subtotal, totalVat, totalAmount });

    // Calculate settlement amounts and enhance with purchase details
    let settledAmount = 0;
    let enhancedSettlements = [];
    
    if (settlements && settlements.length > 0) {
      for (const settlement of settlements) {
        const settlementAmount = parseFloat(settlement.amount) || 0;
        settledAmount += settlementAmount;
        
        // Get purchase details for this settlement
        const [purchaseDetails] = await connection.query(
          `SELECT id, invoice_no, purchase_date FROM purchases WHERE id = ?`,
          [settlement.purchase_id]
        );
        
        if (purchaseDetails.length > 0) {
          enhancedSettlements.push({
            purchase_id: settlement.purchase_id,
            invoice_no: purchaseDetails[0].invoice_no,
            purchase_date: purchaseDetails[0].purchase_date,
            amount: settlementAmount
          });
        } else {
          enhancedSettlements.push({
            purchase_id: settlement.purchase_id,
            invoice_no: 'Unknown',
            purchase_date: null,
            amount: settlementAmount
          });
        }
      }
    }

    const balanceAmount = totalAmount - settledAmount;
    console.log('Settlement:', { settledAmount, balanceAmount, enhancedSettlements });

    // Insert purchase return
    const insertReturnQuery = `
      INSERT INTO purchase_returns 
      (return_number, return_date, purchase_id, supplier_id, subtotal, vat_amount, 
       total_amount, settled_amount, balance_amount, settlement_details, remarks, returned_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const insertReturnParams = [
      return_number, 
      return_date, 
      purchase_id || null, 
      supplier_id, 
      subtotal, 
      totalVat, 
      totalAmount, 
      settledAmount, 
      balanceAmount,
      JSON.stringify(enhancedSettlements), 
      remarks || null, 
      returned_by
    ];
    
    console.log('Insert Return SQL:', insertReturnQuery);
    console.log('Insert Return Params:', insertReturnParams);
    
    const [returnResult] = await connection.query(insertReturnQuery, insertReturnParams);
    const returnId = returnResult.insertId;
    console.log('Created return with ID:', returnId);

    // Insert return items
    for (let i = 0; i < processedItems.length; i++) {
      const processed = processedItems[i];
      const originalItem = processed.originalItem;
      
      let itemId = originalItem.item_id;
      let itemName = originalItem.item_name;
      let vatApplicable = originalItem.vat_applicable === true || originalItem.vat_applicable === 1;
      
      console.log(`Processing item ${i} for insertion:`, { itemId, itemName, vatApplicable });
      
      if (!itemId && itemName) {
        console.log(`Looking up item by name: ${itemName}`);
        const [foundItem] = await connection.query(
          'SELECT id, vat_applicable FROM items WHERE name = ? OR item_code = ? LIMIT 1',
          [itemName, itemName]
        );
        if (foundItem.length > 0) {
          itemId = foundItem[0].id;
          vatApplicable = foundItem[0].vat_applicable === 1;
          console.log(`Found item: ID=${itemId}, vat_applicable=${vatApplicable}`);
        } else {
          console.warn(`Item not found for name: ${itemName}`);
        }
      }
      
      let purchaseItemId = null;
      
      if (purchase_id && itemId) {
        console.log(`Looking up purchase_item for purchase_id=${purchase_id}, item_id=${itemId}`);
        const [purchaseItem] = await connection.query(
          `SELECT id FROM purchase_items 
           WHERE purchase_id = ? AND item_id = ? 
           LIMIT 1`,
          [purchase_id, itemId]
        );
        if (purchaseItem.length > 0) {
          purchaseItemId = purchaseItem[0].id;
          console.log(`Found purchase_item_id: ${purchaseItemId}`);
        }
      }
      
      const insertItemQuery = `
        INSERT INTO purchase_return_items 
        (return_id, purchase_item_id, item_id, item_name, quantity, unit_price, 
         vat_applicable, vat_amount, total_amount) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const insertItemParams = [
        returnId, 
        purchaseItemId, 
        itemId, 
        itemName || `Item ${i + 1}`,
        processed.quantity, 
        processed.unit_price, 
        vatApplicable ? 1 : 0,
        processed.vat_amount,
        processed.total_amount
      ];
      
      console.log(`Insert Item ${i} SQL:`, insertItemQuery);
      console.log(`Insert Item ${i} Params:`, insertItemParams);
      
      await connection.query(insertItemQuery, insertItemParams);
      console.log(`Inserted item ${i} successfully`);
    }

    // Update purchase balances if settlements were made
    if (settlements && settlements.length > 0) {
      console.log('Processing settlements:', settlements);
      for (const settlement of settlements) {
        const settlementAmount = parseFloat(settlement.amount) || 0;
        console.log(`Processing settlement for purchase_id=${settlement.purchase_id}, amount=${settlementAmount}`);
        
        const [purchase] = await connection.query(
          `SELECT balance_amount, paid_amount, total_with_vat 
           FROM purchases WHERE id = ?`,
          [settlement.purchase_id]
        );

        if (purchase.length > 0) {
          const currentBalance = parseFloat(purchase[0].balance_amount) || 0;
          const currentPaid = parseFloat(purchase[0].paid_amount) || 0;
          
          const newBalance = currentBalance - settlementAmount;
          const newPaid = currentPaid + settlementAmount;
          const newBalanceStatus = newBalance > 0 ? 1 : 0;

          let paymentStatus = 'Non-Paid';
          if (newPaid >= purchase[0].total_with_vat) {
            paymentStatus = 'Paid';
          } else if (newPaid > 0) {
            paymentStatus = 'Partially Paid';
          }

          console.log(`Updating purchase ${settlement.purchase_id}:`, {
            currentBalance, newBalance,
            currentPaid, newPaid,
            paymentStatus
          });

          await connection.query(
            `UPDATE purchases 
             SET balance_amount = ?, 
                 paid_amount = ?,
                 balance_status = ?,
                 payment_status = ?
             WHERE id = ?`,
            [
              newBalance, 
              newPaid,
              newBalanceStatus,
              paymentStatus,
              settlement.purchase_id
            ]
          );

          await connection.query(
            `INSERT INTO payment_history 
             (purchase_id, payment_date, amount, payment_method, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              settlement.purchase_id,
              return_date,
              settlementAmount,
              payment_method || 'CASH',
              `Return settlement from return #${return_number}`,
              returned_by
            ]
          );
          
          console.log(`Settlement processed for purchase ${settlement.purchase_id}`);
        } else {
          console.warn(`Purchase ${settlement.purchase_id} not found for settlement`);
        }
      }
    }

    await connection.commit();
    console.log('=== RETURN CREATED SUCCESSFULLY ===');
    
    res.status(201).json({
      message: 'Purchase return created successfully!',
      return_number,
      return_id: returnId,
      summary: {
        subtotal,
        vat_amount: totalVat,
        total_amount: totalAmount,
        settled_amount: settledAmount,
        balance_amount: balanceAmount
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('=== ERROR CREATING PURCHASE RETURN ===');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error SQL:', error.sql);
    console.error('Error SQL Message:', error.sqlMessage);
    console.error('Full error:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Return number already exists. Please use a unique return number.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Server error: ' + error.message,
      details: error.sqlMessage || error.message
    });
  } finally {
    connection.release();
  }
};

// Get all purchase returns - FIXED to include invoice info
const getAllPurchaseReturns = async (req, res) => {
  try {
    const [returns] = await pool.query(`
      SELECT 
        pr.*,
        s.name           AS supplier_name,
        s.vat_registered AS supplier_vat_registered,
        s.vat_number     AS supplier_vat_number,
        p.invoice_no     AS purchase_invoice,
        p.purchase_date  AS original_purchase_date,
        -- Pull invoice numbers by joining purchases on the IDs stored in settlement_details
        COALESCE(
          (
            SELECT GROUP_CONCAT(DISTINCT p2.invoice_no ORDER BY p2.invoice_no SEPARATOR ', ')
            FROM JSON_TABLE(
              pr.settlement_details,
              '$[*]' COLUMNS (pid INT PATH '$.purchase_id')
            ) AS jt
            JOIN purchases p2 ON p2.id = jt.pid
            WHERE jt.pid IS NOT NULL
          ),
          p.invoice_no
        ) AS invoice_display,
        -- Pull earliest invoice date the same way
        COALESCE(
          (
            SELECT DATE(MIN(p2.purchase_date))
            FROM JSON_TABLE(
              pr.settlement_details,
              '$[*]' COLUMNS (pid INT PATH '$.purchase_id')
            ) AS jt
            JOIN purchases p2 ON p2.id = jt.pid
            WHERE jt.pid IS NOT NULL
          ),
          DATE(p.purchase_date)
        ) AS invoice_date_display
      FROM purchase_returns pr
      JOIN  supplier s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      ORDER BY pr.return_date DESC, pr.id DESC
    `);

    const formattedReturns = returns.map(ret => ({
      ...ret,
      total_amount:         parseFloat(ret.total_amount)   || 0,
      settled_amount:       parseFloat(ret.settled_amount) || 0,
      balance_amount:       parseFloat(ret.balance_amount) || 0,
      subtotal:             parseFloat(ret.subtotal)       || 0,
      vat_amount:           parseFloat(ret.vat_amount)     || 0,
      invoice_display:      ret.invoice_display      || '—',
      invoice_date_display: ret.invoice_date_display || null
    }));

    res.json(formattedReturns);
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get purchase return by ID with full details
const getPurchaseReturnById = async (req, res) => {
  const { id } = req.params;

  try {
    const [returns] = await pool.query(`
      SELECT 
        pr.*,
        s.name AS supplier_name,
        s.vat_registered AS supplier_vat_registered,
        s.vat_number AS supplier_vat_number,
        p.invoice_no AS purchase_invoice,
        p.purchase_date AS original_purchase_date,
        u.name AS returned_by_name
      FROM purchase_returns pr
      LEFT JOIN supplier s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      LEFT JOIN users u ON pr.returned_by = u.id
      WHERE pr.id = ?
    `, [id]);

    if (returns.length === 0) {
      return res.status(404).json({ error: 'Purchase return not found' });
    }

    const purchaseReturn = returns[0];

    if (purchaseReturn.settlement_details) {
      if (typeof purchaseReturn.settlement_details === 'object') {
        purchaseReturn.settlement_details = purchaseReturn.settlement_details;
      } else {
        try {
          purchaseReturn.settlement_details = JSON.parse(purchaseReturn.settlement_details);
        } catch (e) {
          console.error('Error parsing settlement_details:', e);
          purchaseReturn.settlement_details = [];
        }
      }
    } else {
      purchaseReturn.settlement_details = [];
    }

    const [items] = await pool.query(`
      SELECT 
        pri.*,
        i.item_code,
        i.unit
      FROM purchase_return_items pri
      LEFT JOIN items i ON pri.item_id = i.id
      WHERE pri.return_id = ?
    `, [id]);

    purchaseReturn.items = items || [];

    res.json(purchaseReturn);
  } catch (error) {
    console.error('Error fetching purchase return:', error);
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message,
      sqlMessage: error.sqlMessage 
    });
  }
};

// Get purchase return by return number
const getPurchaseReturnByNumber = async (req, res) => {
  const { returnNumber } = req.params;

  try {
    const [returns] = await pool.query(`
      SELECT 
        pr.*,
        s.name AS supplier_name,
        s.vat_registered AS supplier_vat_registered,
        s.vat_number AS supplier_vat_number,
        p.invoice_no AS purchase_invoice,
        p.purchase_date AS original_purchase_date,
        u.name AS returned_by_name
      FROM purchase_returns pr
      LEFT JOIN supplier s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      LEFT JOIN users u ON pr.returned_by = u.id
      WHERE pr.return_number = ?
    `, [returnNumber]);

    if (returns.length === 0) {
      return res.status(404).json({ error: 'Purchase return not found' });
    }

    const purchaseReturn = returns[0];

    if (purchaseReturn.settlement_details) {
      if (typeof purchaseReturn.settlement_details === 'object') {
        purchaseReturn.settlement_details = purchaseReturn.settlement_details;
      } else {
        try {
          purchaseReturn.settlement_details = JSON.parse(purchaseReturn.settlement_details);
        } catch (e) {
          purchaseReturn.settlement_details = [];
        }
      }
    } else {
      purchaseReturn.settlement_details = [];
    }

    const [items] = await pool.query(`
      SELECT 
        pri.*,
        i.item_code,
        i.unit
      FROM purchase_return_items pri
      LEFT JOIN items i ON pri.item_id = i.id
      WHERE pri.return_id = ?
    `, [purchaseReturn.id]);

    purchaseReturn.items = items || [];

    res.json(purchaseReturn);
  } catch (error) {
    console.error('Error fetching purchase return:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get VAT summary
const getVATSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const [summary] = await pool.query(`
      SELECT 
        COUNT(*) AS total_returns,
        COALESCE(SUM(pr.subtotal), 0) AS total_return_value,
        COALESCE(SUM(pr.vat_amount), 0) AS total_vat_credit
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      WHERE s.vat_registered = 1 
        AND s.vat_number IS NOT NULL 
        AND pr.vat_amount > 0
        AND DATE(pr.return_date) BETWEEN ? AND ?
    `, [startDate, endDate]);

    res.json({
      total_returns: summary[0].total_returns || 0,
      total_return_value: parseFloat(summary[0].total_return_value || 0),
      total_vat_credit: parseFloat(summary[0].total_vat_credit || 0)
    });
  } catch (error) {
    console.error('Error fetching VAT summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get purchase returns for a specific purchase bill
const getPurchaseReturnsForBill = async (req, res) => {
  const { id } = req.params;

  try {
    const [returns] = await pool.query(`
      SELECT 
        pr.id,
        pr.return_number,
        pr.return_date,
        pr.total_amount,
        pr.settled_amount,
        pr.balance_amount,
        pri.item_name,
        pri.quantity,
        pri.unit_price,
        pri.total_amount as line_total
      FROM purchase_returns pr
      LEFT JOIN purchase_return_items pri ON pr.id = pri.return_id
      WHERE pr.purchase_id = ?
      ORDER BY pr.return_date DESC
    `, [id]);

    res.json(returns);
  } catch (error) {
    console.error('Error fetching purchase returns:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get current stock for all items
const getCurrentStock = async (req, res) => {
  try {
    const [stock] = await pool.query(`
      SELECT 
        i.id AS item_id,
        i.name AS item_name,
        i.unit,
        COALESCE(ob.quantity, 0) + 
        COALESCE((
          SELECT COALESCE(SUM(pi.quantity), 0)
          FROM purchase_items pi 
          JOIN purchases p ON pi.purchase_id = p.id 
          WHERE pi.item_id = i.id
            AND (p.deleted = FALSE OR p.deleted IS NULL)
        ), 0) - 
        COALESCE((
          SELECT COALESCE(SUM(ii.quantity), 0)
          FROM issuance_items ii 
          WHERE ii.item_id = i.id
        ), 0) - 
        COALESCE((
          SELECT COALESCE(SUM(pri.quantity), 0)
          FROM purchase_return_items pri 
          WHERE pri.item_id = i.id
        ), 0) - 
        COALESCE((
          SELECT COALESCE(SUM(wi.quantity), 0)
          FROM wastage_items wi 
          WHERE wi.item_id = i.id
        ), 0) AS quantity
      FROM items i
      LEFT JOIN opening_balances ob ON i.id = ob.item_id
      WHERE (i.deleted = FALSE OR i.deleted IS NULL)
    `);
    
    const formattedStock = stock.map(item => ({
      item_id: item.item_id,
      item_name: item.item_name,
      unit: item.unit,
      quantity: parseFloat(item.quantity) || 0
    }));
    
    res.json(formattedStock);
  } catch (error) {
    console.error('Error fetching current stock:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get current stock for a single item
const getItemStock = async (req, res) => {
  const { itemId } = req.params;
  
  try {
    const [stock] = await pool.query(`
      SELECT 
        COALESCE(ob.quantity, 0) + 
        COALESCE((
          SELECT COALESCE(SUM(pi.quantity), 0)
          FROM purchase_items pi 
          JOIN purchases p ON pi.purchase_id = p.id 
          WHERE pi.item_id = ?
            AND (p.deleted = FALSE OR p.deleted IS NULL)
        ), 0) - 
        COALESCE((
          SELECT COALESCE(SUM(ii.quantity), 0)
          FROM issuance_items ii 
          WHERE ii.item_id = ?
        ), 0) - 
        COALESCE((
          SELECT COALESCE(SUM(pri.quantity), 0)
          FROM purchase_return_items pri 
          WHERE pri.item_id = ?
        ), 0) - 
        COALESCE((
          SELECT COALESCE(SUM(wi.quantity), 0)
          FROM wastage_items wi 
          WHERE wi.item_id = ?
        ), 0) AS quantity
      FROM items i
      LEFT JOIN opening_balances ob ON i.id = ob.item_id
      WHERE i.id = ?
    `, [itemId, itemId, itemId, itemId, itemId]);
    
    const quantity = stock.length > 0 ? (parseFloat(stock[0].quantity) || 0) : 0;
    
    res.json({ 
      item_id: parseInt(itemId),
      quantity: quantity 
    });
  } catch (error) {
    console.error('Error fetching item stock:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get VAT returns summary
const getVATReturnsSummary = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    const [[summary]] = await pool.query(`
      SELECT
        COUNT(DISTINCT pr.id) AS total_returns,
        COALESCE(SUM(pri.quantity * pri.unit_price), 0) AS total_return_value,
        COALESCE(SUM(pri.vat_amount), 0) AS total_vat_credit
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      JOIN purchase_return_items pri ON pr.id = pri.return_id
      WHERE s.vat_registered = 1
        AND DATE(pr.return_date) BETWEEN ? AND ?
    `, [startDate, endDate]);

    res.json({
      total_returns: summary.total_returns || 0,
      total_return_value: parseFloat(summary.total_return_value || 0),
      total_vat_credit: parseFloat(summary.total_vat_credit || 0)
    });
  } catch (error) {
    console.error('Error fetching VAT summary:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Get VAT returns - FIXED to show invoice info
const getVATReturns = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY pr.return_date, pr.id) AS serial_no,
        s.name       AS supplier_name,
        s.vat_number AS tin_no,
        COALESCE(
          (
            SELECT DATE(MIN(p2.purchase_date))
            FROM JSON_TABLE(
              COALESCE(pr.settlement_details, '[]'),
              '$[*]' COLUMNS (pid INT PATH '$.purchase_id')
            ) AS jt
            JOIN purchases p2 ON p2.id = jt.pid
            WHERE jt.pid IS NOT NULL
          ),
          DATE(p.purchase_date),
          DATE(pr.return_date)
        ) AS invoice_date,
        COALESCE(
          (
            SELECT GROUP_CONCAT(DISTINCT p2.invoice_no ORDER BY p2.invoice_no SEPARATOR ', ')
            FROM JSON_TABLE(
              COALESCE(pr.settlement_details, '[]'),
              '$[*]' COLUMNS (pid INT PATH '$.purchase_id')
            ) AS jt
            JOIN purchases p2 ON p2.id = jt.pid
            WHERE jt.pid IS NOT NULL
          ),
          p.invoice_no,
          '—'
        ) AS invoice_no,
        'Credit'             AS tax_credit,
        DATE(pr.return_date) AS date_of_tax_credit,
        pr.return_number     AS tax_credit_no,
        pr.return_number     AS return_bill_no,
        SUM(pri.quantity * pri.unit_price) AS value_of_return,
        SUM(COALESCE(pri.vat_amount, 0))   AS vat_amount
      FROM purchase_returns pr
      JOIN  supplier s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      JOIN  purchase_return_items pri ON pr.id = pri.return_id
      WHERE s.vat_registered = 1
        AND DATE(pr.return_date) BETWEEN ? AND ?
      GROUP BY
        pr.id, s.name, s.vat_number,
        pr.purchase_id, p.purchase_date, p.invoice_no,
        pr.return_date, pr.return_number, pr.settlement_details
      ORDER BY pr.return_date, pr.id
    `, [startDate, endDate]);

    const formattedRows = rows.map(row => ({
      serial_no:       row.serial_no,
      supplier_name:   row.supplier_name,
      tin_no:          row.tin_no,
      // Normalise "null" string → null
      invoice_date:    (row.invoice_date  && row.invoice_date  !== 'null') ? row.invoice_date  : null,
      invoice_no:      (row.invoice_no    && row.invoice_no    !== 'null') ? row.invoice_no    : '—',
      tax_credit:      row.tax_credit,
      return_date:     row.date_of_tax_credit,
      tax_credit_no:   row.tax_credit_no,
      return_bill_no:  row.return_bill_no,
      value_of_return: parseFloat(row.value_of_return) || 0,
      vat_amount:      parseFloat(row.vat_amount)       || 0
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching VAT returns:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

module.exports = {
  getPurchasesForReturn,
  getPurchaseItemsForReturn,
  getSupplierBillsWithBalance,
  getCurrentStock,
  getVATReturns,
  getVATSummary,
  createPurchaseReturn,
  getAllPurchaseReturns,
  getPurchaseReturnById,
  getPurchaseReturnByNumber,
  getPurchaseReturnsForBill,
  getItemStock,
  getVATReturnsSummary
};