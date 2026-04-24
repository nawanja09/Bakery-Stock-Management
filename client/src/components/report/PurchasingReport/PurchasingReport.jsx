import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Select from 'react-select';  // 🔥 ADD THIS - Import react-select
import './PurchasingReport.css';
import api from '../../../api';

const PurchasingReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);  // 🔥 CHANGE: from searchTerm to selectedItem
  const [vatFilter, setVatFilter] = useState('all');
  const [itemsList, setItemsList] = useState([]);  // 🔥 ADD THIS - Store all items

  const fetchPurchasingReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}`);
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
      
      // 🔥 ADD THIS - Fetch all items for dropdown
      const itemsResponse = await api.get('/items');
      setItemsList(itemsResponse.data);
      
    } catch (error) {
      console.error('Error fetching purchasing report:', error);
      alert('Failed to fetch purchasing report');
    } finally {
      setLoading(false);
    }
  };

  const getAllItemsFromPurchases = () => {
    const allItems = [];
    reportData.forEach(purchase => {
      const isSupplierVatRegistered = purchase.supplier_vat_registered === 1 || purchase.supplier_vat_registered === true;
      
      let totalBillAmount = 0;
      let subtotal = 0;
      let vatAmount = 0;
      
      if (purchase.total_with_vat && purchase.total_with_vat > 0) {
        totalBillAmount = parseFloat(purchase.total_with_vat);
        subtotal = parseFloat(purchase.subtotal || 0);
        vatAmount = parseFloat(purchase.vat_amount || 0);
      } 
      else if (purchase.bill_amount && purchase.bill_amount > 0) {
        totalBillAmount = parseFloat(purchase.bill_amount);
        subtotal = parseFloat(purchase.bill_amount);
        vatAmount = 0;
      }
      
      const totalPaidAmount = parseFloat(purchase.paid_amount || 0);
      
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price || 0);
          const itemSubtotal = quantity * unitPrice;
          
          let itemVatAmount = 0;
          let itemTotalPrice = itemSubtotal;
          
          if (isSupplierVatRegistered && item.vat_applicable === 1) {
            const vatRate = Number(purchase.vat_rate || 18);
            itemVatAmount = itemSubtotal * (vatRate / 100);
            itemTotalPrice = itemSubtotal + itemVatAmount;
          } else {
            itemVatAmount = 0;
            itemTotalPrice = itemSubtotal;
          }
          
          const paymentRatio = totalBillAmount > 0 ? totalPaidAmount / totalBillAmount : 0;
          const itemPaidAmount = itemTotalPrice * paymentRatio;
          const itemDueAmount = itemTotalPrice - itemPaidAmount;
          
          allItems.push({
            ...item,
            supplier_vat_number: purchase.supplier_vat_number,
            supplier_vat_registered: isSupplierVatRegistered,
            invoice_no: purchase.invoice_no,
            purchase_date: purchase.purchase_date,
            supplier_name: purchase.supplier_name,
            payment_method: purchase.payment_method,
            bill_amount: totalBillAmount,
            paid_amount: totalPaidAmount,
            due_amount: totalBillAmount - totalPaidAmount,
            item_bill_amount: itemTotalPrice,
            item_paid_amount: itemPaidAmount,
            item_due_amount: itemDueAmount,
            item_subtotal: itemSubtotal,
            item_vat_amount: itemVatAmount,
            company_name: purchase.company_name,
            check_number: purchase.check_number,
            vat_rate: purchase.vat_rate || 18,
            is_old_bill: vatAmount === 0 && !isSupplierVatRegistered,
            is_vat_applicable: item.vat_applicable === 1
          });
        });
      } else {
        let finalBillAmount = totalBillAmount;
        let finalVatAmount = 0;
        
        if (!isSupplierVatRegistered) {
          finalVatAmount = 0;
          finalBillAmount = subtotal;
        }
        
        allItems.push({
          supplier_vat_number: purchase.supplier_vat_number,
          supplier_vat_registered: isSupplierVatRegistered,
          invoice_no: purchase.invoice_no,
          purchase_date: purchase.purchase_date,
          supplier_name: purchase.supplier_name,
          item_name: 'No item details',
          quantity: null,
          unit_price: null,
          payment_method: purchase.payment_method,
          bill_amount: finalBillAmount,
          paid_amount: totalPaidAmount,
          due_amount: finalBillAmount - totalPaidAmount,
          item_bill_amount: finalBillAmount,
          item_paid_amount: totalPaidAmount,
          item_due_amount: finalBillAmount - totalPaidAmount,
          item_subtotal: subtotal,
          item_vat_amount: finalVatAmount,
          company_name: purchase.company_name,
          check_number: purchase.check_number,
          is_old_bill: !isSupplierVatRegistered
        });
      }
    });
    return allItems;
  };

  const allItems = getAllItemsFromPurchases();

  // 🔥 CREATE item options for react-select (same as Add Purchase page)
  const itemOptions = useMemo(() => {
    return itemsList.map(item => ({
      value: item.id,
      label: `${item.item_code || ''} - ${item.name} ${item.vat_applicable ? '(VAT)' : ''}`,
      item_code: item.item_code,
      name: item.name,
      vat_applicable: item.vat_applicable
    }));
  }, [itemsList]);

  // 🔥 MODIFY filter logic - filter by selected item
  const filteredItems = allItems.filter(item => {
    // Filter by selected item (item name matches selected item's name)
    const matchesItem = !selectedItem || 
      (item.item_name && item.item_name.toLowerCase().includes(selectedItem.name?.toLowerCase()));
    
    // Filter by VAT status
    const matchesVat = vatFilter === 'all' ||
      (vatFilter === 'yes' ? item.supplier_vat_registered : !item.supplier_vat_registered);
    
    return matchesItem && matchesVat;
  });

  const downloadPDF = () => {
    const doc = new jsPDF();
    let yOffset = 15;

    doc.setFontSize(16);
    doc.text(`Purchasing Report (${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')})`, 15, yOffset);
    yOffset += 10;

    if (companyFilter) {
      const companyName = companyFilter === '1' ? 'JH' : companyFilter === '2' ? 'RR' : 'Delights';
      doc.setFontSize(12);
      doc.text(`Company: ${companyName}`, 15, yOffset);
      yOffset += 10;
    }

    if (selectedItem) {
      doc.setFontSize(12);
      doc.text(`Item: ${selectedItem.name}`, 15, yOffset);
      yOffset += 10;
    }

    const totalPurchases = filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0);
    const totalPaid = filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0);
    const totalDue = totalPurchases - totalPaid;

    doc.setFontSize(12);
    doc.text(`Total Purchases: Rs. ${totalPurchases.toFixed(2)}`, 15, yOffset);
    yOffset += 7;
    doc.text(`Total Paid: Rs. ${totalPaid.toFixed(2)}`, 15, yOffset);
    yOffset += 7;
    doc.text(`Total Due: Rs. ${totalDue.toFixed(2)}`, 15, yOffset);
    yOffset += 10;

    const tableData = filteredItems.map(item => [
      item.invoice_no || 'N/A',
      format(new Date(item.purchase_date), 'MMM dd, yyyy'),
      item.supplier_name || 'N/A',
      item.supplier_vat_number || '—',
      item.company_name || 'N/A',
      item.check_number || 'N/A',
      item.item_name || 'N/A',
      item.quantity ? Number(item.quantity).toFixed(3) : 'N/A',
      item.unit_price ? `Rs. ${Number(item.unit_price).toFixed(2)}` : 'N/A',
      item.payment_method || 'N/A',
      `Rs. ${(item.item_subtotal || 0).toFixed(2)}`,
      `Rs. ${(item.item_vat_amount || 0).toFixed(2)}`,
      `Rs. ${(item.item_bill_amount || 0).toFixed(2)}`,
      `Rs. ${(item.bill_amount || 0).toFixed(2)}`,
      `Rs. ${(item.item_paid_amount || 0).toFixed(2)}`,
      `Rs. ${(item.item_due_amount || 0).toFixed(2)}`
    ]);

    const headers = [
      'Invoice #', 'Date', 'Supplier', 'VAT Number', 'Company', 'Check #',
      'Item Name', 'Quantity', 'Unit Price', 'Payment Method',
      'Subtotal', 'VAT Amount', 'Total Price', 'Bill Amount', 'Paid', 'Due'
    ];

    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: yOffset,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`purchasing-report-${startDate}-to-${endDate}.pdf`);
  };

  const downloadExcel = () => {
    const worksheetData = [];

    worksheetData.push([
      'Invoice #', 'Date', 'Supplier', 'VAT Number', 'Company', 'Check Number',
      'Item Name', 'Quantity', 'Unit Price (Rs.)', 'Payment Method',
      'Subtotal (Rs.)', 'VAT Amount (Rs.)', 'Total Price (Rs.)',
      'Bill Amount (Rs.)', 'Paid Amount (Rs.)', 'Due Amount (Rs.)'
    ]);

    filteredItems.forEach(item => {
      worksheetData.push([
        item.invoice_no,
        format(new Date(item.purchase_date), 'MMM dd, yyyy'),
        item.supplier_name,
        item.supplier_vat_number || '—',
        item.company_name || 'N/A',
        item.check_number || 'N/A',
        item.item_name || 'N/A',
        item.quantity ? Number(item.quantity) : 'N/A',
        item.unit_price ? Number(item.unit_price) : 'N/A',
        item.payment_method,
        (item.item_subtotal || 0).toFixed(2),
        (item.item_vat_amount || 0).toFixed(2),
        (item.item_bill_amount || 0).toFixed(2),
        (item.bill_amount || 0).toFixed(2),
        (item.item_paid_amount || 0).toFixed(2),
        (item.item_due_amount || 0).toFixed(2)
      ]);
    });

    const totalBill = filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0);
    const totalPaid = filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0);
    const totalVat = filteredItems.reduce((sum, item) => sum + (item.item_vat_amount || 0), 0);
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
      { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    XLSX.writeFile(workbook, `purchasing-report-${startDate}-to-${endDate}.xlsx`);
  };

  return (
    <div className="purchasing-report-container">
      <div className="report-header">
        <h2>Purchasing Report</h2>
        {filteredItems.length > 0 && (
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

      {/* Filters Section */}
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
            <option value="yes">Yes (VAT Registered)</option>
            <option value="no">No (Non-VAT Registered)</option>
          </select>
        </div>

        {/* 🔥 REPLACE search input with react-select dropdown */}
        <div className="control-group search-group">
          <label>Search Item</label>
          <Select
            options={itemOptions}
            value={selectedItem}
            onChange={setSelectedItem}
            isSearchable
            isClearable
            placeholder="Search by item name..."
            className="react-select-container"
            classNamePrefix="react-select"
            styles={{
              control: (base) => ({
                ...base,
                minHeight: '42px',
                borderColor: '#e9ecef',
                borderRadius: '10px',
                boxShadow: 'none',
                '&:hover': {
                  borderColor: '#adb5bd'
                }
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

      {/* Report Table */}
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
                <th>Payment Method</th>
                <th>Subtotal (Rs.)</th>
                <th>VAT Amount (Rs.)</th>
                <th>Total Price (Rs.)</th>
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
                  <tr key={`${item.invoice_no}-${index}`} className={!item.supplier_vat_registered ? 'non-vat-row' : ''}>
                    <td data-label="Date">{format(new Date(item.purchase_date), 'MMM dd, yyyy')}</td>
                    <td data-label="Supplier">{item.supplier_name}</td>
                    <td data-label="VAT Number">{item.supplier_vat_number || '—'}</td>
                    <td data-label="Company">{item.company_name || 'N/A'}</td>
                    <td data-label="Check #">{item.check_number || 'N/A'}</td>
                    <td data-label="Item Name">{item.item_name || 'N/A'}</td>
                    <td data-label="Quantity">{item.quantity ? Number(item.quantity).toFixed(3) : 'N/A'}</td>
                    <td data-label="Unit Price">{item.unit_price ? Number(item.unit_price).toFixed(2) : 'N/A'}</td>
                    <td data-label="Payment Method">{item.payment_method}</td>
                    <td data-label="Subtotal" className="text-right">{(item.item_subtotal || 0).toFixed(2)}</td>
                    <td data-label="VAT Amount" className={`text-right ${!item.supplier_vat_registered ? 'vat-zero' : ''}`}>
                      {item.supplier_vat_registered && item.is_vat_applicable ? 
                        (item.item_vat_amount || 0).toFixed(2) : 
                        '0.00'}
                    </td>
                    <td data-label="Total Price" className="text-right">{(item.item_bill_amount || 0).toFixed(2)}</td>
                    <td data-label="Bill Amount" className="text-right">{displayBillAmount.toFixed(2)}</td>
                    <td data-label="Paid" className="text-right paid-amount">{displayPaidAmount.toFixed(2)}</td>
                    <td data-label="Due" className={`text-right ${displayDueAmount > 0 ? 'due-amount' : 'paid-amount'}`}>
                      {displayDueAmount.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="9" className="text-right"><strong>Totals:</strong></td>
                <td className="text-right"><strong>{filteredItems.reduce((sum, item) => sum + (item.item_subtotal || 0), 0).toFixed(2)}</strong></td>
                <td className="text-right"><strong>{filteredItems.reduce((sum, item) => sum + (item.item_vat_amount || 0), 0).toFixed(2)}</strong></td>     
                <td className="text-right"><strong>{filteredItems.reduce((sum, item) => sum + (item.item_bill_amount || 0), 0).toFixed(2)}</strong></td>
                <td className="text-right"><strong>{filteredItems.reduce((sum, item) => sum + (item.bill_amount || 0), 0).toFixed(2)}</strong></td>
                <td className="text-right"><strong>{filteredItems.reduce((sum, item) => sum + (item.item_paid_amount || 0), 0).toFixed(2)}</strong></td>
                <td className="text-right"><strong>{filteredItems.reduce((sum, item) => sum + (item.item_due_amount || 0), 0).toFixed(2)}</strong></td>
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