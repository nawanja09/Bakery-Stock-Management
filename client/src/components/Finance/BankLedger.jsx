// src/components/finance/BankLedger.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUniversity, faSpinner, faFilter } from '@fortawesome/free-solid-svg-icons';
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
  { value: 'Adjustment', label: 'Adjustment' },
  { value: 'Bank Deposit', label: 'Bank Deposit' },
  { value: 'Bank Withdrawal', label: 'Bank Withdrawal' }
];

const BankLedger = () => {
  const [accounts, setAccounts] = useState([]);
  const [bankId, setBankId] = useState('');
  const [bank, setBank] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountLoadError, setAccountLoadError] = useState(false);

  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', referenceNumber: '', transactionType: '', direction: '' });

  useEffect(() => {
    setLoadingAccounts(true);
    setAccountLoadError(false);
    api.get('/finance/bank/accounts/all')
      .then(res => {
        const list = res.data || [];
        setAccounts(list);
        if (list.length > 0) setBankId(String(list[0].id));
      })
      .catch(() => { setAccounts([]); setBankId(''); setAccountLoadError(true); })
      .finally(() => setLoadingAccounts(false));
  }, []);

  const fetchLedger = useCallback(() => {
    if (!bankId) return;
    setLoading(true);
    const params = {};
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.referenceNumber) params.referenceNumber = filters.referenceNumber;
    if (filters.transactionType) params.transactionType = filters.transactionType;
    if (filters.direction) params.direction = filters.direction;

    api.get(`/finance/bank/ledger/${bankId}`, { params })
      .then(res => {
        setBank(res.data?.bank || null);
        setTransactions(res.data?.transactions || []);
      })
      .catch(() => {
        setBank(null);
        setTransactions([]);
      })
      .finally(() => setLoading(false));
  }, [bankId, filters]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const handleFilterChange = e => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
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
    <div className="page-container bank-ledger-page">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>
            <FontAwesomeIcon icon={faUniversity} style={{ marginRight: '8px' }} /> Bank Ledger
          </h2>
        </div>
        <div className="report-filter-group" style={{ alignItems: 'center' }}>
          <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>Bank Account:</label>
          <select value={bankId} onChange={e => setBankId(e.target.value)} className="report-filter-select" disabled={loadingAccounts || accountLoadError}>
            <option value="">{loadingAccounts ? 'Loading…' : accountLoadError ? 'Unable to load bank accounts' : accounts.length === 0 ? 'No active bank accounts available' : 'Select bank account'}</option>
            {accounts.map(b => (
              <option key={b.id} value={b.id}>
                {b.company} — {b.bank_name}{b.account_number ? ` (${b.account_number})` : ''}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="bank-ledger-kpi-row">
        {bank && (
          <div className="card bank-ledger-balance-card" style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
            <div className="bank-ledger-balance-icon" style={{ fontSize: '48px', color: 'var(--color-primary)', opacity: 0.8 }}><FontAwesomeIcon icon={faUniversity} /></div>
            <div style={{ flex: 1 }}>
              <div className="bank-ledger-balance-label" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>
                {bank.bank_name}{bank.account_number ? ` — ${bank.account_number}` : ''} ({bank.company})
              </div>
              <div className={`bank-ledger-balance-value${parseFloat(bank.current_balance) < 0 ? ' is-negative' : ''}`} style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--color-text-primary)', margin: 'var(--spacing-xs) 0' }}>Rs. {fmt(bank.current_balance)}</div>
            </div>
          </div>
        )}

        <div className="bank-ledger-summary" style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        <div className="card bank-ledger-total-card bank-ledger-debit-card" style={{ flex: 1, padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          <span className="bank-ledger-total-label" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Total Debit</span>
          <strong className="bank-ledger-total-value" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-success)' }}>Rs. {fmt(totals.debit)}</strong>
        </div>
        <div className="card bank-ledger-total-card bank-ledger-credit-card" style={{ flex: 1, padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          <span className="bank-ledger-total-label" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>Total Credit</span>
          <strong className="bank-ledger-total-value" style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-danger)' }}>Rs. {fmt(totals.credit)}</strong>
        </div>
        </div>
      </div>

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

      <div className="card bank-ledger-table-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}><FontAwesomeIcon icon={faSpinner} spin /> Loading…</div>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Direction</th>
                <th>Transaction Type</th>
                <th>Reference</th>
                <th>Party</th>
                <th>Remark</th>
                <th className="fl-num">Debit</th>
                <th className="fl-num">Credit</th>
                <th className="fl-num">Balance</th>
                <th>Created By</th>
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
                    <td>{t.remark || '—'}</td>
                    <td className="fl-num">{fmtDebit(t.debit)}</td>
                    <td className="fl-num">{fmtCredit(t.credit)}</td>
                    <td className="fl-num fl-balance-cell">{fmt(t.balance)}</td>
                    <td>{t.created_by_name || '—'}</td>
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

export default BankLedger;