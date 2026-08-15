// src/components/Expenses/Reports/ExpensesReport.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import './ExpensesReport.css';
import api from '../../../api';
import { formatCurrency } from '../../../utils/formatters';

// Default date range: first day of current month -> today
const defaultFromDate = format(new Date(), 'yyyy-MM-01');
const defaultToDate = format(new Date(), 'yyyy-MM-dd');

const ExpensesReport = () => {
  // Filter state (what the user is currently editing)
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [companyId, setCompanyId] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const [type, setType] = useState('all');

  // Dropdown source data
  const [companies, setCompanies] = useState([]);
  const [payees, setPayees] = useState([]);

  // Report results
  const [expenses, setExpenses] = useState([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [pettyCashTotal, setPettyCashTotal] = useState(0);
  const [otherTotal, setOtherTotal] = useState(0);
  const [bankChargesTotal, setBankChargesTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Load Company / Payee dropdown options once on mount
  useEffect(() => {
    let mounted = true;

    const loadFilterOptions = async () => {
      try {
        const [companiesRes, payeesRes] = await Promise.all([
          api.get('/purchases/companies'),
          api.get('/payees')
        ]);

        if (!mounted) return;

        setCompanies(companiesRes.data || []);
        setPayees(
          (payeesRes.data || []).slice().sort((a, b) =>
            (a.payee_name || '').localeCompare(b.payee_name || '')
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
      if (filters.payeeId) params.payeeId = filters.payeeId;
      if (filters.type) params.type = filters.type;

      const res = await api.get('/reports/expenses-report', { params });

      setExpenses(res.data?.expenses || []);
      setGrandTotal(res.data?.grandTotal || 0);
      setPettyCashTotal(res.data?.pettyCashTotal || 0);
      setOtherTotal(res.data?.otherTotal || 0);
      setBankChargesTotal(res.data?.bankChargesTotal || 0);
    } catch (err) {
      console.error('Error fetching expenses report:', err);
      setError('Failed to load expenses report. Please try again.');
      setExpenses([]);
      setGrandTotal(0);
      setPettyCashTotal(0);
      setOtherTotal(0);
      setBankChargesTotal(0);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, []);

  // Load the report once on mount using the default filters
  useEffect(() => {
    fetchReport({ fromDate: defaultFromDate, toDate: defaultToDate, companyId: '', payeeId: '', type: 'all' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyFilters = () => {
    if (fromDate && toDate && fromDate > toDate) {
      setError('"From Date" cannot be after "To Date".');
      return;
    }
    fetchReport({ fromDate, toDate, companyId, payeeId, type });
  };

  const handleReset = () => {
    setFromDate(defaultFromDate);
    setToDate(defaultToDate);
    setCompanyId('');
    setPayeeId('');
    setType('all');
    setError('');
    fetchReport({ fromDate: defaultFromDate, toDate: defaultToDate, companyId: '', payeeId: '', type: 'all' });
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedExpenses = useMemo(() => {
    const list = [...expenses];
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (sortField === 'amount') {
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
  }, [expenses, sortField, sortDirection]);

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
    if (payeeId) {
      const p = payees.find(p => String(p.id) === String(payeeId));
      if (p) parts.push(`Payee: ${p.payee_name}`);
    }
    if (type && type !== 'all') {
      const typeLabels = { petty_cash: 'Petty Cash', other: 'Other', bank_charges: 'Bank Charges' };
      parts.push(`Type: ${typeLabels[type]}`);
    }
    return parts.join(' | ');
  }, [companyId, payeeId, type, companies, payees]);

  const handleExportExcel = () => {
    if (sortedExpenses.length === 0) return;

    const worksheetData = [];

    worksheetData.push(['Expenses Report']);
    worksheetData.push([`Period: ${fromDate || 'All'} to ${toDate || 'All'}`]);
    if (activeFilterLabel) {
      worksheetData.push([activeFilterLabel]);
    }
    worksheetData.push([]);

    worksheetData.push(['Date', 'Type', 'Payee', 'Expense Type', 'Reference', 'Company', 'Status', 'Amount (Rs.)']);

    sortedExpenses.forEach((exp) => {
      worksheetData.push([
        exp.date ? format(new Date(exp.date), 'yyyy-MM-dd') : 'N/A',
        exp.type,
        exp.payee_name || 'N/A',
        exp.expense_type || 'N/A',
        exp.reference || 'N/A',
        exp.company_name || 'N/A',
        exp.status || 'N/A',
        Number(exp.amount || 0)
      ]);
    });

    worksheetData.push([]);
    worksheetData.push(['', '', '', '', '', '', 'Grand Total', Number(grandTotal || 0)]);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 14 }, // Date
      { wch: 12 }, // Type
      { wch: 24 }, // Payee
      { wch: 18 }, // Expense Type
      { wch: 18 }, // Reference
      { wch: 14 }, // Company
      { wch: 14 }, // Status
      { wch: 16 }  // Amount
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses Report');

    XLSX.writeFile(workbook, `expenses-report-${fromDate || 'all'}-to-${toDate || 'all'}.xlsx`);
  };

  return (
    <div className="er-container">
      <div className="er-header">
        <h2>Expenses Report</h2>
        <div className="er-actions">
          <button
            onClick={handleExportExcel}
            disabled={sortedExpenses.length === 0}
            className="er-btn er-btn-excel"
            title="Export the currently filtered expenses to Excel"
          >
            📊 Export to Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="er-filters">
        <div className="er-field">
          <label>From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            max={toDate || undefined}
            className="er-input"
          />
        </div>

        <div className="er-field">
          <label>To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={fromDate || undefined}
            className="er-input"
          />
        </div>

        <div className="er-field">
          <label>Company</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="er-input"
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="er-field">
          <label>Payee</label>
          <select
            value={payeeId}
            onChange={(e) => setPayeeId(e.target.value)}
            className="er-input"
          >
            <option value="">All Payees</option>
            {payees.map((p) => (
              <option key={p.id} value={p.id}>{p.payee_name}</option>
            ))}
          </select>
        </div>

        <div className="er-field">
          <label>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="er-input"
          >
            <option value="all">All</option>
            <option value="petty_cash">Petty Cash</option>
            <option value="other">Other</option>
            <option value="bank_charges">Bank Charges</option>
          </select>
        </div>

        <div className="er-field-actions">
          <button onClick={handleApplyFilters} disabled={loading} className="er-btn er-btn-primary">
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button onClick={handleReset} disabled={loading} className="er-btn er-btn-secondary">
            Reset
          </button>
        </div>
      </div>

      {error && <div className="er-error">{error}</div>}

      {/* Results */}
      {loading ? (
        <div className="er-loading">Loading expenses...</div>
      ) : sortedExpenses.length > 0 ? (
        <>
          <div className="er-table-container">
            <table className="er-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('date')} className="er-sortable">
                    Date{sortIndicator('date')}
                  </th>
                  <th onClick={() => handleSort('type')} className="er-sortable">
                    Type{sortIndicator('type')}
                  </th>
                  <th onClick={() => handleSort('payee_name')} className="er-sortable">
                    Payee{sortIndicator('payee_name')}
                  </th>
                  <th onClick={() => handleSort('expense_type')} className="er-sortable">
                    Expense Type{sortIndicator('expense_type')}
                  </th>
                  <th onClick={() => handleSort('reference')} className="er-sortable">
                    Reference{sortIndicator('reference')}
                  </th>
                  <th onClick={() => handleSort('company_name')} className="er-sortable">
                    Company{sortIndicator('company_name')}
                  </th>
                  <th onClick={() => handleSort('status')} className="er-sortable">
                    Status{sortIndicator('status')}
                  </th>
                  <th onClick={() => handleSort('amount')} className="er-sortable">
                    Amount{sortIndicator('amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((exp) => (
                  <tr key={`${exp.type}-${exp.id}`}>
                    <td>{exp.date ? format(new Date(exp.date), 'MMM dd, yyyy') : 'N/A'}</td>
                    <td>
                      <span className={`er-type-badge ${exp.type === 'Petty Cash' ? 'er-type-petty' : exp.type === 'Bank Charges' ? 'er-type-bank' : 'er-type-other'}`}>
                        {exp.type}
                      </span>
                    </td>
                    <td>{exp.payee_name}</td>
                    <td>{exp.expense_type}</td>
                    <td>{exp.reference || '-'}</td>
                    <td>{exp.company_name || '-'}</td>
                    <td>{exp.status || '-'}</td>
                    <td>{formatCurrency(exp.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="7"><strong>Grand Total</strong></td>
                  <td><strong>{formatCurrency(grandTotal)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="er-summary-bar">
            <span>{sortedExpenses.length} record{sortedExpenses.length !== 1 ? 's' : ''}</span>
            <span>Petty Cash: <strong>{formatCurrency(pettyCashTotal)}</strong></span>
            <span>Other: <strong>{formatCurrency(otherTotal)}</strong></span>
            <span>Bank Charges: <strong>{formatCurrency(bankChargesTotal)}</strong></span>
            <span>Grand Total: <strong>{formatCurrency(grandTotal)}</strong></span>
          </div>
        </>
      ) : (
        <div className="er-empty-state">
          <div className="er-empty-icon">🧾</div>
          <p>{hasSearched ? 'No expenses match the selected filters.' : 'Select filters and click Search to view expenses.'}</p>
          {hasSearched && <button onClick={handleReset} className="er-btn er-btn-secondary">Reset Filters</button>}
        </div>
      )}
    </div>
  );
};

export default ExpensesReport;
