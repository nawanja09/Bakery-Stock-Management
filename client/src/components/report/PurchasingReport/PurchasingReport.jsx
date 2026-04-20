import React, { useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './PurchasingReport.css';
import api from '../../../api';

const PurchasingReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // NEW: VAT filter state
  const [vatFilter, setVatFilter] = useState('all'); // 'all', 'yes', 'no'

  const fetchPurchasingReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}`);
      const purchases = response.data;

      const purchasesWithItems = await Promise.all(
        purchases.map(async (purchase) => {
          try {
            // Fetch full details – this should include supplier_vat_number and items
            const detailResponse = await api.get(`/purchases/${purchase.id}`);
            return detailResponse.data; // use the detailed object (contains VAT number)
          } catch (error) {
            console.error(`Error fetching details for purchase ${purchase.id}:`, error);
            // fallback: keep original data but with empty items
            return { ...purchase, items: [] };
          }
        })
      );

      setReportData(purchasesWithItems);
    } catch (error) {
      console.error('Error fetching purchasing report:', error);
      alert('Failed to fetch purchasing report');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text(`Purchasing Report (${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')})`, 15, 15);

    if (companyFilter) {
      const companyName = companyFilter === '1' ? 'JH' : 'RR';
      doc.setFontSize(12);
      doc.text(`Company: ${companyName}`, 15, 25);
    }

    const totalPurchases = reportData.reduce((sum, purchase) => sum + parseFloat(purchase.bill_amount), 0);
    const totalPaid = reportData.reduce((sum, purchase) => sum + parseFloat(purchase.paid_amount), 0);

    doc.setFontSize(12);
    doc.text(`Total Purchases: Rs. ${totalPurchases.toFixed(2)}`, 15, companyFilter ? 35 : 25);
    doc.text(`Total Paid: Rs. ${totalPaid.toFixed(2)}`, 15, companyFilter ? 42 : 32);
    doc.text(`Total Due: Rs. ${(totalPurchases - totalPaid).toFixed(2)}`, 15, companyFilter ? 49 : 39);

    const tableData = [];
    reportData.forEach(purchase => {
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {
          tableData.push([
            purchase.invoice_no,
            format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
            purchase.supplier_name,
            purchase.supplier_vat_number || '—',  // NEW: VAT number
            purchase.company_name || 'N/A',
            purchase.check_number || 'N/A',
            item.item_name || 'N/A',
            Number(item.quantity).toFixed(3),
            `Rs. ${Number(item.unit_price).toFixed(2)}`,
            `Rs. ${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}`,
            purchase.payment_method,
            `Rs. ${parseFloat(purchase.bill_amount).toFixed(2)}`,
            `Rs. ${parseFloat(purchase.paid_amount).toFixed(2)}`,
            `Rs. ${(parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount)).toFixed(2)}`
          ]);
        });
      } else {
        tableData.push([
          purchase.invoice_no,
          format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
          purchase.supplier_name,
          purchase.supplier_vat_number || '—',
          purchase.company_name || 'N/A',
          purchase.check_number || 'N/A',
          'N/A',
          'N/A',
          'N/A',
          'N/A',
          purchase.payment_method,
          `Rs. ${parseFloat(purchase.bill_amount).toFixed(2)}`,
          `Rs. ${parseFloat(purchase.paid_amount).toFixed(2)}`,
          `Rs. ${(parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount)).toFixed(2)}`
        ]);
      }
    });

    const headers = [
      'Invoice #',
      'Date',
      'Supplier',
      'VAT Number',  // NEW header
      'Company',
      'Check Number',
      'Item Name',
      'Quantity',
      'Unit Price',
      'Total Price',
      'Payment Method',
      'Bill Amount',
      'Paid Amount',
      'Due Amount'
    ];

    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: companyFilter ? 55 : 45,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`purchasing-report-${startDate}-to-${endDate}.pdf`);
  };

  const downloadExcel = () => {
    const worksheetData = [];

    // Headers (16 columns — order matters!)
    worksheetData.push([
      'Invoice #',
      'Date',
      'Supplier',
      'VAT Number',
      'Company',
      'Check Number',
      'Item Name',
      'Quantity',
      'Unit Price (Rs.)',
      'Payment Method',
      'Subtotal (Rs.)',
      'VAT Amount (Rs.)',
      'Total Price (Rs.)',
      'Bill Amount (Rs.)',
      'Paid Amount (Rs.)',
      'Due Amount (Rs.)'
    ]);

    reportData.forEach(purchase => {
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {

          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          const subtotal = quantity * unitPrice;
          const vatRate = Number(purchase.vat_rate || 0);
          const vatAmount = subtotal * (vatRate / 100);
          const totalPrice = subtotal + vatAmount;

          const billAmount = Number(purchase.bill_amount || 0);
          const paidAmount = Number(purchase.paid_amount || 0);
          const dueAmount = billAmount - paidAmount;

          worksheetData.push([
            purchase.invoice_no,
            format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
            purchase.supplier_name,
            purchase.supplier_vat_number || '—',
            purchase.company_name || 'N/A',
            purchase.check_number || 'N/A',
            item.item_name || 'N/A',
            quantity,
            unitPrice,
            purchase.payment_method,
            subtotal,
            vatAmount,
            totalPrice,
            billAmount,
            paidAmount,
            dueAmount
          ]);
        });

      } else {
        const billAmount = Number(purchase.bill_amount || 0);
        const paidAmount = Number(purchase.paid_amount || 0);
        const vatAmount = Number(purchase.vat_amount || 0);
        const subtotal = billAmount - vatAmount;
        const dueAmount = billAmount - paidAmount;

        worksheetData.push([
          purchase.invoice_no,
          format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
          purchase.supplier_name,
          purchase.supplier_vat_number || '—',
          purchase.company_name || 'N/A',
          purchase.check_number || 'N/A',
          'No item details',
          null,
          null,
          purchase.payment_method,
          subtotal,
          vatAmount,
          billAmount,
          billAmount,
          paidAmount,
          dueAmount
        ]);
      }
    });

    // Totals row
    const totalBill = reportData.reduce((sum, p) => sum + Number(p.bill_amount || 0), 0);
    const totalPaid = reportData.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
    const totalVat = reportData.reduce((sum, p) => sum + Number(p.vat_amount || 0), 0);
    const totalSubtotal = totalBill - totalVat;
    const totalDue = totalBill - totalPaid;

    worksheetData.push([]);
    worksheetData.push([
      'TOTAL', '', '', '', '', '', '', '', '', '',
      totalSubtotal,
      totalVat,
      totalBill,
      totalBill,
      totalPaid,
      totalDue
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchasing Report');

    // 16 column widths (IMPORTANT FIX)
    worksheet['!cols'] = [
      { wch: 15 }, // Invoice
      { wch: 12 }, // Date
      { wch: 20 }, // Supplier
      { wch: 15 }, // VAT Number
      { wch: 15 }, // Company
      { wch: 15 }, // Check
      { wch: 25 }, // Item
      { wch: 10 }, // Quantity
      { wch: 15 }, // Unit Price
      { wch: 15 }, // Payment
      { wch: 15 }, // Subtotal
      { wch: 15 }, // VAT
      { wch: 15 }, // Total Price
      { wch: 15 }, // Bill
      { wch: 15 }, // Paid
      { wch: 15 }  // Due
    ];

    XLSX.writeFile(workbook, `purchasing-report-${startDate}-to-${endDate}.xlsx`);
  };

  const getAllItemsFromPurchases = () => {
    const allItems = [];
    reportData.forEach(purchase => {
        // 🔥 FIX: Get correct bill amount (handle old bills)
        let totalBillAmount = 0;
        let subtotal = 0;
        let vatAmount = 0;
        
        // Check if this is a new bill with VAT columns
        if (purchase.total_with_vat && purchase.total_with_vat > 0) {
            totalBillAmount = parseFloat(purchase.total_with_vat);
            subtotal = parseFloat(purchase.subtotal || 0);
            vatAmount = parseFloat(purchase.vat_amount || 0);
        } 
        // Old bill - use bill_amount as total (no VAT)
        else if (purchase.bill_amount && purchase.bill_amount > 0) {
            totalBillAmount = parseFloat(purchase.bill_amount);
            subtotal = parseFloat(purchase.bill_amount);
            vatAmount = 0;
        }
        // Fallback
        else {
            totalBillAmount = 0;
            subtotal = 0;
            vatAmount = 0;
        }
        
        const totalPaidAmount = parseFloat(purchase.paid_amount || 0);
        const totalDueAmount = totalBillAmount - totalPaidAmount;
        
        if (purchase.items && purchase.items.length > 0) {
            purchase.items.forEach(item => {
                const quantity = Number(item.quantity || 0);
                const unitPrice = Number(item.unit_price || 0);
                const itemSubtotal = quantity * unitPrice;
                
                // Calculate VAT only for new bills
                let itemVatAmount = 0;
                let itemTotalPrice = itemSubtotal;
                
                if (totalBillAmount > 0 && vatAmount > 0) {
                    // New bill with VAT - calculate proportional VAT
                    const vatRatio = vatAmount / totalBillAmount;
                    itemVatAmount = itemTotalPrice * vatRatio;
                    itemTotalPrice = itemSubtotal + itemVatAmount;
                } else if (totalBillAmount > 0) {
                    // Old bill - no VAT, total price = subtotal
                    itemTotalPrice = itemSubtotal;
                    itemVatAmount = 0;
                }
                
                // Calculate payment ratio for this item
                const paymentRatio = totalBillAmount > 0 ? totalPaidAmount / totalBillAmount : 0;
                const itemPaidAmount = itemTotalPrice * paymentRatio;
                const itemDueAmount = itemTotalPrice - itemPaidAmount;
                
                allItems.push({
                    ...item,
                    supplier_vat_number: purchase.supplier_vat_number,
                    invoice_no: purchase.invoice_no,
                    purchase_date: purchase.purchase_date,
                    supplier_name: purchase.supplier_name,
                    payment_method: purchase.payment_method,
                    bill_amount: totalBillAmount,
                    paid_amount: totalPaidAmount,
                    due_amount: totalDueAmount,
                    item_bill_amount: itemTotalPrice,
                    item_paid_amount: itemPaidAmount,
                    item_due_amount: itemDueAmount,
                    company_name: purchase.company_name,
                    check_number: purchase.check_number,
                    vat_rate: purchase.vat_rate || 0,
                    vat_amount: itemVatAmount,
                    is_old_bill: vatAmount === 0  // Flag to identify old bills
                });
            });
        } else {
            allItems.push({
                supplier_vat_number: purchase.supplier_vat_number,
                invoice_no: purchase.invoice_no,
                purchase_date: purchase.purchase_date,
                supplier_name: purchase.supplier_name,
                item_name: 'No item details',
                quantity: null,
                unit_price: null,
                payment_method: purchase.payment_method,
                bill_amount: totalBillAmount,
                paid_amount: totalPaidAmount,
                due_amount: totalDueAmount,
                item_bill_amount: totalBillAmount,
                item_paid_amount: totalPaidAmount,
                item_due_amount: totalDueAmount,
                company_name: purchase.company_name,
                check_number: purchase.check_number,
                vat_rate: purchase.vat_rate || 0,
                vat_amount: vatAmount,
                is_old_bill: vatAmount === 0
            });
        }
    });
    return allItems;
};

  const allItems = getAllItemsFromPurchases();

  // Apply VAT filter and search filter
  const filteredItems = allItems.filter(item => {
    const matchesSearch = item.item_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesVat = vatFilter === 'all' ||
      (vatFilter === 'yes' ? item.supplier_vat_number : !item.supplier_vat_number);
    return matchesSearch && matchesVat;
  });

  return (
    <div className="purchasing-report-container">
      <div className="report-header">
        <h2>Purchasing Report</h2>
        {reportData.length > 0 && (
          <div className="report-actions">
            <button onClick={downloadPDF} className="btn btn-success">
              <span>📄</span> PDF
            </button>
            <button onClick={downloadExcel} className="btn btn-success">
              <span>📊</span> Excel
            </button>
          </div>
        )}
      </div>

      <div className="controls-section">
        <div className="control-group">
          <label>Start Date</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
            className="control-input"
          />
        </div>

        <div className="control-group">
          <label>End Date</label>
          <input 
            type="date" 
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="control-input"
          />
        </div>

        <div className="control-group">
          <label>Company</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="control-input"
          >
            <option value="">All Companies</option>
            <option value="1">JH</option>
            <option value="2">RR</option>
            <option value="3">Delights</option>
          </select>
        </div>

        {/* NEW: VAT filter dropdown */}
        <div className="control-group">
          <label>VAT Status</label>
          <select
            value={vatFilter}
            onChange={(e) => setVatFilter(e.target.value)}
            className="control-input"
          >
            <option value="all">All</option>
            <option value="yes">Yes (has VAT)</option>
            <option value="no">No (no VAT)</option>
          </select>
        </div>

        <div className="control-group">
          <label>Search Item</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by item name..."
            className="control-input"
          />
        </div>

        <button 
          onClick={fetchPurchasingReport}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? (
            <>
              <div className="loading-spinner"></div>
              Generating...
            </>
          ) : (
            'Generate Report'
          )}
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          Loading report data...
        </div>
      ) : filteredItems.length > 0 ? (
        <div className="table-container">
          <table className="purchasing-report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>VAT Number</th>
                <th>Company</th>
                <th>Check #</th>
                <th>Item Name</th>
                <th>Quantity</th>
                <th>Unit Price (Rs.)</th>
                <th>Total Price (Rs.)</th>
                <th>Payment Method</th>
                <th>Bill Amount (Rs.)</th>
                <th>Paid (Rs.)</th>
                <th>Due (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => {
                // 🔥 Calculate display values safely
                const displayBillAmount = item.item_bill_amount || item.bill_amount || 0;
                const displayPaidAmount = item.item_paid_amount || item.paid_amount || 0;
                const displayDueAmount = displayBillAmount - displayPaidAmount;
                
                return (
                    <tr key={`${item.invoice_no}-${index}`}>
                        <td>{format(new Date(item.purchase_date), 'MMM dd, yyyy')}</td>
                        <td>{item.supplier_name}</td>
                        <td>{item.supplier_vat_number || '—'}</td>
                        <td>{item.company_name || 'N/A'}</td>
                        <td>{item.check_number || 'N/A'}</td>
                        <td>{item.item_name || 'N/A'}</td>
                        <td>{item.quantity ? Number(item.quantity).toFixed(3) : 'N/A'}</td>
                        <td>{item.unit_price ? Number(item.unit_price).toFixed(2) : 'N/A'}</td>
                        <td>
                            {item.quantity && item.unit_price 
                                ? (Number(item.quantity) * Number(item.unit_price)).toFixed(2)
                                : 'N/A'}
                        </td>
                        <td>{item.payment_method}</td>
                        <td className={item.is_old_bill ? 'old-bill-warning' : ''}>
                            {displayBillAmount.toFixed(2)}
                            {item.is_old_bill && <small className="warning-text"> (No VAT)</small>}
                        </td>
                        <td>{displayPaidAmount.toFixed(2)}</td>
                        <td className={displayDueAmount > 0 ? 'due-amount' : 'paid-amount'}>
                            {displayDueAmount.toFixed(2)}
                        </td>
                    </tr>
                );
            })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>No data to display. Select a date range and generate the report.</p>
        </div>
      )}
    </div>
  );
};

export default PurchasingReport;