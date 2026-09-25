// src/components/finance/CashLedger.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoneyBillWave, faSpinner, faFilter, faFlagCheckered } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './FinanceLedger.css';

const TRANSACTION_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'Opening Balance', label: 'Opening Balance' },
  { value: 'RM Purchase Payment', label: 'RM Purchase Payment' },
  { value: 'Supplier Advance Payment', label: 'Supplier Advance Payment' },
  { value: 'Customer Payment', label: 'Customer Payment' },
  { value: 'Owner Capital', label: 'Owner Capital' },
  { value: 'Other Income', label: 'Other Income' },
  { value: 'Petty Cash Reimbursement', label: 'Petty Cash Reimbursement' },
  { value: 'Adjustment', label: 'Adjustment' },
  { value: 'Bank Deposit', label: 'Bank Deposit' },
  { value: 'Bank Withdrawal', label: 'Bank Withdrawal' }
];

const CashLedger = () => {
  const currentUser = JSON.parse(localStorage.getItem('user') || 'null');
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', referenceNumber: '', transactionType: '', direction: '' });

  // Opening balance setup (only offered while the ledger is empty)
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingOpening, setSavingOpening] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(null);

  // Column resizing state
  const [remarkWidth, setRemarkWidth] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const tableRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    api.get('/purchases/companies')
      .then(res => {
        const list = res.data || [];
        setCompanies(list);
        if (list.length > 0) setCompanyId(String(list[0].id));
      })
      .catch(() => setCompanies([]));
  }, []);

  const fetchLedger = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    const params = {};
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.referenceNumber) params.referenceNumber = filters.referenceNumber;
    if (filters.transactionType) params.transactionType = filters.transactionType;
    if (filters.direction) params.direction = filters.direction;

    api.get(`/finance/cash/ledger/${companyId}`, { params })
      .then(res => {
        setTransactions(res.data?.transactions || []);
        setBalance(res.data?.current_balance || 0);
      })
      .catch(() => {
        setTransactions([]);
        setBalance(0);
      })
      .finally(() => setLoading(false));
  }, [companyId, filters]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const handleFilterChange = e => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSetOpeningBalance = async e => {
    e.preventDefault();
    setOpeningMessage(null);
    const amt = parseFloat(openingAmount);
    if (isNaN(amt) || amt < 0) {
      setOpeningMessage({ type: 'error', text: 'Enter a valid opening balance' });
      return;
    }
    if (!currentUser?.id) {
      setOpeningMessage({ type: 'error', text: 'Please login again' });
      return;
    }
    setSavingOpening(true);
    try {
      await api.post('/finance/cash/opening-balance', {
        company_id: companyId,
        date: openingDate,
        amount: amt,
        created_by: currentUser.id
      });
      setShowOpeningForm(false);
      setOpeningAmount('');
      fetchLedger();
    } catch (err) {
      setOpeningMessage({ type: 'error', text: err.response?.data?.error || 'Failed to set opening balance' });
    } finally {
      setSavingOpening(false);
    }
  };

  // Column resizing handlers
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = remarkWidth;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!isResizing) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.min(500, Math.max(120, startWidthRef.current + diff));
    setRemarkWidth(newWidth);
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  const totals = useMemo(() => transactions.reduce((acc, transaction) => {
    const debit = parseFloat(transaction?.debit || 0);
    const credit = parseFloat(transaction?.credit || 0);
    acc.debit += debit;
    acc.credit += credit;
    return acc;
  }, { debit: 0, credit: 0 }), [transactions]);

  const fmt = (v) => parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDebit = (v) => {
    const n = parseFloat(v || 0);
    if (n <= 0) return <span className="fl-empty-val">—</span>;
    return <span className="fl-debit-amount">{fmt(n)}</span>;
  };

  const fmtCredit = (v) => {
    const n = parseFloat(v || 0);
    if (n <= 0) return <span className="fl-empty-val">—</span>;
    return <span className="fl-credit-amount">{fmt(n)}</span>;
  };

  return (
    <div className="page-container cash-ledger-page">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>
            <FontAwesomeIcon icon={faMoneyBillWave} style={{ marginRight: '8px' }} /> Cash Ledger
          </h2>
        </div>
        <div className="report-filter-group" style={{ alignItems: 'center' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>Company:</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="report-filter-select">
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="cash-ledger-kpi-row">
        <div className="card cash-ledger-balance-card" style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
          <div className="cash-ledger-balance-icon" style={{ fontSize: '48px', color: 'var(--color-primary)', opacity: 0.8 }}><FontAwesomeIcon icon={faMoneyBillWave} /></div>
          <div style={{ flex: 1 }}>
            <div className="cash-ledger-balance-label" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>Cash In Hand Balance</div>
            <div className={`cash-ledger-balance-value${parseFloat(balance) < 0 ? ' is-negative' : ''}`} style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--color-text-primary)', margin: 'var(--spacing-xs) 0' }}>Rs. {fmt(balance)}</div>
          </div>
        </div>

        <div className="cash-ledger-summary" style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
          <div className="card cash-ledger-total-card cash-ledger-debit-card" style={{ flex: 1, padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
            <span className="cash-ledger-total-label" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Total Debit</span>
            <strong className="cash-ledger-total-value" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-success)' }}>Rs. {fmt(totals.debit)}</strong>
          </div>
          <div className="card cash-ledger-total-card cash-ledger-credit-card" style={{ flex: 1, padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
            <span className="cash-ledger-total-label" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Total Credit</span>
            <strong className="cash-ledger-total-value" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-danger)' }}>Rs. {fmt(totals.credit)}</strong>
          </div>
        </div>
      </div>

      {transactions.length === 0 && !loading && (
        <div className="fl-opening-panel">
          {!showOpeningForm ? (
            <button className="fl-opening-btn" onClick={() => setShowOpeningForm(true)}>
              <FontAwesomeIcon icon={faFlagCheckered} /> Set Opening Balance
            </button>
          ) : (
            <form className="fl-opening-form" onSubmit={handleSetOpeningBalance}>
              <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} required />
              <input type="number" min="0" step="0.01" placeholder="Opening amount" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} required />
              <button type="submit" disabled={savingOpening}>{savingOpening ? 'Saving…' : 'Save'}</button>
              <button type="button" className="fl-opening-cancel" onClick={() => setShowOpeningForm(false)}>Cancel</button>
            </form>
          )}
          {openingMessage && <div className={`fl-opening-message fl-opening-message-${openingMessage.type}`}>{openingMessage.text}</div>}
        </div>
      )}

      <div className="card filters-section report-filter-bar" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
        <div className="ledger-filter-row">
          <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} title="Date From" className="report-filter-input" />
          <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} title="Date To" className="report-filter-input" />
          <input type="text" name="referenceNumber" value={filters.referenceNumber} onChange={handleFilterChange} placeholder="Reference / Invoice No" className="report-filter-input" />
          <select name="transactionType" value={filters.transactionType} onChange={handleFilterChange} className="report-filter-select">
            {TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select name="direction" value={filters.direction} onChange={handleFilterChange} className="report-filter-select">
            <option value="">All Directions</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </select>
        </div>
      </div>

      <div className="card cash-ledger-table-card" ref={tableRef}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}><FontAwesomeIcon icon={faSpinner} spin /> Loading…</div>
        ) : (
          <table className="report-table cash-ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Direction</th>
                <th>Transaction Type</th>
                <th>Reference</th>
                <th>Party</th>
                <th 
                  className="fl-remark-header"
                  style={{ width: `${remarkWidth}px`, minWidth: '120px', maxWidth: '500px' }}
                >
                  <span className="fl-remark-label">Remark</span>
                  <div 
                    className="fl-remark-resizer"
                    onMouseDown={handleResizeStart}
                    title="Drag to resize"
                  />
                </th>
                <th className="fl-num">Debit</th>
                <th className="fl-num">Credit</th>
                <th className="fl-num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}>No transactions yet</td></tr>
              ) : transactions.map(t => {
                const dir = (t.direction || '').toUpperCase();
                return (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td>
                      {dir ? (
                        <span className={`fl-direction fl-direction-${dir.toLowerCase()}`}>
                          {dir === 'IN' ? '▲' : '▼'} {dir}
                        </span>
                      ) : <span className="fl-empty-val">—</span>}
                    </td>
                    <td>
                      {t.transaction_type
                        ? <span className="fl-type-chip">{t.transaction_type}</span>
                        : <span className="fl-empty-val">—</span>}
                    </td>
                    <td>{t.reference_number || t.invoice_number || '—'}</td>
                    <td>{t.party_name || '—'}</td>
                    <td 
                      className="fl-remark-cell"
                      style={{ width: `${remarkWidth}px`, minWidth: '120px', maxWidth: '500px' }}
                    >
                      <span className="fl-remark-text">{t.remark || '—'}</span>
                    </td>
                    <td className="fl-num">{fmtDebit(t.debit)}</td>
                    <td className="fl-num">{fmtCredit(t.credit)}</td>
                    <td className="fl-num fl-balance-cell">{fmt(t.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CashLedger;