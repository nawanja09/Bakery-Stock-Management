import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import api from '../../api';
import { formatNumber, toExportNumber } from '../../utils/formatters';
import './DiscountedPurchasesReport.css';

const DiscountedPurchasesReport = () => {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [companyFilter, setCompanyFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.get('/suppliers')
      .then((res) => { if (mounted) setSuppliers(res.data || []); })
      .catch((error) => console.error('Error loading suppliers:', error));
    return () => { mounted = false; };
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (companyFilter) params.append('companyId', companyFilter);
      if (supplierFilter) params.append('supplierId', supplierFilter);

      const response = await api.get(`/reports/discounted-purchases?${params.toString()}`);
      setReportData(response.data.data || []);
      setHasGenerated(true);
    } catch (error) {
      console.error('Error fetching Discounted Purchases report:', error);
      alert('Failed to fetch Discounted Purchases report');
    } finally {
      setLoading(false);
    }
  };

  const totalPaymentAmount = reportData.reduce((sum, row) => sum + (Number(row.payment_amount) || 0), 0);
  const totalDiscountAmount = reportData.reduce((sum, row) => sum + (Number(row.discount_amount) || 0), 0);

  const downloadExcel = () => {
    if (reportData.length === 0) {
      alert('No data to export. Please generate the report first.');
      return;
    }

    const worksheetData = [[
      'Invoice Date', 'Invoice No', 'Supplier', 'Company', 'Payment Date', 'Payment Method',
      'Bill/Invoice Total (Rs.)', 'Payment Amount (Rs.)', 'Discount Amount (Rs.)', 'Balance Due (Rs.)'
    ]];

    reportData.forEach((row) => {
      worksheetData.push([
        row.invoice_date ? format(new Date(row.invoice_date), 'dd/MM/yyyy') : 'N/A',
        row.invoice_no || 'N/A',
        row.supplier_name || 'N/A',
        row.company_name || 'N/A',
        row.payment_date ? format(new Date(row.payment_date), 'dd/MM/yyyy') : 'N/A',
        row.payment_method || 'N/A',
        toExportNumber(row.bill_amount, 2),
        toExportNumber(row.payment_amount, 2),
        toExportNumber(row.discount_amount, 2),
        toExportNumber(row.balance_due, 2)
      ]);
    });

    worksheetData.push([]);
    worksheetData.push(['TOTAL', '', '', '', '', '', '', toExportNumber(totalPaymentAmount, 2), toExportNumber(totalDiscountAmount, 2), '']);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
      { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Discounted Purchases');
    XLSX.writeFile(workbook, `discounted-purchases-report-${startDate}-to-${endDate}.xlsx`);
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Discounted Purchases Report</h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm, 14px)' }}>
            View all purchase invoices that had a Discount Amount applied when their payment was recorded.
          </p>
        </div>
        {reportData.length > 0 && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={downloadExcel} className="btn btn-success">
              <span>📊</span> Export to Excel
            </button>
          </div>
        )}
      </header>

      <div className="filters-section card" style={{ display: 'flex', gap: 'var(--spacing-lg)', padding: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
          <label className="report-filter-label">Supplier</label>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="report-filter-select"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </div>

        <div className="report-filter-actions">
          <button
            onClick={fetchReport}
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
      </div>

      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">
          <div className="loading-spinner"></div>
          Loading Discounted Purchases report data...
        </div>
      ) : reportData.length > 0 ? (
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th className="text-left">Invoice Date</th>
                  <th className="text-left">Invoice No</th>
                  <th className="text-left">Supplier</th>
                  <th className="text-left">Company</th>
                  <th className="text-left">Payment Date</th>
                  <th className="text-left">Payment Method</th>
                  <th className="text-right">Bill/Invoice Total (Rs.)</th>
                  <th className="text-right">Payment Amount (Rs.)</th>
                  <th className="text-right">Discount Amount (Rs.)</th>
                  <th className="text-right">Balance Due (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, index) => (
                  <tr key={`${row.purchase_id}-${index}`}>
                    <td className="text-left">{row.invoice_date ? format(new Date(row.invoice_date), 'dd/MM/yyyy') : 'N/A'}</td>
                    <td className="text-left">{row.invoice_no || 'N/A'}</td>
                    <td className="text-left">{row.supplier_name || 'N/A'}</td>
                    <td className="text-left">{row.company_name || 'N/A'}</td>
                    <td className="text-left">{row.payment_date ? format(new Date(row.payment_date), 'dd/MM/yyyy') : 'N/A'}</td>
                    <td className="text-left">{row.payment_method || 'N/A'}</td>
                    <td className="report-table-value-numeric">{formatNumber(row.bill_amount, 2, 2)}</td>
                    <td className="report-table-value-numeric">{formatNumber(row.payment_amount, 2, 2)}</td>
                    <td className="report-table-value-numeric">{formatNumber(row.discount_amount, 2, 2)}</td>
                    <td className="report-table-value-numeric">{formatNumber(row.balance_due, 2, 2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="6" className="text-right"><strong>TOTAL</strong></td>
                  <td className="report-table-value-numeric"></td>
                  <td className="report-table-value-numeric"><strong>{formatNumber(totalPaymentAmount, 2, 2)}</strong></td>
                  <td className="report-table-value-numeric"><strong>{formatNumber(totalDiscountAmount, 2, 2)}</strong></td>
                  <td className="report-table-value-numeric"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-md)', opacity: 0.5 }}>📊</div>
          <h3>No Data Available</h3>
          <p>{hasGenerated ? 'No discounted purchases match these filters.' : 'Select a date range and generate the report.'}</p>
        </div>
      )}
    </div>
  );
};

export default DiscountedPurchasesReport;
