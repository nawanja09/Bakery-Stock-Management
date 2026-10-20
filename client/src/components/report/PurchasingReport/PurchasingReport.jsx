import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxOpen } from '@fortawesome/free-solid-svg-icons';
import './PurchasingReport.css';
import api from '../../../api';
import { DEFAULT_VAT_RATE } from '../../../utils/vatRate';
import { formatPurchasingNumber, toPurchasingExportNumber } from '../../../utils/formatters';
import { filterItemByName, reportItemSelectStyles } from '../reportItemSelectHelper';

const ALL_ITEMS_OPTION = { value: 'all', label: 'All Items', name: 'All Items', item_code: '', data: null };

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

  // Fetch items on component mount so the Search Item dropdown
  // is populated even before a report is generated.
  useEffect(() => {
    let mounted = true;
    const loadItems = async () => {
      try {
        const res = await api.get('/items');
        if (mounted && res && res.data) setItemsList(res.data);
      } catch (err) {
        console.error('Error loading items for dropdown:', err);
      }
    };

    loadItems();
    return () => { mounted = false; };
  }, []);

  // =============================================
  // 🔥 FIXED: getAllItemsFromPurchases function
  // =============================================
  const getAllItemsFromPurchases = () => {
    const allItems = [];

    reportData.forEach((purchase) => {
      const isSupplierVatRegistered = 
        purchase.supplier_vat_registered === 1 || 
        purchase.supplier_vat_registered === true;

      // Get supplier VAT rate (each purchase keeps its own; this is only the
      // fallback for an old record saved before vat_rate existed).
      const vatRate = parseFloat(purchase.vat_rate) || DEFAULT_VAT_RATE;

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

  const itemOptions = useMemo(() => {
    // Prefer the items list fetched from the /items API (populates dropdown
    // even before generating a report). Fall back to extracting unique
    // items from reportData when itemsList is empty.
    if (itemsList && itemsList.length > 0) {
      return [
        ALL_ITEMS_OPTION,
        ...itemsList.map((it) => {
          const name = it.name || it.item_name || 'Unknown';
          const code = it.item_code;
          const displayLabel = code ? `${code} - ${name}` : name;
          return {
            value: it.id || it.item_id,
            label: displayLabel,
            name: name,
            item_code: code || '',
            vat_applicable: it.vat_applicable,
            data: it
          };
        })
      ];
    }

    const uniqueItems = new Map();
    reportData.forEach((purchase) => {
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach((item) => {
          if (item.item_id && !uniqueItems.has(item.item_id)) {
            const name = item.item_name || item.name || 'Unknown';
            const code = item.item_code;
            const displayLabel = code ? `${code} - ${name}` : name;
            uniqueItems.set(item.item_id, {
              value: item.item_id,
              label: displayLabel,
              name: name,
              item_code: code || '',
              vat_applicable: item.vat_applicable,
              data: item
            });
          }
        });
      }
    });

    return [ALL_ITEMS_OPTION, ...Array.from(uniqueItems.values())];
  }, [itemsList, reportData]);

  // =============================================
  // 🔥 FIXED: Filter logic
  // =============================================
  const allItems = getAllItemsFromPurchases();

  const filteredItems = allItems.filter((item) => {
    // Filter by selected item (using item_id)
    const matchesItem = !selectedItem || 
      selectedItem.value === 'all' || 
      (item.item_id && String(item.item_id) === String(selectedItem.value));

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
    // NOTE: numeric fields are exported as real numbers (rounded to the
    // Purchasing module's 4 decimal places), never as text/strings, so the
    // exported cells stay usable for calculations, sorting and filtering.
    filteredItems.forEach((item) => {
      worksheetData.push([
        item.invoice_no || 'N/A',
        item.purchase_date ? format(new Date(item.purchase_date), 'MMM dd, yyyy') : 'N/A',
        item.supplier_name || 'N/A',
        item.supplier_vat_number || '—',
        item.company_name || 'N/A',
        item.check_number || 'N/A',
        item.item_name || 'N/A',
        item.quantity !== null && item.quantity !== undefined ? toPurchasingExportNumber(item.quantity) : 'N/A',
        item.unit || 'N/A',
        item.unit_price !== null && item.unit_price !== undefined ? toPurchasingExportNumber(item.unit_price) : 'N/A',
        item.payment_method || 'N/A',
        toPurchasingExportNumber(item.item_subtotal || 0),
        toPurchasingExportNumber(item.item_vat_amount || 0),
        toPurchasingExportNumber(item.item_bill_amount || 0),
        toPurchasingExportNumber(item.bill_amount || 0),
        toPurchasingExportNumber(item.item_paid_amount || 0),
        toPurchasingExportNumber(item.item_due_amount || 0)
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
      toPurchasingExportNumber(totalSubtotal),
      toPurchasingExportNumber(totalVat),
      toPurchasingExportNumber(totalBill),
      toPurchasingExportNumber(totalBill),
      toPurchasingExportNumber(totalPaid),
      toPurchasingExportNumber(totalDue)
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
      const companyName = companyFilter === '1' ? 'JH' : companyFilter === '2' ? 'RR' : 'RD';
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
    doc.text(`Total Bill: Rs. ${formatPurchasingNumber(totalBill)}`, 15, yOffset);
    yOffset += 6;
    doc.text(`Total Paid: Rs. ${formatPurchasingNumber(totalPaid)}`, 15, yOffset);
    yOffset += 6;
    doc.text(`Total Due: Rs. ${formatPurchasingNumber(totalDue)}`, 15, yOffset);
    yOffset += 8;

    // Table
    const tableData = filteredItems.map((item) => [
      item.invoice_no || 'N/A',
      item.purchase_date ? format(new Date(item.purchase_date), 'MMM dd, yyyy') : 'N/A',
      item.supplier_name || 'N/A',
      item.item_name || 'N/A',
      item.quantity !== null ? formatPurchasingNumber(item.quantity) : 'N/A',
      formatPurchasingNumber(item.item_subtotal || 0),
      formatPurchasingNumber(item.item_vat_amount || 0),
      formatPurchasingNumber(item.item_bill_amount || 0),
      formatPurchasingNumber(item.item_paid_amount || 0),
      formatPurchasingNumber(item.item_due_amount || 0)
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
    <div className="page-container report-page-purchasing">
      {/* Header */}
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Purchasing Item Detail</h2>
        </div>
        {filteredItems.length > 0 && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={downloadPDF} className="btn btn-secondary">
              📄 PDF
            </button>
            <button onClick={downloadExcel} className="btn btn-success">
              📊 Excel
            </button>
          </div>
        )}
      </header>

      {/* Filters */}
      <div className="filters-section report-filter-bar">
        <div className="report-filter-group">
          <label className="report-filter-label">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">Company</label>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="report-filter-select"
          >
            <option value="">All Companies</option>
            <option value="1">JH</option>
            <option value="2">RR</option>
            <option value="3">RD</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">VAT Status</label>
          <select
            value={vatFilter}
            onChange={(e) => setVatFilter(e.target.value)}
            className="report-filter-select"
          >
            <option value="all">All</option>
            <option value="yes">VAT Registered</option>
            <option value="no">Non-VAT Registered</option>
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faBoxOpen} className="filter-icon" /> Item
          </label>
                
          <Select
            value={selectedItem || ALL_ITEMS_OPTION}
            onChange={(selected) => setSelectedItem(selected || ALL_ITEMS_OPTION)}
            options={itemOptions}
            filterOption={filterItemByName}
            styles={reportItemSelectStyles}
            className="react-select-container"
            classNamePrefix="react-select"
            isSearchable
            isClearable={false}
            placeholder="Select item..."
          />
        </div>

        <div className="report-filter-actions">
          <button
            onClick={fetchPurchasingReport}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-state">Loading report data...</div>
      ) : filteredItems.length > 0 ? (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
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
                  <td className="text-right">{item.quantity !== null ? formatPurchasingNumber(item.quantity) : 'N/A'}</td>
                  <td className="text-right">{item.unit_price !== null ? formatPurchasingNumber(item.unit_price) : 'N/A'}</td>
                  <td>{item.payment_method}</td>
                  <td className="text-right">{formatPurchasingNumber(item.item_subtotal || 0)}</td>
                  <td className="text-right">{formatPurchasingNumber(item.item_vat_amount || 0)}</td>
                  <td className="text-right">{formatPurchasingNumber(item.item_bill_amount || 0)}</td>
                  <td className="text-right">{formatPurchasingNumber(item.bill_amount || 0)}</td>
                  <td className="text-right paid-amount">{formatPurchasingNumber(item.item_paid_amount || 0)}</td>
                  <td className={`text-right ${(item.item_due_amount || 0) > 0 ? 'due-amount' : 'paid-amount'}`}>
                    {formatPurchasingNumber(item.item_due_amount || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="6" className="text-right"><strong>Totals:</strong></td>

                {/* Total Quantity */}
                <td className="text-right">
                  <strong>
                    {formatPurchasingNumber(
                      filteredItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
                    )}
                  </strong>
                </td>

                {/* Unit Price column empty */}
                <td></td>

                {/* Payment Method column empty */}
                <td></td>

                {/* Subtotal */}
                <td className="text-right">
                  <strong>
                    {formatPurchasingNumber(
                      filteredItems.reduce((sum, i) => sum + (i.item_subtotal || 0), 0)
                    )}
                  </strong>
                </td>

                {/* VAT */}
                <td className="text-right">
                  <strong>
                    {formatPurchasingNumber(
                      filteredItems.reduce((sum, i) => sum + (i.item_vat_amount || 0), 0)
                    )}
                  </strong>
                </td>

                {/* Total Price */}
                <td className="text-right">
                  <strong>
                    {formatPurchasingNumber(
                      filteredItems.reduce((sum, i) => sum + (i.item_bill_amount || 0), 0)
                    )}
                  </strong>
                </td>

                {/* Bill Amount */}
                <td className="text-right">
                  <strong>
                    {formatPurchasingNumber(
                      filteredItems.reduce((sum, i) => sum + (i.bill_amount || 0), 0)
                    )}
                  </strong>
                </td>

                {/* Paid */}
                <td className="text-right">
                  <strong>
                    {formatPurchasingNumber(
                      filteredItems.reduce((sum, i) => sum + (i.item_paid_amount || 0), 0)
                    )}
                  </strong>
                </td>

                {/* Due */}
                <td className="text-right">
                  <strong>
                    {formatPurchasingNumber(
                      filteredItems.reduce((sum, i) => sum + (i.item_due_amount || 0), 0)
                    )}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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