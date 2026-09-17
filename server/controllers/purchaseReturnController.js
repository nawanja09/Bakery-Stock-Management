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
      settlements,
      vat_rate: clientVatRate
    } = req.body;

    // Use the rate sent by the client, defaulting to 18 (the system-wide rate).
    // Never trust the client for supplier VAT registration status — always re-verify from DB.
    const vatRate = parseFloat(clientVatRate) > 0 ? parseFloat(clientVatRate) : 18;

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

    // ─── Re-verify supplier VAT registration directly from DB ──────────────
    // This prevents the client from spoofing VAT status and ensures the
    // server is the single source of truth for this business rule.
    const [supplierRows] = await connection.query(
      'SELECT vat_registered FROM supplier WHERE id = ? LIMIT 1',
      [supplier_id]
    );
    if (supplierRows.length === 0) {
      throw new Error('Supplier not found');
    }
    const supplierVatRegistered = supplierRows[0].vat_registered === 1 || supplierRows[0].vat_registered === true;

    // Calculate totals
    let subtotal = 0;
    let totalVat = 0;
    let totalAmount = 0;

    // Process each item
    // VAT logic: apply VAT only when BOTH supplier is VAT-registered
    // AND the individual RM item is flagged vat_applicable.
    const processedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const quantity  = parseFloat(item.return_quantity) || 0;
      const unitPrice = parseFloat(item.unit_price)      || 0;
      const amount    = quantity * unitPrice;
      subtotal += amount;

      const isVatApplicable = item.vat_applicable === true || item.vat_applicable === 1;
      // VAT is charged only when the supplier is VAT-registered AND the item is VAT applicable
      const shouldApplyVat = supplierVatRegistered && isVatApplicable;
      const vatAmount = shouldApplyVat ? (amount * (vatRate / 100)) : 0;
      totalVat    += vatAmount;
      totalAmount += amount + vatAmount;

      processedItems.push({
        originalItem:  item,
        quantity:      quantity,
        unit_price:    unitPrice,
        amount:        amount,
        vat_amount:    vatAmount,
        total_amount:  amount + vatAmount
      });
    }

    // Calculate settlement amounts and enhance with purchase details
    let settledAmount = 0;
    let enhancedSettlements = [];
    
    if (settlements && settlements.length > 0) {
      for (const settlement of settlements) {
        const settlementAmount = parseFloat(settlement.amount) || 0;
        settledAmount += settlementAmount;
        
        // Get purchase details for this settlement
        const [purchaseDetails] = await connection.query(
          `SELECT id, invoice_no, DATE(purchase_date) as purchase_date FROM purchases WHERE id = ?`,
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

    // Insert purchase return
    // vat_rate column is added by migration 010_add_vat_rate_to_purchase_returns.sql.
    // If the column does not yet exist the INSERT falls back gracefully (column simply omitted).
    let returnResult;
    try {
      [returnResult] = await connection.query(
        `INSERT INTO purchase_returns 
        (return_number, return_date, purchase_id, supplier_id, subtotal, vat_amount, vat_rate,
         total_amount, settled_amount, balance_amount, settlement_details, remarks, returned_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          return_number,
          return_date,
          purchase_id || null,
          supplier_id,
          subtotal,
          totalVat,
          vatRate,
          totalAmount,
          settledAmount,
          balanceAmount,
          JSON.stringify(enhancedSettlements),
          remarks || null,
          returned_by
        ]
      );
    } catch (insertErr) {
      // Fallback: if vat_rate column does not exist yet, retry without it
      if (insertErr.code === 'ER_BAD_FIELD_ERROR') {
        [returnResult] = await connection.query(
          `INSERT INTO purchase_returns 
          (return_number, return_date, purchase_id, supplier_id, subtotal, vat_amount,
           total_amount, settled_amount, balance_amount, settlement_details, remarks, returned_by) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
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
          ]
        );
      } else {
        throw insertErr;
      }
    }
    const returnId = returnResult.insertId;

    // Insert return items
    for (let i = 0; i < processedItems.length; i++) {
      const processed = processedItems[i];
      const originalItem = processed.originalItem;
      
      let itemId = originalItem.item_id;
      let itemName = originalItem.item_name;
      let vatApplicable = originalItem.vat_applicable === true || originalItem.vat_applicable === 1;
      
      if (!itemId && itemName) {
        const [foundItem] = await connection.query(
          'SELECT id, vat_applicable FROM items WHERE name = ? OR item_code = ? LIMIT 1',
          [itemName, itemName]
        );
        if (foundItem.length > 0) {
          itemId = foundItem[0].id;
          vatApplicable = foundItem[0].vat_applicable === 1;
        }
      }
      
      let purchaseItemId = null;
      
      if (purchase_id && itemId) {
        const [purchaseItem] = await connection.query(
          `SELECT id FROM purchase_items 
           WHERE purchase_id = ? AND item_id = ? 
           LIMIT 1`,
          [purchase_id, itemId]
        );
        if (purchaseItem.length > 0) {
          purchaseItemId = purchaseItem[0].id;
        }
      }
      
      await connection.query(
        `INSERT INTO purchase_return_items 
        (return_id, purchase_item_id, item_id, item_name, quantity, unit_price, 
         vat_applicable, vat_amount, total_amount) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          returnId, 
          purchaseItemId, 
          itemId, 
          itemName || `Item ${i + 1}`,
          processed.quantity, 
          processed.unit_price, 
          vatApplicable ? 1 : 0,
          processed.vat_amount,
          processed.total_amount
        ]
      );
    }

    // ─── Auto-create Supplier Credit for remaining balance ───────────────
    // Settlement against invoices is now handled from the Invoice page.
    // We still support legacy `settlements` field for backward compat but
    // the primary flow is: return amount becomes a supplier credit.
    if (settlements && settlements.length > 0) {
      for (const settlement of settlements) {
        const settlementAmount = parseFloat(settlement.amount) || 0;

        const [purchaseRows] = await connection.query(
          `SELECT balance_amount, paid_amount, total_with_vat FROM purchases WHERE id = ?`,
          [settlement.purchase_id]
        );

        if (purchaseRows.length > 0) {
          const currentBalance = parseFloat(purchaseRows[0].balance_amount) || 0;
          const currentPaid    = parseFloat(purchaseRows[0].paid_amount)    || 0;

          const newBalance      = Math.max(0, currentBalance - settlementAmount);
          const newPaid         = currentPaid + settlementAmount;
          const newBalanceStatus = newBalance > 0 ? 1 : 0;

          let paymentStatus = 'Non-Paid';
          if (newPaid >= purchaseRows[0].total_with_vat) paymentStatus = 'Paid';
          else if (newPaid > 0) paymentStatus = 'Partially Paid';

          await connection.query(
            `UPDATE purchases SET balance_amount = ?, paid_amount = ?, balance_status = ?, payment_status = ? WHERE id = ?`,
            [newBalance, newPaid, newBalanceStatus, paymentStatus, settlement.purchase_id]
          );

          await connection.query(
            `INSERT INTO payment_history (purchase_id, payment_date, amount, payment_method, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [settlement.purchase_id, return_date, settlementAmount, payment_method || 'CASH',
             `Return settlement from return #${return_number}`, returned_by]
          );
        }
      }
    }

    // Auto-create a purchase_return_credit for the unsettled balance
    const remainingForCredit = balanceAmount; // amount not settled against any invoice
    if (remainingForCredit > 0) {
      const datePart  = return_date.replace(/-/g, '');
      const rand      = Math.floor(Math.random() * 9000) + 1000;
      const creditNum = `CRD-${datePart}-${rand}`;

      try {
        await connection.query(`
          INSERT INTO purchase_return_credits
            (credit_number, purchase_return_id, supplier_id, original_amount,
             remaining_credit, status, credit_date)
          VALUES (?, ?, ?, ?, ?, 'Active', ?)
        `, [creditNum, returnId, supplier_id, remainingForCredit, remainingForCredit, return_date]);
      } catch (creditErr) {
        // Non-fatal — table may not exist yet if migration hasn't run
        console.warn('Could not create return credit (migration pending?):', creditErr.message);
      }
    }

    await connection.commit();

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
    console.error('Error creating purchase return:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ 
        error: 'Return number already exists. Please use a unique return number.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Server error: ' + error.message 
    });
  } finally {
    connection.release();
  }
};

// Get all purchase returns - FIXED to show invoice info
const getAllPurchaseReturns = async (req, res) => {
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
      JOIN supplier s ON pr.supplier_id = s.id
      LEFT JOIN purchases p ON pr.purchase_id = p.id
      LEFT JOIN users u ON pr.returned_by = u.id
      ORDER BY pr.return_date DESC, pr.id DESC
    `);

    const formattedReturns = [];
    
    for (const ret of returns) {
      let invoice_display = '—';
      let invoice_date_display = null;
      
      // Parse settlement_details to get invoice info
      let settlements = [];
      if (ret.settlement_details) {
        try {
          if (typeof ret.settlement_details === 'string') {
            settlements = JSON.parse(ret.settlement_details);
          } else if (typeof ret.settlement_details === 'object') {
            settlements = ret.settlement_details;
          }
        } catch (e) {
          console.warn('Error parsing settlement_details:', e.message);
        }
      }
      
      // Get invoice info from settlements
      if (Array.isArray(settlements) && settlements.length > 0) {
        const purchaseIds = settlements.map(s => s.purchase_id).filter(Boolean);
        
        if (purchaseIds.length > 0) {
          const placeholders = purchaseIds.map(() => '?').join(',');
          const [purchases] = await pool.query(
            `SELECT id, invoice_no, DATE(purchase_date) as purchase_date 
             FROM purchases 
             WHERE id IN (${placeholders})`,
            purchaseIds
          );
          
          const invoices = purchases.map(p => p.invoice_no).filter(Boolean);
          if (invoices.length > 0) {
            invoice_display = invoices.join(', ');
          }
          
          const dates = purchases.map(p => p.purchase_date).filter(Boolean);
          if (dates.length > 0) {
            const earliestDate = dates.reduce((a, b) => a < b ? a : b);
            invoice_date_display = earliestDate;
          }
        }
      }
      
      // If no settlements, use direct purchase invoice
      if (invoice_display === '—' && ret.purchase_invoice) {
        invoice_display = ret.purchase_invoice;
        invoice_date_display = ret.original_purchase_date;
      }
      
      formattedReturns.push({
        ...ret,
        total_amount: parseFloat(ret.total_amount) || 0,
        settled_amount: parseFloat(ret.settled_amount) || 0,
        balance_amount: parseFloat(ret.balance_amount) || 0,
        subtotal: parseFloat(ret.subtotal) || 0,
        vat_amount: parseFloat(ret.vat_amount) || 0,
        invoice_display: invoice_display,
        invoice_date_display: invoice_date_display
      });
    }

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
      details: error.message 
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

// Get VAT returns - COMPLETELY FIXED for invoice display
const getVATReturns = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    // First, get all VAT registered returns with their settlement details
    const [rows] = await pool.query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY pr.return_date, pr.id) AS serial_no,
        s.name AS supplier_name,
        s.vat_number AS tin_no,
        DATE(pr.return_date) AS return_date,
        pr.return_number AS tax_credit_no,
        pr.settlement_details,
        pr.purchase_id,
        pr.id AS return_id,
        SUM(pri.quantity * pri.unit_price) AS value_of_return,
        SUM(COALESCE(pri.vat_amount, 0)) AS vat_amount
      FROM purchase_returns pr
      JOIN supplier s ON pr.supplier_id = s.id
      JOIN purchase_return_items pri ON pr.id = pri.return_id
      WHERE s.vat_registered = 1
        AND DATE(pr.return_date) BETWEEN ? AND ?
      GROUP BY
        pr.id, s.name, s.vat_number,
        pr.return_date, pr.return_number, pr.settlement_details, pr.purchase_id
      ORDER BY pr.return_date, pr.id
    `, [startDate, endDate]);

    const formattedRows = [];
    
    for (const row of rows) {
      let invoice_no = null;
      let invoice_date = null;
      let allInvoiceNumbers = [];
      let allInvoiceDates = [];
      
      // Parse settlement_details
      let settlements = [];
      if (row.settlement_details) {
        try {
          if (typeof row.settlement_details === 'string') {
            settlements = JSON.parse(row.settlement_details);
          } else if (typeof row.settlement_details === 'object') {
            settlements = row.settlement_details;
          }
        } catch (e) {
          console.warn('Error parsing settlement_details for return', row.return_id, e.message);
        }
      }
      
      // If we have settlements, get invoice info from each settled bill
      if (Array.isArray(settlements) && settlements.length > 0) {
        const purchaseIds = settlements.map(s => s.purchase_id).filter(Boolean);
        
        if (purchaseIds.length > 0) {
          const placeholders = purchaseIds.map(() => '?').join(',');
          const [purchases] = await pool.query(
            `SELECT id, invoice_no, DATE(purchase_date) as purchase_date 
             FROM purchases 
             WHERE id IN (${placeholders})
             ORDER BY purchase_date ASC`,
            purchaseIds
          );
          
          for (const purchase of purchases) {
            if (purchase.invoice_no) {
              allInvoiceNumbers.push(purchase.invoice_no);
            }
            if (purchase.purchase_date) {
              allInvoiceDates.push(purchase.purchase_date);
            }
          }
        }
      }
      
      // If no settlements, try to get from direct purchase_id
      if (allInvoiceNumbers.length === 0 && row.purchase_id) {
        const [purchase] = await pool.query(
          `SELECT invoice_no, DATE(purchase_date) as purchase_date 
           FROM purchases WHERE id = ?`,
          [row.purchase_id]
        );
        if (purchase.length > 0) {
          if (purchase[0].invoice_no) {
            allInvoiceNumbers.push(purchase[0].invoice_no);
          }
          if (purchase[0].purchase_date) {
            allInvoiceDates.push(purchase[0].purchase_date);
          }
        }
      }
      
      // Format the results
      if (allInvoiceNumbers.length > 0) {
        invoice_no = allInvoiceNumbers.join(', ');
        if (allInvoiceDates.length > 0) {
          const earliestDate = allInvoiceDates.reduce((a, b) => a < b ? a : b);
          invoice_date = earliestDate;
        }
      }
      
      // If still no invoice info, use return date as fallback
      if (!invoice_date) {
        invoice_date = row.return_date;
      }
      
      formattedRows.push({
        serial_no: row.serial_no,
        supplier_name: row.supplier_name,
        tin_no: row.tin_no || '',
        invoice_date: invoice_date,
        invoice_no: invoice_no || '—',
        tax_credit: 'Credit',
        date_of_tax_credit: row.return_date,
        tax_credit_no: row.tax_credit_no,
        value_of_return: parseFloat(row.value_of_return) || 0,
        vat_amount: parseFloat(row.vat_amount) || 0
      });
    }

    res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching VAT returns:', error);
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

// ============================================================
// Return VAT Report (renamed from "VAT Effect")
//
// Unifies two return types under one report:
//   - Purchase Returns (purchase_returns / purchase_return_items) - the
//     data that used to be the whole "VAT Effect" report above.
//   - Credit Notes (payee_credit_notes, from the New Expenses module).
// The existing getVATReturns / getVATReturnsSummary above are left
// untouched so any existing integrations keep working.
// ============================================================
const formatReturnAmt = (v) => parseFloat(v) || 0;

const getReturnVATReport = async (req, res) => {
  const { startDate, endDate, returnType } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  const type = (returnType || 'All').trim();
  const wantPurchaseReturns = type === 'All' || type === 'Purchase Returns';
  const wantCreditNotes = type === 'All' || type === 'Credit Note';

  try {
    let rows = [];

    if (wantPurchaseReturns) {
      const [prRows] = await pool.query(`
        SELECT
          DATE(pr.return_date) AS date,
          'Purchase Return' AS return_type,
          s.name AS supplier,
          pr.return_number AS reference_no,
          SUM(pri.quantity * pri.unit_price) AS amount_before_vat,
          SUM(COALESCE(pri.vat_amount, 0)) AS vat_amount,
          pr.total_amount AS total_amount,
          c.name AS company
        FROM purchase_returns pr
        JOIN supplier s ON pr.supplier_id = s.id
        JOIN purchase_return_items pri ON pr.id = pri.return_id
        LEFT JOIN purchases p ON pr.purchase_id = p.id
        LEFT JOIN company c ON p.company_id = c.id
        WHERE s.vat_registered = 1
          AND DATE(pr.return_date) BETWEEN ? AND ?
        GROUP BY pr.id, s.name, pr.return_number, pr.total_amount, c.name
      `, [startDate, endDate]);
      rows = rows.concat(prRows);
    }

    if (wantCreditNotes) {
      const [cnRows] = await pool.query(`
        SELECT
          cn.credit_note_date AS date,
          'Credit Note' AS return_type,
          cn.payee_name AS supplier,
          cn.credit_note_number AS reference_no,
          cn.without_vat_amount AS amount_before_vat,
          cn.vat_amount AS vat_amount,
          cn.total_amount AS total_amount,
          c.name AS company
        FROM payee_credit_notes cn
        LEFT JOIN company c ON c.id = cn.company_id
        WHERE cn.status != 'Cancelled'
          AND cn.credit_note_date BETWEEN ? AND ?
      `, [startDate, endDate]);
      rows = rows.concat(cnRows);
    }

    rows.sort((a, b) => new Date(b.date) - new Date(a.date));

    const formatted = rows.map((r, idx) => ({
      serial_no: idx + 1,
      date: r.date,
      return_type: r.return_type,
      supplier: r.supplier,
      reference_no: r.reference_no,
      amount_before_vat: formatReturnAmt(r.amount_before_vat),
      vat_amount: formatReturnAmt(r.vat_amount),
      total_amount: formatReturnAmt(r.total_amount),
      company: r.company || '-'
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching Return VAT report:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const getReturnVATSummary = async (req, res) => {
  const { startDate, endDate, returnType } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  const type = (returnType || 'All').trim();
  const wantPurchaseReturns = type === 'All' || type === 'Purchase Returns';
  const wantCreditNotes = type === 'All' || type === 'Credit Note';

  try {
    let totalCount = 0, totalBeforeVat = 0, totalVat = 0, totalAmount = 0;

    if (wantPurchaseReturns) {
      const [[s]] = await pool.query(`
        SELECT
          COUNT(DISTINCT pr.id) AS cnt,
          COALESCE(SUM(pri.quantity * pri.unit_price), 0) AS before_vat,
          COALESCE(SUM(pri.vat_amount), 0) AS vat
        FROM purchase_returns pr
        JOIN supplier s ON pr.supplier_id = s.id
        JOIN purchase_return_items pri ON pr.id = pri.return_id
        WHERE s.vat_registered = 1
          AND DATE(pr.return_date) BETWEEN ? AND ?
      `, [startDate, endDate]);
      totalCount += s.cnt || 0;
      totalBeforeVat += formatReturnAmt(s.before_vat);
      totalVat += formatReturnAmt(s.vat);
      totalAmount += formatReturnAmt(s.before_vat) + formatReturnAmt(s.vat);
    }

    if (wantCreditNotes) {
      const [[s]] = await pool.query(`
        SELECT
          COUNT(*) AS cnt,
          COALESCE(SUM(without_vat_amount), 0) AS before_vat,
          COALESCE(SUM(vat_amount), 0) AS vat,
          COALESCE(SUM(total_amount), 0) AS total
        FROM payee_credit_notes
        WHERE status != 'Cancelled'
          AND credit_note_date BETWEEN ? AND ?
      `, [startDate, endDate]);
      totalCount += s.cnt || 0;
      totalBeforeVat += formatReturnAmt(s.before_vat);
      totalVat += formatReturnAmt(s.vat);
      totalAmount += formatReturnAmt(s.total);
    }

    res.json({
      total_returns: totalCount,
      total_before_vat: totalBeforeVat,
      total_vat: totalVat,
      total_amount: totalAmount || (totalBeforeVat + totalVat)
    });
  } catch (error) {
    console.error('Error fetching Return VAT summary:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// Add settlement to existing purchase return
const addSettlementToPurchaseReturn = async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { settlements, payment_method, settlement_date, notes, settled_by } = req.body;

    // Validate required fields
    if (!settlements || settlements.length === 0) {
      return res.status(400).json({ error: 'At least one settlement is required' });
    }

    // Get current purchase return
    const [returns] = await connection.query(
      `SELECT * FROM purchase_returns WHERE id = ?`,
      [id]
    );

    if (returns.length === 0) {
      return res.status(404).json({ error: 'Purchase return not found' });
    }

    const currentReturn = returns[0];
    const currentSettledAmount = parseFloat(currentReturn.settled_amount) || 0;
    const totalReturnAmount = parseFloat(currentReturn.total_amount) || 0;

    // Calculate new settlement amounts
    let newSettlementAmount = 0;
    let enhancedNewSettlements = [];

    for (const settlement of settlements) {
      const settlementAmount = parseFloat(settlement.amount) || 0;
      newSettlementAmount += settlementAmount;

      // Get purchase details for this settlement
      const [purchaseDetails] = await connection.query(
        `SELECT id, invoice_no, DATE(purchase_date) as purchase_date FROM purchases WHERE id = ?`,
        [settlement.purchase_id]
      );

      if (purchaseDetails.length > 0) {
        enhancedNewSettlements.push({
          purchase_id: settlement.purchase_id,
          invoice_no: purchaseDetails[0].invoice_no,
          purchase_date: purchaseDetails[0].purchase_date,
          amount: settlementAmount
        });
      }
    }

    // Calculate new totals
    const newTotalSettled = currentSettledAmount + newSettlementAmount;
    const newBalanceAmount = totalReturnAmount - newTotalSettled;

    // Validate settlement doesn't exceed total
    if (newTotalSettled > totalReturnAmount) {
      return res.status(400).json({ 
        error: `Settlement amount exceeds return total. Return total: Rs. ${totalReturnAmount.toFixed(2)}, Already settled: Rs. ${currentSettledAmount.toFixed(2)}, Remaining: Rs. ${(totalReturnAmount - currentSettledAmount).toFixed(2)}`
      });
    }

    // Parse existing settlements
    let existingSettlements = [];
    if (currentReturn.settlement_details) {
      try {
        if (typeof currentReturn.settlement_details === 'string') {
          existingSettlements = JSON.parse(currentReturn.settlement_details);
        } else if (typeof currentReturn.settlement_details === 'object') {
          existingSettlements = currentReturn.settlement_details;
        }
      } catch (e) {
        console.warn('Error parsing existing settlement_details:', e.message);
        existingSettlements = [];
      }
    }

    // Merge settlements
    const allSettlements = [...existingSettlements, ...enhancedNewSettlements];

    // Update purchase return with new settlement totals
    await connection.query(
      `UPDATE purchase_returns 
       SET settled_amount = ?, 
           balance_amount = ?,
           settlement_details = ?
       WHERE id = ?`,
      [newTotalSettled, newBalanceAmount, JSON.stringify(allSettlements), id]
    );

    // Update purchase balances if settlements were made
    for (const settlement of settlements) {
      const settlementAmount = parseFloat(settlement.amount) || 0;

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

        await connection.query(
          `UPDATE purchases 
           SET balance_amount = ?, 
               paid_amount = ?,
               balance_status = ?,
               payment_status = ?
           WHERE id = ?`,
          [newBalance, newPaid, newBalanceStatus, paymentStatus, settlement.purchase_id]
        );

        // Record payment history
        await connection.query(
          `INSERT INTO payment_history 
           (purchase_id, payment_date, amount, payment_method, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            settlement.purchase_id,
            settlement_date || new Date().toISOString().split('T')[0],
            settlementAmount,
            payment_method || 'CASH',
            notes || `Settlement added to return #${currentReturn.return_number}`,
            settled_by
          ]
        );
      }
    }

    await connection.commit();

    res.json({
      message: 'Settlement added successfully!',
      settlement_id: id,
      summary: {
        total_amount: totalReturnAmount,
        settled_amount: newTotalSettled,
        balance_amount: newBalanceAmount
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Error adding settlement:', error);
    res.status(500).json({ 
      error: 'Server error: ' + error.message 
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  getPurchasesForReturn,
  getPurchaseItemsForReturn,
  getSupplierBillsWithBalance,
  getCurrentStock,
  getVATReturns,
  getVATSummary,
  getReturnVATReport,
  getReturnVATSummary,
  createPurchaseReturn,
  addSettlementToPurchaseReturn,
  getAllPurchaseReturns,
  getPurchaseReturnById,
  getPurchaseReturnByNumber,
  getPurchaseReturnsForBill,
  getItemStock,
  getVATReturnsSummary
};