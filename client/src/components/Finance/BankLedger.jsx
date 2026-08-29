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

  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', referenceNumber: '', transactionType: '', direction: '' });

  useEffect(() => {
    api.get('/finance/bank/accounts/all')
      .then(res => {
        const list = res.data || [];
        setAccounts(list);
        if (list.length > 0) setBankId(String(list[0].id));
      })
      .catch(() => setAccounts([]));
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
    <div className="fl-container">
      <div className="fl-header">
        <h2><FontAwesomeIcon icon={faUniversity} /> Bank Ledger</h2>
        <div className="fl-controls">
          <label>Bank Account</label>
          <select value={bankId} onChange={e => setBankId(e.target.value)}>
            {accounts.map(b => (
              <option key={b.id} value={b.id}>
                {b.company} — {b.bank_name}{b.account_number ? ` (${b.account_number})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {bank && (
        <div className="fl-balance-card">
          <span>{bank.bank_name}{bank.account_number ? ` — ${bank.account_number}` : ''} ({bank.company})</span>
          <strong>Rs. {fmt(bank.current_balance)}</strong>
        </div>
      )}

      <div className="fl-summary-grid">
        <div className="fl-summary-card fl-summary-card-debit">
          <span className="fl-summary-label">Total Debit</span>
          <strong className="fl-summary-value fl-debit-amount">Rs. {fmt(totals.debit)}</strong>
        </div>
        <div className="fl-summary-card fl-summary-card-credit">
          <span className="fl-summary-label">Total Credit</span>
          <strong className="fl-summary-value fl-credit-amount">Rs. {fmt(totals.credit)}</strong>
        </div>
      </div>

      <div className="fl-filters">
        <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} title="Date From" />
        <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} title="Date To" />
        <input type="text" name="referenceNumber" value={filters.referenceNumber} onChange={handleFilterChange} placeholder="Reference / Invoice No" />
        <select name="transactionType" value={filters.transactionType} onChange={handleFilterChange}>
          {TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select name="direction" value={filters.direction} onChange={handleFilterChange}>
          <option value="">All</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </select>
      </div>

      <div className="fl-table-wrapper">
        {loading ? (
          <div className="fl-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading…</div>
        ) : (
          <table className="fl-table">
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
                <tr><td colSpan={10} className="fl-empty">No transactions yet</td></tr>
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