// src/components/finance/CashLedger.jsx
import React, { useState, useEffect, useCallback } from 'react';
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

  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', referenceNumber: '', transactionType: '' });

  // Opening balance setup (only offered while the ledger is empty)
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingOpening, setSavingOpening] = useState(false);
  const [openingMessage, setOpeningMessage] = useState(null);

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
        <h2><FontAwesomeIcon icon={faMoneyBillWave} /> Cash Ledger</h2>
        <div className="fl-controls">
          <label>Company</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="fl-balance-card">
        <span>Cash In Hand Balance</span>
        <strong>Rs. {fmt(balance)}</strong>
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

      <div className="fl-filters">
        <FontAwesomeIcon icon={faFilter} className="fl-filter-icon" />
        <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} title="Date From" />
        <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} title="Date To" />
        <input type="text" name="referenceNumber" value={filters.referenceNumber} onChange={handleFilterChange} placeholder="Reference / Invoice No" />
        <select name="transactionType" value={filters.transactionType} onChange={handleFilterChange}>
          {TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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

export default CashLedger;