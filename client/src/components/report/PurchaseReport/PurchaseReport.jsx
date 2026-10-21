import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import './PurchaseReport.css';
import api from '../../../api';
import { formatPurchasingCurrency, toPurchasingExportNumber } from '../../../utils/formatters';

// Default date range: first day of current month -> today
const defaultFromDate = format(new Date(), 'yyyy-MM-01');
const defaultToDate = format(new Date(), 'yyyy-MM-dd');

// Which date the From/To range filters on (applied server-side)
const DATE_TYPE_OPTIONS = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'paid', label: 'Paid' }
];
const defaultDateType = 'invoice';

const DATE_SORT_FIELDS = ['invoice_date', 'delivery_date', 'paid_date'];
const AMOUNT_SORT_FIELDS = ['without_vat_amount', 'vat_amount', 'total_amount'];

const getInvoiceDate = (inv) => inv.invoice_date || inv.purchase_date;

const formatDisplayDate = (value) => (value ? format(new Date(value), 'MMM dd, yyyy') : null);
const formatExportDate = (value) => (value ? format(new Date(value), 'yyyy-MM-dd') : '');

const formatPaymentMethod = (method) => {
  if (!method || method === 'N/A') return 'N/A';
  const val = String(method).trim();
  const upper = val.toUpperCase();
  if (upper === 'CASH') return 'Cash';
  if (upper === 'BANK_TRANSFER' || upper === 'BANK') return 'Bank Transfer';
  if (upper === 'CHEQUE') return 'Cheque';
  if (upper === 'CREDIT') return 'Credit';
  return val.replace(/_/g, ' ');
};

const PurchaseReport = () => {
  // Filter state (what the user is currently editing)
  const [dateType, setDateType] = useState(defaultDateType);
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [companyId, setCompanyId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  // Dropdown source data
  const [companies, setCompanies] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);

  // Report results
  const [invoices, setInvoices] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [vatTotal, setVatTotal] = useState(0);
  const [withoutVatTotal, setWithoutVatTotal] = useState(0);
  // Filters behind the rows currently shown (used by Refresh and the export)
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState('invoice_date');
  const [sortDirection, setSortDirection] = useState('asc');

  // Load Company / Supplier / Payment Method dropdown options once on mount
  useEffect(() => {
    let mounted = true;

    const loadFilterOptions = async () => {
      try {
        const [companiesRes, suppliersRes, paymentMethodsRes] = await Promise.all([
          api.get('/purchases/companies'),
          api.get('/purchases/suppliers'),
          api.get('/payment-methods').catch(() => ({ data: [] }))
        ]);

        if (!mounted) return;

        setCompanies(companiesRes.data || []);
        setSuppliers(
          (suppliersRes.data || []).slice().sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
          )
        );

        const rawMethods = paymentMethodsRes.data || [];
        const methodList = rawMethods.map(m => ({
          id: m.id,
          name: m.name,
          displayName: m.name === 'Bank' ? 'Bank Transfer' : m.name
        }));

        const standardDefaults = [
          { id: 'CASH', name: 'Cash', displayName: 'Cash' },
          { id: 'BANK_TRANSFER', name: 'Bank Transfer', displayName: 'Bank Transfer' },
          { id: 'CHEQUE', name: 'Cheque', displayName: 'Cheque' },
          { id: 'CREDIT', name: 'Credit', displayName: 'Credit' }
        ];

        standardDefaults.forEach(def => {
          const exists = methodList.some(
            m => m.name.toLowerCase() === def.name.toLowerCase() ||
                 (def.id === 'BANK_TRANSFER' && m.name.toLowerCase() === 'bank')
          );
          if (!exists) {
            methodList.push(def);
          }
        });

        setPaymentMethods(methodList);
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
      const params = { dateType: filters.dateType || defaultDateType };
      if (filters.fromDate) params.startDate = filters.fromDate;
      if (filters.toDate) params.endDate = filters.toDate;
      if (filters.companyId) params.companyId = filters.companyId;
      if (filters.supplierId) params.supplierId = filters.supplierId;
      if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;

      const res = await api.get('/reports/purchase-report', { params });

      setInvoices(res.data?.invoices || []);
      setGrandTotal(res.data?.grandTotal || 0);
      setVatTotal(res.data?.vatTotal || 0);
      setWithoutVatTotal(res.data?.withoutVatTotal || 0);
      setAppliedFilters(filters);
    } catch (err) {
      console.error('Error fetching purchase report:', err);
      setError('Failed to load purchase report. Please try again.');
      setInvoices([]);
      setGrandTotal(0);
      setVatTotal(0);
      setWithoutVatTotal(0);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, []);

  // Load the report once on mount using the default filters
  useEffect(() => {
    fetchReport({ dateType: defaultDateType, fromDate: defaultFromDate, toDate: defaultToDate, companyId: '', supplierId: '', paymentMethod: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setError('"From Date" cannot be after "To Date".');
      return;
    }
    fetchReport({ dateType, fromDate, toDate, companyId, supplierId, paymentMethod });
  };

  // Re-run the last search to pick up newly recorded invoices/payments
  const handleRefresh = () => {
    if (appliedFilters) fetchReport(appliedFilters);
  };

  const handleReset = () => {
    setDateType(defaultDateType);
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setCompanyId('');
    setSupplierId('');
    setPaymentMethod('');
    setError('');
    fetchReport({ dateType: defaultDateType, fromDate: defaultFromDate, toDate: defaultToDate, companyId: '', supplierId: '', paymentMethod: '' });
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

      if (sortField === 'invoice_date') {
        valA = new Date(getInvoiceDate(a)).getTime();
        valB = new Date(getInvoiceDate(b)).getTime();
      } else if (DATE_SORT_FIELDS.includes(sortField)) {
        // Missing dates (e.g. not yet paid) always sort to the bottom
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (AMOUNT_SORT_FIELDS.includes(sortField)) {
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
    if (paymentMethod) {
      parts.push(`Payment Method: ${formatPaymentMethod(paymentMethod)}`);
    }
    return parts.join(' | ');
  }, [companyId, supplierId, paymentMethod, companies, suppliers]);

  const handleExportExcel = () => {
    if (sortedInvoices.length === 0) return;

    const worksheetData = [];

    const exportFilters = appliedFilters || { dateType, fromDate, toDate };
    const dateTypeLabel = (DATE_TYPE_OPTIONS.find(o => o.value === exportFilters.dateType) || DATE_TYPE_OPTIONS[0]).label;

    worksheetData.push(['Purchase Report']);
    worksheetData.push([`${dateTypeLabel} Date Period: ${exportFilters.fromDate || 'All'} to ${exportFilters.toDate || 'All'}`]);
    if (activeFilterLabel) {
      worksheetData.push([activeFilterLabel]);
    }
    worksheetData.push([]);

    worksheetData.push([
      'Invoice Number', 'Invoice Date', 'Delivery Date', 'Paid Date', 'Supplier', 'Company', 'Payment Method',
      'Amount Without VAT (Rs.)', 'VAT (Rs.)', 'Total Amount (Rs.)'
    ]);

    sortedInvoices.forEach((inv) => {
      worksheetData.push([
        inv.invoice_no || 'N/A',
        formatExportDate(getInvoiceDate(inv)) || 'N/A',
        formatExportDate(inv.delivery_date) || 'N/A',
        formatExportDate(inv.paid_date) || (inv.payment_status || 'Not Paid'),
        inv.supplier_name || 'N/A',
        inv.company_name || 'N/A',
        formatPaymentMethod(inv.payment_method),
        toPurchasingExportNumber(inv.without_vat_amount || 0),
        toPurchasingExportNumber(inv.vat_amount || 0),
        toPurchasingExportNumber(inv.total_amount || 0)
      ]);
    });

    worksheetData.push([]);
    worksheetData.push([
      '', '', '', '', '', '', 'Grand Total',
      toPurchasingExportNumber(withoutVatTotal || 0),
      toPurchasingExportNumber(vatTotal || 0),
      toPurchasingExportNumber(grandTotal || 0)
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 18 }, // Invoice Number
      { wch: 14 }, // Invoice Date
      { wch: 14 }, // Delivery Date
      { wch: 14 }, // Paid Date
      { wch: 28 }, // Supplier
      { wch: 16 }, // Company
      { wch: 18 }, // Payment Method
      { wch: 22 }, // Amount Without VAT
      { wch: 14 }, // VAT
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
          <label className="report-filter-label">Date Type</label>
          <select
            value={dateType}
            onChange={(e) => setDateType(e.target.value)}
            className="report-filter-select"
            title="Which date the From / To range applies to"
          >
            {DATE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

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

        <div className="report-filter-group">
          <label className="report-filter-label">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="report-filter-select"
          >
            <option value="">All Payment Methods</option>
            {paymentMethods.map((pm) => (
              <option key={pm.id || pm.name} value={pm.name}>{pm.displayName || pm.name}</option>
            ))}
          </select>
        </div>

        <div className="report-filter-actions">
          <button onClick={handleApplyFilters} disabled={loading} className="btn btn-primary">
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading || !appliedFilters}
            className="btn btn-secondary"
            title="Reload the last search with the latest data"
          >
            Refresh
          </button>
          <button onClick={handleReset} disabled={loading} className="btn btn-secondary">
            Reset
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Results */}
      {loading ? (
        <div className="loading-state" role="status" aria-live="polite">Loading purchase invoices...</div>
      ) : sortedInvoices.length > 0 ? (
        <>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="report-table-shell">
              <table className="report-table purchase-report-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('invoice_no')} className="sortable">
                    Invoice No.{sortIndicator('invoice_no')}
                  </th>
                  <th onClick={() => handleSort('invoice_date')} className="sortable">
                    Invoice Date{sortIndicator('invoice_date')}
                  </th>
                  <th onClick={() => handleSort('delivery_date')} className="sortable">
                    Delivery Date{sortIndicator('delivery_date')}
                  </th>
                  <th onClick={() => handleSort('paid_date')} className="sortable">
                    Paid Date{sortIndicator('paid_date')}
                  </th>
                  <th onClick={() => handleSort('supplier_name')} className="sortable">
                    Supplier{sortIndicator('supplier_name')}
                  </th>
                  <th onClick={() => handleSort('without_vat_amount')} className="sortable">
                    Amount Without VAT{sortIndicator('without_vat_amount')}
                  </th>
                  <th onClick={() => handleSort('vat_amount')} className="sortable">
                    VAT{sortIndicator('vat_amount')}
                  </th>
                  <th onClick={() => handleSort('total_amount')} className="sortable">
                    Total Amount{sortIndicator('total_amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="report-table-reference" title={inv.invoice_no || ''}>{inv.invoice_no || 'N/A'}</td>
                    <td className="report-table-date">{formatDisplayDate(getInvoiceDate(inv)) || 'N/A'}</td>
                    <td className="report-table-date">{formatDisplayDate(inv.delivery_date) || 'N/A'}</td>
                    <td className="report-table-date">
                      {formatDisplayDate(inv.paid_date) || <span className="pr-unpaid">{inv.payment_status || 'Not Paid'}</span>}
                    </td>
                    <td title={[inv.company_name, formatPaymentMethod(inv.payment_method)].filter(Boolean).join(' • ')}>
                      {inv.supplier_name || 'N/A'}
                    </td>
                    <td>{formatPurchasingCurrency(inv.without_vat_amount)}</td>
                    <td>{formatPurchasingCurrency(inv.vat_amount)}</td>
                    <td className="report-table-value-numeric">{formatPurchasingCurrency(inv.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="5"><strong>Grand Total ({sortedInvoices.length} invoice{sortedInvoices.length !== 1 ? 's' : ''})</strong></td>
                  <td className="pr-amount"><strong>{formatPurchasingCurrency(withoutVatTotal)}</strong></td>
                  <td className="pr-amount"><strong>{formatPurchasingCurrency(vatTotal)}</strong></td>
                  <td><strong>{formatPurchasingCurrency(grandTotal)}</strong></td>
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
