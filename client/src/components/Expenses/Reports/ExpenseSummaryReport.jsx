// src/components/Expenses/Reports/ExpenseSummaryReport.jsx
//
// Expense Report Summary: an analytical summary of Analyst -> Expenses, grouped
// by Expense Type -> Sub-Expense Type, with a View drill-down for each
// combination. Read-only; /reports/expense-summary reads the same records as
// Analyst -> Expenses (Expenses-module methods only, never Purchasing).
import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye } from '@fortawesome/free-solid-svg-icons';
import './ExpensesReport.css';
import './ExpenseSummaryReport.css';
import api from '../../../api';
import { formatCurrency } from '../../../utils/formatters';
import useExpenseTypes from '../useExpenseTypes';

const today = new Date();
const defaultFromDate = format(today, 'yyyy-MM-01');
const defaultToDate = format(today, 'yyyy-MM-dd');
const defaultMonth = format(today, 'yyyy-MM');

// Analyst -> Expenses "Expense Method" options, without Purchasing
// (matches the server's EXPENSE_SUMMARY_GROUPS)
const EXPENSE_GROUPS = [
  { value: 'petty_cash', label: 'Petty Cash' },
  { value: 'cash_expenses', label: 'Cash Expenses' },
  { value: 'bank_charges', label: 'Bank Charges' },
  { value: 'hidden_expenses', label: 'Hidden Expenses' },
  { value: 'other_expenses', label: 'Other Expenses' }
];

const DEFAULT_FILTERS = Object.freeze({
  periodMode: 'range',
  fromDate: defaultFromDate,
  toDate: defaultToDate,
  month: defaultMonth,
  paymentMethod: '',
  group: '',
  expenseTypeId: '',
  subExpenseTypeId: ''
});

// Shown for a missing Expense Type / Sub-Expense Type (Analyst shows '-')
const EMPTY_LABEL = '—';

const labelStyle = { fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-secondary)' };
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '4px' };

const resolvePeriod = (filters) => {
  if (filters.periodMode === 'month' && filters.month) {
    const monthStart = parseISO(`${filters.month}-01`);
    return { fromDate: format(startOfMonth(monthStart), 'yyyy-MM-dd'), toDate: format(endOfMonth(monthStart), 'yyyy-MM-dd') };
  }
  return { fromDate: filters.fromDate || undefined, toDate: filters.toDate || undefined };
};

// Same date parameter names as Analyst -> Expenses
const toParams = (filters) => {
  const params = { ...resolvePeriod(filters) };
  if (filters.paymentMethod) params.paymentMethod = filters.paymentMethod;
  if (filters.group) params.group = filters.group;
  if (filters.expenseTypeId) params.expenseTypeId = filters.expenseTypeId;
  if (filters.subExpenseTypeId) params.subExpenseTypeId = filters.subExpenseTypeId;
  return params;
};

const comboLabel = (row) => `${row.expense_type || EMPTY_LABEL} → ${row.sub_expense_type || EMPTY_LABEL}`;

const formatDate = (value) => (value ? format(parseISO(value), 'MMM dd, yyyy') : 'N/A');

// A summary row's date span: one date, or "first – last"
const formatDateSpan = (row) => {
  if (!row.date_from) return 'N/A';
  if (!row.date_to || row.date_to === row.date_from) return formatDate(row.date_from);
  return `${formatDate(row.date_from)} – ${formatDate(row.date_to)}`;
};

// Distinct values of a summary row, as plain text (exports / tooltips)
const joinValues = (values) => (values || []).join(', ');

// Distinct values of a summary row: the first value, "+N more" for the rest
// (full list on hover / in View)
const ValueList = ({ values }) => {
  if (!values?.length) return <span className="esr-muted">{EMPTY_LABEL}</span>;
  if (values.length === 1) return values[0];
  return (
    <span title={joinValues(values)}>
      {values[0]} <span className="esr-muted esr-more">+{values.length - 1} more</span>
    </span>
  );
};

const describePayment = (p) => [
  p.payment_date,
  formatCurrency(p.amount),
  p.cheque_number && `Chq ${p.cheque_number}`,
  p.voucher_number && `Vou ${p.voucher_number}`,
  p.reference_number && `Ref ${p.reference_number}`
].filter(Boolean).join(' • ');

const ExpenseSummaryReport = () => {
  // Filters being edited vs. the filters behind the rows on screen. View always
  // uses the applied ones so its totals equal the summary row it came from.
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(null);

  const [paymentMethods, setPaymentMethods] = useState([]);
  const { expenseTypes, subExpenseTypes, loadingSubTypes, loadSubExpenseTypes } = useExpenseTypes();

  const [summary, setSummary] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // View Details modal
  const [selectedRow, setSelectedRow] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.get('/payment-methods')
      .catch(() => ({ data: [] }))
      .then((methodsRes) => {
        if (!mounted) return;
        // Cash / Bank / Cheque from Payment Methods, plus Petty Cash vouchers
        const names = (methodsRes.data || []).map(m => m.name).filter(Boolean);
        setPaymentMethods([...new Set([...names, 'Petty Cash'])]);
      });
    return () => { mounted = false; };
  }, []);

  const updateFilter = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));

  const handleExpenseTypeChange = (expenseTypeId) => {
    setFilters(prev => ({ ...prev, expenseTypeId, subExpenseTypeId: '' }));
    loadSubExpenseTypes(expenseTypeId);
  };

  const fetchSummary = useCallback(async (nextFilters) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/reports/expense-summary', { params: toParams(nextFilters) });
      setSummary(res.data?.summary || []);
      setTotals(res.data?.totals || null);
      setAppliedFilters(nextFilters);
    } catch (err) {
      console.error('Error fetching expense summary:', err);
      setError(err.response?.data?.error || 'Failed to load expense summary. Please try again.');
      setSummary([]);
      setTotals(null);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, []);

  useEffect(() => {
    fetchSummary(DEFAULT_FILTERS);
  }, [fetchSummary]);

  const handleApplyFilters = () => {
    if (filters.periodMode === 'range' && filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      setError('"From Date" cannot be after "To Date".');
      return;
    }
    fetchSummary(filters);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    loadSubExpenseTypes('');
    setError('');
    fetchSummary(DEFAULT_FILTERS);
  };

  const handleView = async (row) => {
    setSelectedRow(row);
    setDetails(null);
    setDetailsError('');
    setDetailsLoading(true);
    try {
      const res = await api.get('/reports/expense-summary/details', {
        params: {
          ...toParams(appliedFilters || DEFAULT_FILTERS),
          expenseType: row.expense_type || '',
          subExpenseType: row.sub_expense_type || ''
        }
      });
      setDetails(res.data);
    } catch (err) {
      console.error('Error fetching expense summary details:', err);
      setDetailsError(err.response?.data?.error || 'Failed to load transactions.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedRow(null);
    setDetails(null);
    setDetailsError('');
  };

  useEffect(() => {
    if (!selectedRow) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') closeDetails(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRow]);

  // Human-readable description of the applied filters (header + exports)
  const appliedFilterLabel = () => {
    const f = appliedFilters || DEFAULT_FILTERS;
    const { fromDate, toDate } = resolvePeriod(f);
    const parts = [f.periodMode === 'month' && f.month
      ? `Month: ${format(parseISO(`${f.month}-01`), 'MMMM yyyy')}`
      : `Period: ${fromDate || 'All'} to ${toDate || 'All'}`];
    if (f.paymentMethod) parts.push(`Payment Method: ${f.paymentMethod}`);
    if (f.group) parts.push(`Expense Group: ${EXPENSE_GROUPS.find(g => g.value === f.group)?.label || f.group}`);
    if (f.expenseTypeId) parts.push(`Expense Type: ${expenseTypes.find(t => String(t.id) === String(f.expenseTypeId))?.name || f.expenseTypeId}`);
    if (f.subExpenseTypeId) parts.push(`Sub-Expense Type: ${subExpenseTypes.find(t => String(t.id) === String(f.subExpenseTypeId))?.name || f.subExpenseTypeId}`);
    return parts.join(' | ');
  };

  const handleExportSummary = () => {
    if (summary.length === 0) return;
    const rows = [
      ['Expense Report Summary'],
      [appliedFilterLabel()],
      [],
      ['Date', 'Reference No', 'Expenses Method', 'Expenses Type', 'Sub Expenses Type', 'Company', 'Payment Type', 'Description',
        'Transaction Count', 'Amount Without VAT (Rs.)', 'VAT Amount (Rs.)', 'Total Amount With VAT (Rs.)'],
      ...summary.map(s => [
        formatDateSpan(s), joinValues(s.references), joinValues(s.expense_methods), s.expense_type || '', s.sub_expense_type || '',
        joinValues(s.companies), joinValues(s.payment_types), joinValues(s.descriptions),
        s.transaction_count, s.without_vat_amount, s.vat_amount, s.total_amount
      ]),
      [],
      ['TOTAL', '', '', '', '', '', '', '', totals?.transaction_count || 0, totals?.without_vat_amount || 0, totals?.vat_amount || 0, totals?.total_amount || 0]
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 36 },
      { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 26 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expense Summary');
    const { fromDate, toDate } = resolvePeriod(appliedFilters || DEFAULT_FILTERS);
    XLSX.writeFile(workbook, `expense-report-summary-${fromDate || 'all'}-to-${toDate || 'all'}.xlsx`);
  };

  const handleExportDetails = () => {
    if (!details?.transactions?.length) return;
    const rows = [
      [comboLabel(details)],
      [appliedFilterLabel()],
      [],
      ['Date', 'Expense Group', 'Expense Type', 'Sub-Expense Type', 'Description', 'Company', 'Reference Number', 'Payment Method',
        'Payment Type', 'Amount Without VAT (Rs.)', 'VAT (Rs.)', 'Total Amount With VAT (Rs.)', 'Status'],
      ...details.transactions.map(tx => [
        tx.date || '', tx.group_label, tx.expense_type || '', tx.sub_expense_type || '', tx.description || '', tx.company_name || '',
        tx.reference || '', tx.payment_method || '', tx.payment_source || '', tx.without_vat_amount, tx.vat_amount, tx.total_amount, tx.status || ''
      ]),
      [],
      [`Transaction Count: ${details.totals.transaction_count}`, '', '', '', '', '', '', '', 'TOTAL',
        details.totals.without_vat_amount, details.totals.vat_amount, details.totals.total_amount, '']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
      { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 14 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');
    const safeName = `${details.expense_type || 'none'}-${details.sub_expense_type || 'none'}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    XLSX.writeFile(workbook, `expense-summary-${safeName}.xlsx`);
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Expense Report Summary</h2>
        </div>
        <div className="report-filter-actions">
          <button
            onClick={handleExportSummary}
            disabled={summary.length === 0}
            className="btn btn-success"
            title="Export the summary to Excel"
          >
            📊 Export to Excel
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="card filters-section report-filter-bar" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
        <div className="ledger-filter-row esr-filter-row">
          <div style={fieldStyle}>
            <label style={labelStyle}>Period</label>
            <select value={filters.periodMode} onChange={(e) => updateFilter('periodMode', e.target.value)} className="report-filter-select">
              <option value="range">Date Range</option>
              <option value="month">Month</option>
            </select>
          </div>

          {filters.periodMode === 'month' ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>Month</label>
              <input
                type="month"
                value={filters.month}
                onChange={(e) => updateFilter('month', e.target.value)}
                className="report-filter-input"
              />
            </div>
          ) : (
            <>
              <div style={fieldStyle}>
                <label style={labelStyle}>From Date</label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => updateFilter('fromDate', e.target.value)}
                  max={filters.toDate || undefined}
                  className="report-filter-input"
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>To Date</label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => updateFilter('toDate', e.target.value)}
                  min={filters.fromDate || undefined}
                  className="report-filter-input"
                />
              </div>
            </>
          )}

          <div style={fieldStyle}>
            <label style={labelStyle}>Payment Method</label>
            <select value={filters.paymentMethod} onChange={(e) => updateFilter('paymentMethod', e.target.value)} className="report-filter-select">
              <option value="">All Payment Methods</option>
              {paymentMethods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Expense Group</label>
            <select value={filters.group} onChange={(e) => updateFilter('group', e.target.value)} className="report-filter-select">
              <option value="">All Groups</option>
              {EXPENSE_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Expense Type</label>
            <select value={filters.expenseTypeId} onChange={(e) => handleExpenseTypeChange(e.target.value)} className="report-filter-select">
              <option value="">All Expense Types</option>
              {expenseTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Sub-Expense Type</label>
            <select
              value={filters.subExpenseTypeId}
              onChange={(e) => updateFilter('subExpenseTypeId', e.target.value)}
              className="report-filter-select"
              disabled={!filters.expenseTypeId || loadingSubTypes}
              title={!filters.expenseTypeId ? 'Select an Expense Type first' : undefined}
            >
              <option value="">{loadingSubTypes ? 'Loading...' : 'All Sub-Expense Types'}</option>
              {subExpenseTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="report-filter-actions" style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
            <button onClick={handleReset} disabled={loading} className="btn btn-secondary">
              Reset
            </button>
            <button onClick={handleApplyFilters} disabled={loading} className="btn btn-primary">
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="er-error">{error}</div>}

      {/* Headline totals for the applied filters */}
      {totals && !loading && (
        <div className="esr-summary-grid">
          <div className="card esr-summary-card"><span>Transactions</span><strong>{totals.transaction_count}</strong></div>
          <div className="card esr-summary-card"><span>Amount Without VAT</span><strong>{formatCurrency(totals.without_vat_amount)}</strong></div>
          <div className="card esr-summary-card"><span>VAT</span><strong>{formatCurrency(totals.vat_amount)}</strong></div>
          <div className="card esr-summary-card esr-summary-card--primary"><span>Total Amount With VAT</span><strong>{formatCurrency(totals.total_amount)}</strong></div>
        </div>
      )}

      {/* Summary */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}>Loading expense summary...</div>
      ) : summary.length > 0 ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="esr-filter-label">{appliedFilterLabel()}</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table esr-table esr-summary-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference No</th>
                  <th>Expenses Method</th>
                  <th>Expenses Type</th>
                  <th>Sub Expenses Type</th>
                  <th>Company</th>
                  <th>Payment Type</th>
                  <th>Description</th>
                  <th className="esr-num">Transaction Count</th>
                  <th className="esr-num">Amount Without VAT</th>
                  <th className="esr-num">VAT Amount</th>
                  <th className="esr-num">Total Amount With VAT</th>
                  <th className="esr-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={`${row.expense_type}\u0000${row.sub_expense_type || ''}`}>
                    <td className="esr-nowrap">{formatDateSpan(row)}</td>
                    <td className="esr-nowrap"><ValueList values={row.references} /></td>
                    <td className="esr-nowrap"><ValueList values={row.expense_methods} /></td>
                    <td>{row.expense_type || <span className="esr-muted">{EMPTY_LABEL}</span>}</td>
                    <td>{row.sub_expense_type || <span className="esr-muted">{EMPTY_LABEL}</span>}</td>
                    <td><ValueList values={row.companies} /></td>
                    <td><ValueList values={row.payment_types} /></td>
                    <td className="esr-desc"><ValueList values={row.descriptions} /></td>
                    <td className="esr-num">{row.transaction_count}</td>
                    <td className="esr-num">{formatCurrency(row.without_vat_amount)}</td>
                    <td className="esr-num">{formatCurrency(row.vat_amount)}</td>
                    <td className="esr-num"><strong>{formatCurrency(row.total_amount)}</strong></td>
                    <td className="esr-action">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleView(row)}
                        title={`View ${comboLabel(row)} transactions`}
                      >
                        <FontAwesomeIcon icon={faEye} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr>
                    <td colSpan="8"><strong>TOTAL</strong></td>
                    <td className="esr-num"><strong>{totals.transaction_count}</strong></td>
                    <td className="esr-num"><strong>{formatCurrency(totals.without_vat_amount)}</strong></td>
                    <td className="esr-num"><strong>{formatCurrency(totals.vat_amount)}</strong></td>
                    <td className="esr-num"><strong>{formatCurrency(totals.total_amount)}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="esr-footnote">
            Same transactions as Analyst → Expenses (Petty Cash, Cash Expenses, Bank Charges, Hidden Expenses, Other Expenses); Purchasing is not included.
            VAT is recorded on Other Expenses bills only.
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-md)', opacity: 0.5 }}>🧾</div>
          <p>{hasSearched ? 'No expenses match the selected filters.' : 'Select filters and click Search to view the expense summary.'}</p>
          {hasSearched && <button onClick={handleReset} className="btn btn-secondary" style={{ marginTop: 'var(--spacing-md)' }}>Reset Filters</button>}
        </div>
      )}

      {/* View Details */}
      {selectedRow && (
        <div className="modal-overlay" onClick={closeDetails}>
          <div
            className="modal-content esr-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="esr-modal-title"
          >
            <div className="modal-header">
              <div>
                <h2 id="esr-modal-title">
                  {selectedRow.expense_type || EMPTY_LABEL}
                  <span className="esr-modal-arrow"> → </span>
                  {selectedRow.sub_expense_type || EMPTY_LABEL}
                </h2>
                <div className="esr-modal-sub">{appliedFilterLabel()}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                <button
                  className="btn btn-success btn-sm"
                  onClick={handleExportDetails}
                  disabled={!details?.transactions?.length}
                >
                  📊 Export
                </button>
                <button className="modal-close" onClick={closeDetails} aria-label="Close">✕</button>
              </div>
            </div>

            <div className="modal-body">
              {detailsLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}>Loading transactions...</div>
              ) : detailsError ? (
                <div className="er-error">{detailsError}</div>
              ) : details?.transactions?.length ? (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="report-table esr-table esr-detail-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Expense Type</th>
                          <th>Sub-Expense Type</th>
                          <th>Description</th>
                          <th>Company</th>
                          <th>Reference Number</th>
                          <th>Payment Method</th>
                          <th className="esr-num">Amount Without VAT</th>
                          <th className="esr-num">VAT</th>
                          <th className="esr-num">Total Amount With VAT</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.transactions.map((tx) => (
                          <tr key={`${tx.group}-${tx.id}`}>
                            <td className="esr-nowrap">
                              {formatDate(tx.date)}
                              <div className="esr-muted">{tx.group_label}</div>
                            </td>
                            <td>{tx.expense_type || <span className="esr-muted">{EMPTY_LABEL}</span>}</td>
                            <td>{tx.sub_expense_type || <span className="esr-muted">{EMPTY_LABEL}</span>}</td>
                            <td>{tx.description || '-'}</td>
                            <td>{tx.company_name || '-'}</td>
                            <td className="esr-nowrap">{tx.reference || '-'}</td>
                            <td>
                              {tx.payment_method || '-'}
                              {/* Analyst -> Expenses "Payment Type" (payee / bank account) */}
                              {tx.payment_source && tx.payment_source !== tx.payment_method && (
                                <div className="esr-muted">{tx.payment_source}</div>
                              )}
                              {(tx.payments || []).map((p, i) => (
                                <div key={i} className="esr-muted">{describePayment(p)}</div>
                              ))}
                            </td>
                            <td className="esr-num">{formatCurrency(tx.without_vat_amount)}</td>
                            <td className="esr-num">{formatCurrency(tx.vat_amount)}</td>
                            <td className="esr-num"><strong>{formatCurrency(tx.total_amount)}</strong></td>
                            <td className="esr-nowrap">{tx.status || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="7"><strong>TOTAL — {details.totals.transaction_count} transaction{details.totals.transaction_count !== 1 ? 's' : ''}</strong></td>
                          <td className="esr-num"><strong>{formatCurrency(details.totals.without_vat_amount)}</strong></td>
                          <td className="esr-num"><strong>{formatCurrency(details.totals.vat_amount)}</strong></td>
                          <td className="esr-num"><strong>{formatCurrency(details.totals.total_amount)}</strong></td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="esr-summary-grid esr-summary-grid--compact">
                    <div className="card esr-summary-card"><span>Transaction Count</span><strong>{details.totals.transaction_count}</strong></div>
                    <div className="card esr-summary-card"><span>Total Amount Without VAT</span><strong>{formatCurrency(details.totals.without_vat_amount)}</strong></div>
                    <div className="card esr-summary-card"><span>Total VAT</span><strong>{formatCurrency(details.totals.vat_amount)}</strong></div>
                    <div className="card esr-summary-card esr-summary-card--primary"><span>Total Amount With VAT</span><strong>{formatCurrency(details.totals.total_amount)}</strong></div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}>No transactions found for this combination.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseSummaryReport;
