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
  const [searchTerm, setSearchTerm] = useState(''); // <-- Added

  const fetchPurchasingReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}`);
      const purchases = response.data;

      const purchasesWithItems = await Promise.all(
        purchases.map(async (purchase) => {
          try {
            const purchaseDetailResponse = await api.get(`/purchases/${purchase.id}`);
            return {
              ...purchase,
              items: purchaseDetailResponse.data.items || []
            };
          } catch (error) {
            console.error(`Error fetching details for purchase ${purchase.id}:`, error);
            return {
              ...purchase,
              items: []
            };
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
          purchase.company_name || 'N/A',
          purchase.check_number || 'N/A',
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

    worksheetData.push([
      'Invoice #',
      'Date',
      'Supplier',
      'Company',
      'Check Number',
      'Item Name',
      'Quantity',
      'Unit Price (Rs.)',
      'Total Price (Rs.)',
      'Payment Method',
      'Bill Amount (Rs.)',
      'Paid Amount (Rs.)',
      'Due Amount (Rs.)'
    ]);

    reportData.forEach(purchase => {
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {
          worksheetData.push([
            purchase.invoice_no,
            format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
            purchase.supplier_name,
            purchase.company_name || 'N/A',
            purchase.check_number || 'N/A',
            item.item_name || 'N/A',
            Number(item.quantity),
            Number(item.unit_price),
            Number(item.quantity) * Number(item.unit_price),
            purchase.payment_method,
            parseFloat(purchase.bill_amount),
            parseFloat(purchase.paid_amount),
            (parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount))
          ]);
        });
      } else {
        worksheetData.push([
          purchase.invoice_no,
          format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
          purchase.supplier_name,
          purchase.company_name || 'N/A',
          purchase.check_number || 'N/A',
          'N/A',
          null,
          null,
          null,
          purchase.payment_method,
          parseFloat(purchase.bill_amount),
          parseFloat(purchase.paid_amount),
          (parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount))
        ]);
      }
    });

    const totalPurchases = reportData.reduce((sum, purchase) => sum + parseFloat(purchase.bill_amount), 0);
    const totalPaid = reportData.reduce((sum, purchase) => sum + parseFloat(purchase.paid_amount), 0);
    const totalDue = totalPurchases - totalPaid;

    worksheetData.push([]);
    worksheetData.push([
      'TOTAL', '', '', '', '', '', '', '',
      totalPurchases,
      totalPaid,
      totalDue
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchasing Report');

    worksheet['!cols'] = [
      { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 15 },
      { wch: 15 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }
    ];

    XLSX.writeFile(workbook, `purchasing-report-${startDate}-to-${endDate}.xlsx`);
  };

  const getAllItemsFromPurchases = () => {
    const allItems = [];
    reportData.forEach(purchase => {
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {
          allItems.push({
            ...item,
            invoice_no: purchase.invoice_no,
            purchase_date: purchase.purchase_date,
            supplier_name: purchase.supplier_name,
            payment_method: purchase.payment_method,
            bill_amount: purchase.bill_amount,
            paid_amount: purchase.paid_amount,
            company_name: purchase.company_name,
            check_number: purchase.check_number
          });
        });
      } else {
        allItems.push({
          invoice_no: purchase.invoice_no,
          purchase_date: purchase.purchase_date,
          supplier_name: purchase.supplier_name,
          item_name: 'No item details',
          quantity: null,
          unit_price: null,
          payment_method: purchase.payment_method,
          bill_amount: purchase.bill_amount,
          paid_amount: purchase.paid_amount,
          company_name: purchase.company_name,
          check_number: purchase.check_number
        });
      }
    });
    return allItems;
  };

  const allItems = getAllItemsFromPurchases();

  // 🔍 Apply search filter here
  const filteredItems = allItems.filter(item =>
    item.item_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              {filteredItems.map((item, index) => (
                <tr key={`${item.invoice_no}-${index}`}>
                  <td>{format(new Date(item.purchase_date), 'MMM dd, yyyy')}</td>
                  <td>{item.supplier_name}</td>
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
                  <td>{parseFloat(item.bill_amount).toFixed(2)}</td>
                  <td>{parseFloat(item.paid_amount).toFixed(2)}</td>
                  <td>{(parseFloat(item.bill_amount) - parseFloat(item.paid_amount)).toFixed(2)}</td>
                </tr>
              ))}
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
