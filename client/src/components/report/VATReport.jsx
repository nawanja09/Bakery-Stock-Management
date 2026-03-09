import React, { useState } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import api from '../../api';
import './VATReport.css';

const VATReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('');

  // Format date to MM/DD/YY
  const formatDateMMDDYY = (dateString) => {
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  };

  const fetchVATReport = async () => {
    setLoading(true);
    try {
      // Fetch purchasing data (same source as regular purchasing report)
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}`);
      const purchases = response.data;

      // Fetch detailed purchase data for each purchase to get VAT numbers
      const detailedPurchases = await Promise.all(
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

      setReportData(detailedPurchases);
    } catch (error) {
      console.error('Error fetching VAT report:', error);
      alert('Failed to fetch VAT report');
    } finally {
      setLoading(false);
    }
  };

  // Process data for VAT report
  const processVATData = () => {
    const vatData = [];

    reportData.forEach(purchase => {
      if (purchase.items && purchase.items.length > 0) {
        purchase.items.forEach(item => {
          // Calculate Net Amount (amount excluding VAT)
          const amount = parseFloat(item.quantity) * parseFloat(item.unit_price);
          const vatAmount = amount * 0.18; // 18% VAT

          vatData.push({
            invoiceDate: purchase.purchase_date,
            invoiceNo: purchase.invoice_no,
            supplierTIN: purchase.supplier_vat_number || '—',
            supplierName: purchase.supplier_name,
            netAmount: amount,
            vatAmount: vatAmount
          });
        });
      } else {
        // Fallback for purchases without item details
        const netAmount = parseFloat(purchase.bill_amount || 0) - parseFloat(purchase.vat_amount || 0);
        const vatAmount = parseFloat(purchase.vat_amount || 0);

        vatData.push({
          invoiceDate: purchase.purchase_date,
          invoiceNo: purchase.invoice_no,
          supplierTIN: purchase.supplier_vat_number || '—',
          supplierName: purchase.supplier_name,
          netAmount: netAmount,
          vatAmount: vatAmount
        });
      }
    });

    return vatData;
  };

  const downloadExcel = () => {
    const vatData = processVATData();
    
    if (vatData.length === 0) {
      alert('No data to export. Please generate the report first.');
      return;
    }

    // Prepare data for Excel
    const worksheetData = [];

    // Add headers
    worksheetData.push([
      'Invoice Date',
      'Invoice No',
      'Supplier TIN Number',
      'Name of Supplier',
      'Value of Purchasing',
      'VAT Amount'
    ]);

    // Add data rows
    vatData.forEach(item => {
      worksheetData.push([
        formatDateMMDDYY(item.invoiceDate),
        item.invoiceNo,
        item.supplierTIN,
        item.supplierName,
        item.netAmount.toFixed(2),
        item.vatAmount.toFixed(2)
      ]);
    });

    // Add empty row for spacing
    worksheetData.push([]);

    // Add summary row
    const totalNetAmount = vatData.reduce((sum, item) => sum + item.netAmount, 0);
    const totalVATAmount = vatData.reduce((sum, item) => sum + item.vatAmount, 0);
    
    worksheetData.push([
      'TOTAL',
      '',
      '',
      '',
      totalNetAmount.toFixed(2),
      totalVATAmount.toFixed(2)
    ]);

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Invoice Date
      { wch: 20 }, // Invoice No
      { wch: 20 }, // Supplier TIN
      { wch: 30 }, // Supplier Name
      { wch: 15 }, // Net Amount
      { wch: 15 }  // VAT Amount
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'VAT Report');

    // Generate filename with date range
    const fileName = `vat-report-${startDate}-to-${endDate}.xlsx`;

    // Download file
    XLSX.writeFile(workbook, fileName);
  };

  const vatData = processVATData();

  // Calculate totals
  const totalNetAmount = vatData.reduce((sum, item) => sum + item.netAmount, 0);
  const totalVATAmount = vatData.reduce((sum, item) => sum + item.vatAmount, 0);

  return (
    <div className="vat-report-container">
      <div className="report-header">
        <h2>VAT Purchasing Report</h2>
        {vatData.length > 0 && (
          <button onClick={downloadExcel} className="btn btn-success">
            <span>📊</span> Excel
          </button>
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

        <button 
          onClick={fetchVATReport}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? (
            <>
              <div className="loading-spinner"></div>
              Generating...
            </>
          ) : (
            'Generate VAT Report'
          )}
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          Loading VAT report data...
        </div>
      ) : vatData.length > 0 ? (
        <>
          <div className="table-container">
            <table className="vat-report-table">
              <thead>
                <tr>
                  <th>Invoice Date (MM/DD/YY)</th>
                  <th>Invoice No</th>
                  <th>Supplier TIN Number</th>
                  <th>Name of Supplier</th>
                  <th className="amount-col">Net Amount (Rs.)</th>
                  <th className="amount-col">VAT Amount (18%) (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {vatData.map((item, index) => (
                  <tr key={`${item.invoiceNo}-${index}`}>
                    <td>{formatDateMMDDYY(item.invoiceDate)}</td>
                    <td>{item.invoiceNo}</td>
                    <td>{item.supplierTIN}</td>
                    <td>{item.supplierName}</td>
                    <td className="amount-col">{item.netAmount.toFixed(2)}</td>
                    <td className="amount-col vat-amount">{item.vatAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" className="text-right"><strong>TOTAL</strong></td>
                  <td className="amount-col"><strong>{totalNetAmount.toFixed(2)}</strong></td>
                  <td className="amount-col vat-amount"><strong>{totalVATAmount.toFixed(2)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="report-summary">
            <div className="summary-card">
              <h3>Summary</h3>
              <div className="summary-row">
                <span>Total Net Amount:</span>
                <span>Rs. {totalNetAmount.toFixed(2)}</span>
              </div>
              <div className="summary-row vat">
                <span>Total VAT (18%):</span>
                <span>Rs. {totalVATAmount.toFixed(2)}</span>
              </div>
              <div className="summary-row total">
                <span>Total with VAT:</span>
                <span>Rs. {(totalNetAmount + totalVATAmount).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>No data to display. Select a date range and generate the report.</p>
        </div>
      )}
    </div>
  );
};

export default VATReport;