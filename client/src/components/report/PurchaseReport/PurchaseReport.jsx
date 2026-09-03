import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import './PurchaseReport.css';
import api from '../../../api';
import { formatCurrency } from '../../../utils/formatters';

// Default date range: first day of current month -> today
const defaultFromDate = format(new Date(), 'yyyy-MM-01');
const defaultToDate = format(new Date(), 'yyyy-MM-dd');

const PurchaseReport = () => {
  // Filter state (what the user is currently editing)
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [companyId, setCompanyId] = useState('');
  const [supplierId, setSupplierId] = useState('');

  // Dropdown source data
  const [companies, setCompanies] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  // Report results
  const [invoices, setInvoices] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState('purchase_date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Load Company / Supplier dropdown options once on mount
  useEffect(() => {
    let mounted = true;

    const loadFilterOptions = async () => {
      try {
        const [companiesRes, suppliersRes] = await Promise.all([
          api.get('/purchases/companies'),
          api.get('/purchases/suppliers')
        ]);

        if (!mounted) return;

        setCompanies(companiesRes.data || []);
        setSuppliers(
          (suppliersRes.data || []).slice().sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
          )
        );
      } catch (err) {
        console.error('Error loading filter options:', err);
      }
    };

    loadFilterOptions();
    return () => { mounted = false; };
  }, []);

  const fetchReport = useCallback(async (filters) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.fromDate) params.startDate = filters.fromDate;
      if (filters.toDate) params.endDate = filters.toDate;
      if (filters.companyId) params.companyId = filters.companyId;
      if (filters.supplierId) params.supplierId = filters.supplierId;

      const res = await api.get('/reports/purchase-report', { params });

      setInvoices(res.data?.invoices || []);
      setGrandTotal(res.data?.grandTotal || 0);
    } catch (err) {
      console.error('Error fetching purchase report:', err);
      setError('Failed to load purchase report. Please try again.');
      setInvoices([]);
      setGrandTotal(0);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, []);

  // Load the report once on mount using the default filters
  useEffect(() => {
    fetchReport({ fromDate: defaultFromDate, toDate: defaultToDate, companyId: '', supplierId: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setError('"From Date" cannot be after "To Date".');
      return;
    }
    fetchReport({ fromDate, toDate, companyId, supplierId });
  };

  const handleReset = () => {
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setCompanyId('');
    setSupplierId('');
    setError('');
    fetchReport({ fromDate: defaultFromDate, toDate: defaultToDate, companyId: '', supplierId: '' });
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedInvoices = useMemo(() => {
    const list = [...invoices];
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'purchase_date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (sortField === 'total_amount') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [invoices, sortField, sortDirection]);

  const sortIndicator = (field) => {
    if (sortField !== field) return '';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const activeFilterLabel = useMemo(() => {
    const parts = [];
    if (companyId) {
      const c = companies.find(c => String(c.id) === String(companyId));
      if (c) parts.push(`Company: ${c.name}`);
    }
    if (supplierId) {
      const s = suppliers.find(s => String(s.id) === String(supplierId));
      if (s) parts.push(`Supplier: ${s.name}`);
    }
    return parts.join(' | ');
  }, [companyId, supplierId, companies, suppliers]);

  const handleExportExcel = () => {
    if (sortedInvoices.length === 0) return;

    const worksheetData = [];

    worksheetData.push(['Purchase Report']);
    worksheetData.push([`Period: ${fromDate || 'All'} to ${toDate || 'All'}`]);
    if (activeFilterLabel) {
      worksheetData.push([activeFilterLabel]);
    }
    worksheetData.push([]);

    worksheetData.push(['Invoice Number', 'Invoice Date', 'Company', 'Supplier', 'Total Amount (Rs.)']);

    sortedInvoices.forEach((inv) => {
      worksheetData.push([
        inv.invoice_no || 'N/A',
        inv.purchase_date ? format(new Date(inv.purchase_date), 'yyyy-MM-dd') : 'N/A',
        inv.company_name || 'N/A',
        inv.supplier_name || 'N/A',
        Number(inv.total_amount || 0)
      ]);
    });

    worksheetData.push([]);
    worksheetData.push(['', '', '', 'Grand Total', Number(grandTotal || 0)]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 18 }, // Invoice Number
      { wch: 14 }, // Invoice Date
      { wch: 16 }, // Company
      { wch: 28 }, // Supplier
      { wch: 18 }  // Total Amount
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Report');

    XLSX.writeFile(workbook, `purchase-report-${fromDate || 'all'}-to-${toDate || 'all'}.xlsx`);
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Purchase Report</h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>View all your purchase invoices</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleExportExcel}
            disabled={sortedInvoices.length === 0}
            className="btn btn-success"
            title="Export the currently filtered invoices to Excel"
          >
            📊 Export to Excel
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="filters-section report-filter-bar purchase-report-filter-bar">
        <div className="report-filter-group">
          <label className="report-filter-label">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            max={toDate || undefined}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={fromDate || undefined}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">Company</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="report-filter-select"
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="report-filter-group">
          <label className="report-filter-label">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="report-filter-select"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="report-filter-actions">
          <button onClick={handleApplyFilters} disabled={loading} className="btn btn-primary">
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button onClick={handleReset} disabled={loading} className="btn btn-secondary">
            Reset
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Results */}
      {loading ? (
        <div className="loading-state">Loading purchase invoices...</div>
      ) : sortedInvoices.length > 0 ? (
        <>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-table-shell">
              <table className="report-table purchase-report-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('invoice_no')} className="sortable">
                    Invoice Number{sortIndicator('invoice_no')}
                  </th>
                  <th onClick={() => handleSort('purchase_date')} className="sortable">
                    Invoice Date{sortIndicator('purchase_date')}
                  </th>
                  <th onClick={() => handleSort('company_name')} className="sortable">
                    Company{sortIndicator('company_name')}
                  </th>
                  <th onClick={() => handleSort('supplier_name')} className="sortable">
                    Supplier{sortIndicator('supplier_name')}
                  </th>
                  <th onClick={() => handleSort('total_amount')} className="sortable">
                    Total Amount{sortIndicator('total_amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="report-table-reference">{inv.invoice_no || 'N/A'}</td>
                    <td className="report-table-date">{inv.purchase_date ? format(new Date(inv.purchase_date), 'MMM dd, yyyy') : 'N/A'}</td>
                    <td>{inv.company_name || 'N/A'}</td>
                    <td>{inv.supplier_name || 'N/A'}</td>
                    <td className="report-table-value-numeric">{formatCurrency(inv.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4"><strong>Grand Total</strong></td>
                  <td><strong>{formatCurrency(grandTotal)}</strong></td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🧾</div>
          <p>{hasSearched ? 'No purchase invoices match the selected filters.' : 'Select filters and click Search to view purchase invoices.'}</p>
          {hasSearched && <button onClick={handleReset} className="btn btn-secondary">Reset Filters</button>}
        </div>
      )}
    </div>
  );
};

export default PurchaseReport;
