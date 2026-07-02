import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import './PurchasingReport.css';
import api from '../../../api';
import { formatNumber } from '../../../utils/formatters';

const PurchasingReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [vatFilter, setVatFilter] = useState('all');
  const [itemsList, setItemsList] = useState([]);

  const fetchPurchasingReport = async () => {
    setLoading(true);
    try {
      // 1. Fetch purchases
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}`);
      const purchases = response.data;

      // 2. Fetch items for dropdown
      const itemsResponse = await api.get('/items');
      setItemsList(itemsResponse.data);

      // 3. Fetch full details for each purchase with items
      const purchasesWithItems = await Promise.all(
        purchases.map(async (purchase) => {
          try {
            const detailResponse = await api.get(`/purchases/${purchase.id}`);
            return detailResponse.data;
          } catch (error) {
            console.error(`Error fetching details for purchase ${purchase.id}:`, error);
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

  // =============================================
  // 🔥 FIXED: getAllItemsFromPurchases function
  // =============================================
  const getAllItemsFromPurchases = () => {
    const allItems = [];

    reportData.forEach((purchase) => {
      const isSupplierVatRegistered = 
        purchase.supplier_vat_registered === 1 || 
        purchase.supplier_vat_registered === true;

      // Get supplier VAT rate
      const vatRate = parseFloat(purchase.vat_rate) || 18;

      // Get total bill amount
      let totalBillAmount = 0;
      let totalPaidAmount = parseFloat(purchase.paid_amount || 0);

      if (purchase.total_with_vat && purchase.total_with_vat > 0) {
        totalBillAmount = parseFloat(purchase.total_with_vat);
      } else if (purchase.bill_amount && purchase.bill_amount > 0) {
        totalBillAmount = parseFloat(purchase.bill_amount);
      }

      // 🔥 FIXED: Process items correctly
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach((item) => {
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          const itemSubtotal = quantity * unitPrice;

          // 🔥 FIXED: Calculate VAT per item
          let itemVatAmount = 0;
          let itemTotalPrice = itemSubtotal;

          // Check if VAT should be applied
          const isVatApplicable = 
            isSupplierVatRegistered && 
            (item.vat_applicable === 1 || item.vat_applicable === true);

          if (isVatApplicable) {
            itemVatAmount = itemSubtotal * (vatRate / 100);
            itemTotalPrice = itemSubtotal + itemVatAmount;
          }

          // Calculate payment ratio for this item
          const paymentRatio = totalBillAmount > 0 ? totalPaidAmount / totalBillAmount : 0;
          const itemPaidAmount = itemTotalPrice * paymentRatio;
          const itemDueAmount = itemTotalPrice - itemPaidAmount;

          allItems.push({
            // Item details
            item_id: item.item_id,
            item_name: item.item_name || item.name || 'N/A',
            quantity: quantity,
            unit: item.unit || '',
            unit_price: unitPrice,
            vat_applicable: isVatApplicable,
            
            // Financials per item
            item_subtotal: itemSubtotal,
            item_vat_amount: itemVatAmount,
            item_bill_amount: itemTotalPrice,
            item_paid_amount: itemPaidAmount,
            item_due_amount: itemDueAmount,
            
            // Purchase header details
            purchase_id: purchase.id,
            invoice_no: purchase.invoice_no || 'N/A',
            purchase_date: purchase.purchase_date,
            supplier_name: purchase.supplier_name || 'N/A',
            supplier_vat_number: purchase.supplier_vat_number || '—',
            supplier_vat_registered: isSupplierVatRegistered,
            payment_method: purchase.payment_method || 'N/A',
            check_number: purchase.check_number || 'N/A',
            company_name: purchase.company_name || 'N/A',
            vat_rate: vatRate,
            
            // Original bill amounts
            bill_amount: totalBillAmount,
            paid_amount: totalPaidAmount,
            due_amount: totalBillAmount - totalPaidAmount,
            
            // Flags
            is_old_bill: !isSupplierVatRegistered,
            is_vat_applicable: isVatApplicable
          });
        });
      } else {
        // No items found - use purchase level data
        let subtotal = parseFloat(purchase.subtotal || purchase.bill_amount || 0);
        let vatAmount = parseFloat(purchase.vat_amount || 0);
        let totalAmount = totalBillAmount;

        allItems.push({
          item_name: 'No item details',
          quantity: null,
          unit_price: null,
          item_subtotal: subtotal,
          item_vat_amount: vatAmount,
          item_bill_amount: totalAmount,
          item_paid_amount: totalPaidAmount,
          item_due_amount: totalAmount - totalPaidAmount,
          invoice_no: purchase.invoice_no || 'N/A',
          purchase_date: purchase.purchase_date,
          supplier_name: purchase.supplier_name || 'N/A',
          supplier_vat_number: purchase.supplier_vat_number || '—',
          supplier_vat_registered: isSupplierVatRegistered,
          payment_method: purchase.payment_method || 'N/A',
          check_number: purchase.check_number || 'N/A',
          company_name: purchase.company_name || 'N/A',
          bill_amount: totalAmount,
          paid_amount: totalPaidAmount,
          due_amount: totalAmount - totalPaidAmount,
          is_old_bill: !isSupplierVatRegistered,
          is_vat_applicable: false
        });
      }
    });

    return allItems;
  };

  // =============================================
  // 🔥 FIXED: Item options for react-select
  // =============================================
  const itemOptions = useMemo(() => {
    // Get unique items from report data
    const uniqueItems = new Map();
    
    reportData.forEach(purchase => {
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {
          if (item.item_id && !uniqueItems.has(item.item_id)) {
            uniqueItems.set(item.item_id, {
              value: item.item_id,
              label: `${item.item_name || item.name || 'Unknown'} ${item.vat_applicable ? '(VAT)' : ''}`,
              name: item.item_name || item.name || 'Unknown',
              vat_applicable: item.vat_applicable
            });
          }
        });
      }
    });

    return Array.from(uniqueItems.values());
  }, [reportData]);

  // =============================================
  // 🔥 FIXED: Filter logic
  // =============================================
  const allItems = getAllItemsFromPurchases();

  const filteredItems = allItems.filter((item) => {
    // Filter by selected item (using item_id)
    const matchesItem = !selectedItem || 
      (item.item_id && item.item_id === selectedItem.value);

    // Filter by VAT status
    const matchesVat = vatFilter === 'all' ||
      (vatFilter === 'yes' ? item.supplier_vat_registered : !item.supplier_vat_registered);

    return matchesItem && matchesVat;
  });

  // =============================================
  // 🔥 FIXED: Excel Export
  // =============================================
  const downloadExcel = () => {
    if (filteredItems.length === 0) {
      alert('No data to export');
      return;
    }

    const worksheetData = [];

    // Headers
    worksheetData.push([
      'Invoice #', 'Date', 'Supplier', 'VAT Number', 'Company', 'Check #',
      'Item Name', 'Quantity', 'Unit', 'Unit Price (Rs.)', 'Payment Method',
      'Subtotal (Rs.)', 'VAT Amount (Rs.)', 'Total Price (Rs.)',
      'Bill Amount (Rs.)', 'Paid Amount (Rs.)', 'Due Amount (Rs.)'
    ]);

    // Data rows
    filteredItems.forEach((item) => {
      worksheetData.push([
        item.invoice_no || 'N/A',
        item.purchase_date ? format(new Date(item.purchase_date), 'MMM dd, yyyy') : 'N/A',
        item.supplier_name || 'N/A',
        item.supplier_vat_number || '—',
        item.company_name || 'N/A',
        item.check_number || 'N/A',
        item.item_name || 'N/A',
        item.quantity !== null && item.quantity !== undefined ? formatNumber(item.quantity, 3, 3) : 'N/A',
        item.unit || 'N/A',
        item.unit_price !== null && item.unit_price !== undefined ? formatNumber(item.unit_price, 2, 2) : 'N/A',
        item.payment_method || 'N/A',
        formatNumber(item.item_subtotal || 0, 2, 2),
        formatNumber(item.item_vat_amount || 0, 2, 2),
        formatNumber(item.item_bill_amount || 0, 2, 2),
        formatNumber(item.bill_amount || 0, 2, 2),
        formatNumber(item.item_paid_amount || 0, 2, 2),
        formatNumber(item.item_due_amount || 0, 2, 2)
      ]);
    });

    // Add empty row
    worksheetData.push([]);

    // Totals row
    const totalSubtotal = filteredItems.reduce((sum, item) => sum + (item.item_subtotal || 0), 0);
    const totalVat = filteredItems.reduce((sum, item) => sum + (item.item_vat_amount || 0), 0);
    const totalBill = filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0);
    const totalPaid = filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0);
    const totalDue = totalBill - totalPaid;

    worksheetData.push([
      'TOTAL', '', '', '', '', '', '', '', '', '', '',
      formatNumber(totalSubtotal, 2, 2),
      formatNumber(totalVat, 2, 2),
      formatNumber(totalBill, 2, 2),
      formatNumber(totalBill, 2, 2),
      formatNumber(totalPaid, 2, 2),
      formatNumber(totalDue, 2, 2)
    ]);

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Invoice #
      { wch: 14 }, // Date
      { wch: 25 }, // Supplier
      { wch: 15 }, // VAT Number
      { wch: 15 }, // Company
      { wch: 12 }, // Check #
      { wch: 25 }, // Item Name
      { wch: 12 }, // Quantity
      { wch: 10 }, // Unit
      { wch: 14 }, // Unit Price
      { wch: 16 }, // Payment Method
      { wch: 14 }, // Subtotal
      { wch: 14 }, // VAT Amount
      { wch: 14 }, // Total Price
      { wch: 14 }, // Bill Amount
      { wch: 14 }, // Paid Amount
      { wch: 14 }  // Due Amount
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchasing Report');

    XLSX.writeFile(workbook, `purchasing-report-${startDate}-to-${endDate}.xlsx`);
  };

  // =============================================
  // 🔥 FIXED: PDF Export
  // =============================================
  const downloadPDF = () => {
    if (filteredItems.length === 0) {
      alert('No data to export');
      return;
    }

    const doc = new jsPDF();
    let yOffset = 15;

    // Header
    doc.setFontSize(16);
    doc.text(`Purchasing Report`, 15, yOffset);
    yOffset += 8;

    doc.setFontSize(11);
    doc.text(`Period: ${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')}`, 15, yOffset);
    yOffset += 7;

    if (companyFilter) {
      const companyName = companyFilter === '1' ? 'JH' : companyFilter === '2' ? 'RR' : 'Delights';
      doc.text(`Company: ${companyName}`, 15, yOffset);
      yOffset += 7;
    }

    if (selectedItem) {
      doc.text(`Item: ${selectedItem.label}`, 15, yOffset);
      yOffset += 7;
    }

    // Summary
    const totalBill = filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0);
    const totalPaid = filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0);
    const totalDue = totalBill - totalPaid;

    doc.setFontSize(11);
    doc.text(`Total Bill: Rs. ${formatNumber(totalBill, 2, 2)}`, 15, yOffset);
    yOffset += 6;
    doc.text(`Total Paid: Rs. ${formatNumber(totalPaid, 2, 2)}`, 15, yOffset);
    yOffset += 6;
    doc.text(`Total Due: Rs. ${formatNumber(totalDue, 2, 2)}`, 15, yOffset);
    yOffset += 8;

    // Table
    const tableData = filteredItems.map((item) => [
      item.invoice_no || 'N/A',
      item.purchase_date ? format(new Date(item.purchase_date), 'MMM dd, yyyy') : 'N/A',
      item.supplier_name || 'N/A',
      item.item_name || 'N/A',
      item.quantity !== null ? formatNumber(item.quantity, 3, 3) : 'N/A',
      formatNumber(item.item_subtotal || 0, 2, 2),
      formatNumber(item.item_vat_amount || 0, 2, 2),
      formatNumber(item.item_bill_amount || 0, 2, 2),
      formatNumber(item.item_paid_amount || 0, 2, 2),
      formatNumber(item.item_due_amount || 0, 2, 2)
    ]);

    const headers = [
      'Invoice #', 'Date', 'Supplier', 'Item', 'Qty',
      'Subtotal', 'VAT', 'Total', 'Paid', 'Due'
    ];

    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: yOffset,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right' },
        9: { halign: 'right' }
      }
    });

    doc.save(`purchasing-report-${startDate}-to-${endDate}.pdf`);
  };

  // =============================================
  // 🔥 FIXED: Render
  // =============================================
  return (
    <div className="purchasing-report-container">
      {/* Header */}
      <div className="report-header">
        <h2>Purchasing Report</h2>
        {filteredItems.length > 0 && (
          <div className="report-actions">
            <button onClick={downloadPDF} className="btn btn-success">
              📄 PDF
            </button>
            <button onClick={downloadExcel} className="btn btn-excel">
              📊 Excel
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
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

        <div className="control-group">
          <label>VAT Status</label>
          <select
            value={vatFilter}
            onChange={(e) => setVatFilter(e.target.value)}
            className="control-input"
          >
            <option value="all">All</option>
            <option value="yes">VAT Registered</option>
            <option value="no">Non-VAT Registered</option>
          </select>
        </div>

        <div className="control-group search-group">
          <label>Search Item</label>
          <Select
            options={itemOptions}
            value={selectedItem}
            onChange={setSelectedItem}
            isSearchable
            isClearable
            placeholder="Search by item..."
            className="react-select-container"
            classNamePrefix="react-select"
            styles={{
              control: (base) => ({
                ...base,
                minHeight: '42px',
                borderColor: '#e9ecef',
                borderRadius: '10px',
                boxShadow: 'none',
                '&:hover': { borderColor: '#adb5bd' }
              }),
              menuPortal: (base) => ({ ...base, zIndex: 9999 })
            }}
            menuPortalTarget={document.body}
          />
        </div>

        <button
          onClick={fetchPurchasingReport}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-overlay">Loading report data...</div>
      ) : filteredItems.length > 0 ? (
        <div className="table-container">
          <table className="purchasing-report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Supplier</th>
                <th>VAT Number</th>
                <th>Company</th>
                <th>Item Name</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Payment Method</th>
                <th>Subtotal</th>
                <th>VAT</th>
                <th>Total Price</th>
                <th>Bill Amount</th>
                <th>Paid</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr key={`${item.invoice_no}-${index}`}>
                  <td>{format(new Date(item.purchase_date), 'MMM dd, yyyy')}</td>
                  <td>{item.invoice_no}</td>
                  <td>{item.supplier_name}</td>
                  <td>{item.supplier_vat_number || '—'}</td>
                  <td>{item.company_name}</td>
                  <td>{item.item_name}</td>
                  <td className="text-right">{item.quantity !== null ? formatNumber(item.quantity, 3, 3) : 'N/A'}</td>
                  <td className="text-right">{item.unit_price !== null ? formatNumber(item.unit_price, 2, 2) : 'N/A'}</td>
                  <td>{item.payment_method}</td>
                  <td className="text-right">{formatNumber(item.item_subtotal || 0, 2, 2)}</td>
                  <td className="text-right">{formatNumber(item.item_vat_amount || 0, 2, 2)}</td>
                  <td className="text-right">{formatNumber(item.item_bill_amount || 0, 2, 2)}</td>
                  <td className="text-right">{formatNumber(item.bill_amount || 0, 2, 2)}</td>
                  <td className="text-right paid-amount">{formatNumber(item.item_paid_amount || 0, 2, 2)}</td>
                  <td className={`text-right ${(item.item_due_amount || 0) > 0 ? 'due-amount' : 'paid-amount'}`}>
                    {formatNumber(item.item_due_amount || 0, 2, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="9" className="text-right"><strong>Totals:</strong></td>
                <td className="text-right"><strong>{formatNumber(filteredItems.reduce((sum, i) => sum + (i.item_subtotal || 0), 0), 2, 2)}</strong></td>
                <td className="text-right"><strong>{formatNumber(filteredItems.reduce((sum, i) => sum + (i.item_vat_amount || 0), 0), 2, 2)}</strong></td>
                <td className="text-right"><strong>{formatNumber(filteredItems.reduce((sum, i) => sum + (i.item_bill_amount || 0), 0), 2, 2)}</strong></td>
                <td className="text-right"><strong>{formatNumber(filteredItems.reduce((sum, i) => sum + (i.bill_amount || 0), 0), 2, 2)}</strong></td>
                <td className="text-right"><strong>{formatNumber(filteredItems.reduce((sum, i) => sum + (i.item_paid_amount || 0), 0), 2, 2)}</strong></td>
                <td className="text-right"><strong>{formatNumber(filteredItems.reduce((sum, i) => sum + (i.item_due_amount || 0), 0), 2, 2)}</strong></td>
              </tr>
            </tfoot>
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