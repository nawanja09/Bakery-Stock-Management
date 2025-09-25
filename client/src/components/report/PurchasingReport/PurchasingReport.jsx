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

  const fetchPurchasingReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/purchasing?startDate=${startDate}&endDate=${endDate}&companyId=${companyFilter}`);
      setReportData(response.data);
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
    
    const tableData = reportData.map(purchase => [
      purchase.invoice_no,
      format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
      purchase.supplier_name,
      purchase.payment_method,
      `Rs. ${parseFloat(purchase.bill_amount).toFixed(2)}`,
      `Rs. ${parseFloat(purchase.paid_amount).toFixed(2)}`,
      `Rs. ${(parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount)).toFixed(2)}`
    ]);
    
    const headers = [
      'Invoice #',
      'Date',
      'Supplier',
      'Payment Method',
      'Bill Amount',
      'Paid Amount',
      'Due Amount'
    ];
    
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: companyFilter ? 55 : 45,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 128, 185] }
    });
    
    doc.save(`purchasing-report-${startDate}-to-${endDate}.pdf`);
  };

  const downloadExcel = () => {
    const worksheetData = reportData.map(purchase => ({
      'Invoice No': purchase.invoice_no,
      'Date': format(new Date(purchase.purchase_date), 'MMM dd, yyyy'),
      'Supplier': purchase.supplier_name,
      'Payment Method': purchase.payment_method,
      'Bill Amount (Rs.)': parseFloat(purchase.bill_amount),
      'Paid Amount (Rs.)': parseFloat(purchase.paid_amount),
      'Due Amount (Rs.)': (parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount))
    }));

    const totalPurchases = reportData.reduce((sum, purchase) => sum + parseFloat(purchase.bill_amount), 0);
    const totalPaid = reportData.reduce((sum, purchase) => sum + parseFloat(purchase.paid_amount), 0);
    const totalDue = totalPurchases - totalPaid;

    worksheetData.push({});
    worksheetData.push({
      'Invoice No': 'TOTAL',
      'Bill Amount (Rs.)': totalPurchases,
      'Paid Amount (Rs.)': totalPaid,
      'Due Amount (Rs.)': totalDue
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchasing Report');

    const colWidths = [
      { wch: 15 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 }
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `purchasing-report-${startDate}-to-${endDate}.xlsx`);
  };

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
      ) : reportData.length > 0 ? (
        <div className="table-container">
          <table className="purchasing-report-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Payment Method</th>
                <th>Bill Amount (Rs.)</th>
                <th>Paid (Rs.)</th>
                <th>Due (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{purchase.invoice_no}</td>
                  <td>{format(new Date(purchase.purchase_date), 'MMM dd, yyyy')}</td>
                  <td>{purchase.supplier_name}</td>
                  <td>{purchase.payment_method}</td>
                  <td>{parseFloat(purchase.bill_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{parseFloat(purchase.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{(parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              <tr className="summary-row">
                <td colSpan="4"><strong>Total</strong></td>
                <td>
                  <strong>
                    {reportData.reduce((sum, purchase) => sum + parseFloat(purchase.bill_amount), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </td>
                <td>
                  <strong>
                    {reportData.reduce((sum, purchase) => sum + parseFloat(purchase.paid_amount), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </td>
                <td>
                  <strong>
                    {reportData.reduce((sum, purchase) => 
                      sum + (parseFloat(purchase.bill_amount) - parseFloat(purchase.paid_amount)), 0)
                      .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </td>
              </tr>
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