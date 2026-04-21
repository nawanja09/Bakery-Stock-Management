// PurchasingReport.jsx
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import './PurchasingReport.css';
import api from '../../../api';

const PurchasingReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState(null); // Changed from searchTerm to selectedItem object
  const [vatFilter, setVatFilter] = useState('all');
  const [itemsList, setItemsList] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Fetch items for dropdown (same as AddNewPurchase)
  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const response = await api.get('/items');
      // Format items for react-select
      const formattedItems = response.data.map(item => ({
        value: item.id,
        label: `${item.name}${item.item_code ? ` (${item.item_code})` : ''}`,
        name: item.name,
        item_code: item.item_code,
        unit: item.unit
      }));
      setItemsList(formattedItems);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  // Load items on component mount
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const fetchPurchasingReport = useCallback(async () => {
    setLoading(true);
    try {
      // Build URL with filters
      let url = `/reports/purchasing?startDate=${startDate}&endDate=${endDate}`;
      if (companyFilter) {
        url += `&companyId=${companyFilter}`;
      }
      if (selectedItem && selectedItem.value) {
        url += `&itemId=${selectedItem.value}`;
      }
      
      const response = await api.get(url);
      const purchases = response.data;

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
  }, [startDate, endDate, companyFilter, selectedItem]);

  const getAllItemsFromPurchases = useCallback(() => {
    const allItems = [];
    reportData.forEach(purchase => {
      let totalBillAmount = 0;
      let subtotal = 0;
      let vatAmount = 0;
      
      if (purchase.total_with_vat && purchase.total_with_vat > 0) {
        totalBillAmount = parseFloat(purchase.total_with_vat);
        subtotal = parseFloat(purchase.subtotal || 0);
        vatAmount = parseFloat(purchase.vat_amount || 0);
      } else if (purchase.bill_amount && purchase.bill_amount > 0) {
        totalBillAmount = parseFloat(purchase.bill_amount);
        subtotal = parseFloat(purchase.bill_amount);
        vatAmount = 0;
      } else {
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
          
          let itemVatAmount = 0;
          let itemTotalPrice = itemSubtotal;
          
          if (totalBillAmount > 0 && vatAmount > 0) {
            const vatRatio = vatAmount / totalBillAmount;
            itemVatAmount = itemTotalPrice * vatRatio;
            itemTotalPrice = itemSubtotal + itemVatAmount;
          } else if (totalBillAmount > 0) {
            itemTotalPrice = itemSubtotal;
            itemVatAmount = 0;
          }
          
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
            is_old_bill: vatAmount === 0
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
  }, [reportData]);

  const allItems = useMemo(() => getAllItemsFromPurchases(), [getAllItemsFromPurchases]);

  const filteredItems = useMemo(() => {
    // If an item is selected, filter by that item name
    return allItems.filter(item => {
      const matchesVat = vatFilter === 'all' ||
        (vatFilter === 'yes' ? item.supplier_vat_number : !item.supplier_vat_number);
      
      // If an item is selected, only show that item
      if (selectedItem && selectedItem.value) {
        return item.item_name?.toLowerCase() === selectedItem.name?.toLowerCase() && matchesVat;
      }
      
      return matchesVat;
    });
  }, [allItems, selectedItem, vatFilter]);

  const downloadPDF = useCallback(() => {
    const doc = new jsPDF();
    let yOffset = 15;

    doc.setFontSize(16);
    doc.text(`Purchasing Report (${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')})`, 15, yOffset);
    yOffset += 10;

    if (companyFilter) {
      const companyName = companyFilter === '1' ? 'JH' : companyFilter === '2' ? 'RR' : 'Delights';
      doc.setFontSize(12);
      doc.text(`Company: ${companyName}`, 15, yOffset);
      yOffset += 7;
    }

    if (selectedItem && selectedItem.label) {
      doc.text(`Item: ${selectedItem.label}`, 15, yOffset);
      yOffset += 7;
    }

    const totalPurchases = filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0);
    const totalPaid = filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0);

    doc.text(`Total Purchases: Rs. ${totalPurchases.toFixed(2)}`, 15, yOffset);
    yOffset += 7;
    doc.text(`Total Paid: Rs. ${totalPaid.toFixed(2)}`, 15, yOffset);
    yOffset += 7;
    doc.text(`Total Due: Rs. ${(totalPurchases - totalPaid).toFixed(2)}`, 15, yOffset);
    yOffset += 10;

    const tableData = filteredItems.map(item => [
      item.invoice_no || '—',
      format(new Date(item.purchase_date), 'MMM dd, yyyy'),
      item.supplier_name || '—',
      item.supplier_vat_number || '—',
      item.company_name || 'N/A',
      item.check_number || 'N/A',
      item.item_name || 'N/A',
      item.quantity ? Number(item.quantity).toFixed(3) : 'N/A',
      item.unit_price ? `Rs. ${Number(item.unit_price).toFixed(2)}` : 'N/A',
      item.quantity && item.unit_price ? `Rs. ${(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}` : 'N/A',
      item.payment_method || '—',
      `Rs. ${(item.item_bill_amount || 0).toFixed(2)}`,
      `Rs. ${(item.item_paid_amount || 0).toFixed(2)}`,
      `Rs. ${((item.item_bill_amount || 0) - (item.item_paid_amount || 0)).toFixed(2)}`
    ]);

    const headers = [
      'Invoice #', 'Date', 'Supplier', 'VAT Number', 'Company',
      'Check Number', 'Item Name', 'Quantity', 'Unit Price',
      'Total Price', 'Payment Method', 'Bill Amount', 'Paid Amount', 'Due Amount'
    ];

    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: yOffset,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 10, right: 10 }
    });

    doc.save(`purchasing-report-${startDate}-to-${endDate}.pdf`);
  }, [filteredItems, startDate, endDate, companyFilter, selectedItem]);

  const downloadExcel = useCallback(() => {
    const worksheetData = [];

    worksheetData.push([
      'Invoice #', 'Date', 'Supplier', 'VAT Number', 'Company',
      'Check Number', 'Item Name', 'Quantity', 'Unit Price (Rs.)',
      'Payment Method', 'Subtotal (Rs.)', 'VAT Amount (Rs.)',
      'Total Price (Rs.)', 'Bill Amount (Rs.)', 'Paid Amount (Rs.)', 'Due Amount (Rs.)'
    ]);

    filteredItems.forEach(item => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const subtotal = quantity * unitPrice;
      const vatRate = Number(item.vat_rate || 0);
      const vatAmount = subtotal * (vatRate / 100);
      const totalPrice = subtotal + vatAmount;
      const billAmount = item.item_bill_amount || 0;
      const paidAmount = item.item_paid_amount || 0;
      const dueAmount = billAmount - paidAmount;

      worksheetData.push([
        item.invoice_no || '—',
        format(new Date(item.purchase_date), 'MMM dd, yyyy'),
        item.supplier_name || '—',
        item.supplier_vat_number || '—',
        item.company_name || 'N/A',
        item.check_number || 'N/A',
        item.item_name || 'N/A',
        quantity || 'N/A',
        unitPrice || 'N/A',
        item.payment_method || '—',
        subtotal,
        vatAmount,
        totalPrice,
        billAmount,
        paidAmount,
        dueAmount
      ]);
    });

    const totalBill = filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0);
    const totalPaid = filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0);
    const totalVat = filteredItems.reduce((sum, item) => sum + (item.vat_amount || 0), 0);
    const totalSubtotal = totalBill - totalVat;
    const totalDue = totalBill - totalPaid;

    worksheetData.push([]);
    worksheetData.push([
      'TOTAL', '', '', '', '', '', '', '', '', '',
      totalSubtotal.toFixed(2),
      totalVat.toFixed(2),
      totalBill.toFixed(2),
      totalBill.toFixed(2),
      totalPaid.toFixed(2),
      totalDue.toFixed(2)
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchasing Report');

    worksheet['!cols'] = [
      { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    XLSX.writeFile(workbook, `purchasing-report-${startDate}-to-${endDate}.xlsx`);
  }, [filteredItems, startDate, endDate]);

  const totals = useMemo(() => {
    const totalBill = filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0);
    const totalPaid = filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0);
    return { totalBill, totalPaid, totalDue: totalBill - totalPaid };
  }, [filteredItems]);

  const handleReset = () => {
    setStartDate(format(new Date(), 'yyyy-MM-01'));
    setEndDate(format(new Date(), 'yyyy-MM-dd'));
    setCompanyFilter('');
    setSelectedItem(null);
    setVatFilter('all');
    setReportData([]);
  };

  const isGenerateDisabled = loading || itemsLoading;

  return (
    <div className="purchasing-report-container">
      <div className="report-header">
        <h2>
          <span className="header-icon">📊</span>
          Purchasing Report
        </h2>
        {reportData.length > 0 && (
          <div className="report-actions">
            <button onClick={downloadPDF} className="btn btn-success" title="Export as PDF">
              <span>📄</span> PDF
            </button>
            <button onClick={downloadExcel} className="btn btn-excel" title="Export as Excel">
              <span>📊</span> Excel
            </button>
          </div>
        )}
      </div>

      <div className="controls-section">
        <div className="control-group">
          <label>📅 Start Date</label>
          <input 
            type="date" 
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={endDate}
            className="control-input"
          />
        </div>

        <div className="control-group">
          <label>📅 End Date</label>
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
          <label>🏢 Company</label>
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
          <label>🔖 VAT Status</label>
          <select
            value={vatFilter}
            onChange={(e) => setVatFilter(e.target.value)}
            className="control-input"
          >
            <option value="all">All</option>
            <option value="yes">✅ Has VAT Number</option>
            <option value="no">❌ No VAT Number</option>
          </select>
        </div>

        <div className="control-group search-group">
          <label>🔍 Search Item</label>
          <Select
            options={itemsList}
            value={selectedItem}
            onChange={(option) => setSelectedItem(option)}
            isSearchable={true}
            isClearable={true}
            placeholder="Search and select an item..."
            className="react-select-container"
            classNamePrefix="react-select"
            isLoading={itemsLoading}
            noOptionsMessage={() => itemsLoading ? "Loading items..." : "No items found"}
            // Add these props to prevent double icons
            menuPosition="fixed"
            blurInputOnSelect={true}
            components={{
              DropdownIndicator: null, // This removes the dropdown indicator
              IndicatorSeparator: null  // This removes the separator
            }}
            styles={{
              control: (base, state) => ({
                ...base,
                minHeight: '42px',
                borderColor: state.isFocused ? '#007bff' : '#e9ecef',
                borderRadius: '10px',
                boxShadow: state.isFocused ? '0 0 0 3px rgba(0, 123, 255, 0.1)' : 'none',
                '&:hover': {
                  borderColor: '#adb5bd'
                },
                background: '#fff',
                cursor: 'text'
              }),
              menuPortal: (base) => ({ 
                ...base, 
                zIndex: 9999 
              }),
              option: (base, { isFocused, isSelected }) => ({
                ...base,
                backgroundColor: isSelected ? '#007bff' : isFocused ? '#f8f9fa' : 'white',
                color: isSelected ? 'white' : '#1a1d21',
                cursor: 'pointer',
                '&:active': {
                  backgroundColor: '#007bff',
                  color: 'white'
                }
              }),
              placeholder: (base) => ({
                ...base,
                color: '#6c757d',
                fontSize: '14px'
              }),
              singleValue: (base) => ({
                ...base,
                color: '#1a1d21',
                fontSize: '14px'
              }),
              input: (base) => ({
                ...base,
                margin: 0,
                padding: 0
              }),
              valueContainer: (base) => ({
                ...base,
                padding: '2px 8px'
              }),
              clearIndicator: (base) => ({
                ...base,
                cursor: 'pointer',
                color: '#6c757d',
                '&:hover': {
                  color: '#dc3545'
                }
              })
            }}
            menuPortalTarget={document.body}
          />
        </div>

        <div className="control-group button-group">
          <button 
            onClick={fetchPurchasingReport}
            disabled={isGenerateDisabled}
            className="btn btn-primary"
          >
            {loading ? (
              <>
                <div className="button-spinner"></div>
                Generating...
              </>
            ) : (
              '🚀 Generate Report'
            )}
          </button>
          <button 
            onClick={handleReset}
            className="btn btn-secondary"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {filteredItems.length > 0 && (
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-label">Total Purchases</div>
            <div className="summary-value">Rs. {totals.totalBill.toFixed(2)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Paid</div>
            <div className="summary-value paid">Rs. {totals.totalPaid.toFixed(2)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total Due</div>
            <div className="summary-value due">Rs. {totals.totalDue.toFixed(2)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Items Count</div>
            <div className="summary-value">{filteredItems.length}</div>
          </div>
        </div>
      )}

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
                const displayBillAmount = item.item_bill_amount || item.bill_amount || 0;
                const displayPaidAmount = item.item_paid_amount || item.paid_amount || 0;
                const displayDueAmount = displayBillAmount - displayPaidAmount;
                
                return (
                  <tr key={`${item.invoice_no}-${index}`} className={item.is_old_bill ? 'old-bill-row' : ''}>
                    <td data-label="Date">{format(new Date(item.purchase_date), 'MMM dd, yyyy')}</td>
                    <td data-label="Supplier">{item.supplier_name || '—'}</td>
                    <td data-label="VAT Number" className={item.supplier_vat_number ? 'vat-yes' : 'vat-no'}>
                      {item.supplier_vat_number || '—'}
                    </td>
                    <td data-label="Company">{item.company_name || 'N/A'}</td>
                    <td data-label="Check #">{item.check_number || 'N/A'}</td>
                    <td data-label="Item Name">{item.item_name || 'N/A'}</td>
                    <td data-label="Quantity">{item.quantity ? Number(item.quantity).toFixed(3) : 'N/A'}</td>
                    <td data-label="Unit Price">{item.unit_price ? Number(item.unit_price).toFixed(2) : 'N/A'}</td>
                    <td data-label="Total Price">
                      {item.quantity && item.unit_price 
                        ? (Number(item.quantity) * Number(item.unit_price)).toFixed(2)
                        : 'N/A'}
                    </td>
                    <td data-label="Payment Method">{item.payment_method || '—'}</td>
                    <td data-label="Bill Amount" className={item.is_old_bill ? 'old-bill-amount' : ''}>
                      {displayBillAmount.toFixed(2)}
                      {item.is_old_bill && <span className="warning-badge">No VAT</span>}
                    </td>
                    <td data-label="Paid">{displayPaidAmount.toFixed(2)}</td>
                    <td data-label="Due" className={displayDueAmount > 0 ? 'due-amount' : 'paid-amount'}>
                      {displayDueAmount.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td colSpan="10" className="total-label">Total</td>
                <td className="total-value">{totals.totalBill.toFixed(2)}</td>
                <td className="total-value">{totals.totalPaid.toFixed(2)}</td>
                <td className="total-value due">{totals.totalDue.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : reportData.length === 0 && !loading ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>No data to display. Select a date range and generate the report.</p>
          <button onClick={fetchPurchasingReport} className="btn btn-primary">
            Generate Report
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default PurchasingReport;