// src/components/Finance/OtherLedgers.jsx
//
// Finance -> Other Ledgers: the statement for one Other Ledger.
// Transactions are the linked impact of Cash Receive (Credit) and Cash Issued
// (Debit), plus approved Collections for the two system accounts (AR Account,
// Short/Excess Account). They are listed oldest first; Balance = previous +
// Credit - Debit, or previous + Debit - Credit for those debit-normal accounts
// (the API computes it).
// Everything shown here is read back from the API - nothing is computed as the
// source of truth in the browser.
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faSpinner } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './FinanceLedger.css';

const fmt = (v) => parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// yyyy-mm-dd -> dd/mm/yyyy (string slicing: no timezone shift)
const fmtDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

const SOURCE_LABELS = {
  CASH_RECEIVE: 'Cash Received',
  CASH_ISSUED: 'Cash Issued',
  COLLECTION_AR: 'AR Collection',
  COLLECTION_SHORT_EXCESS: 'Short / Excess'
};

const OtherLedgers = () => {
  const [ledgers, setLedgers] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [ledgerId, setLedgerId] = useState('');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dropdown shows ACTIVE ledgers; "Show inactive" adds the rest so old history stays reachable.
  useEffect(() => {
    let cancelled = false;
    api.get(showInactive ? '/other-ledgers' : '/other-ledgers/active')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setLedgers(list);
        setLedgerId((current) => (list.some((l) => String(l.id) === String(current)) ? current : (list[0] ? String(list[0].id) : '')));
      })
      .catch(() => { if (!cancelled) { setLedgers([]); setError('Failed to load Other Ledgers'); } });
    return () => { cancelled = true; };
  }, [showInactive]);

  const fetchTransactions = useCallback(() => {
    if (!ledgerId) { setData(null); return; }
    setLoading(true);
    setError('');
    const params = {};
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    api.get(`/other-ledgers/${ledgerId}/transactions`, { params })
      .then((res) => setData(res.data))
      .catch((err) => { setData(null); setError(err.response?.data?.error || 'Failed to load ledger'); })
      .finally(() => setLoading(false));
  }, [ledgerId, filters]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const transactions = data?.transactions || [];
  const totals = transactions.reduce((acc, t) => ({
    debit: acc.debit + (parseFloat(t.debit) || 0),
    credit: acc.credit + (parseFloat(t.credit) || 0)
  }), { debit: 0, credit: 0 });

  const money = (v, cls) => (parseFloat(v || 0) > 0 ? <span className={cls}>{fmt(v)}</span> : <span className="fl-empty-val">—</span>);

  return (
    <div className="page-container cash-ledger-page">
      <header className="page-header">
        <h2 style={{ textAlign: 'left', margin: 0 }}>
          <FontAwesomeIcon icon={faBookOpen} style={{ marginRight: '8px' }} /> Other Ledgers
        </h2>
        <div className="cash-ledger-header-actions">
          <label htmlFor="other-ledger-select" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', whiteSpace: 'nowrap' }}>Other Ledger:</label>
          <select id="other-ledger-select" value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className="report-filter-select">
            {ledgers.length === 0 && <option value="">No Other Ledgers</option>}
            {ledgers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{Number(l.status) === 0 ? ' (Inactive)' : ''}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>
      </header>

      {data && (
        <div className="cash-ledger-kpi-row">
          <div className="card cash-ledger-balance-card" style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
            <div className="cash-ledger-balance-icon"><FontAwesomeIcon icon={faBookOpen} /></div>
            <div style={{ flex: 1 }}>
              <div className="cash-ledger-balance-label">
                {data.ledger.name} Balance
              </div>
              <div className="cash-ledger-balance-value" style={{ margin: 'var(--spacing-xs) 0' }}>
                Rs. {fmt(data.balance)}
              </div>
            </div>
          </div>
          <div className="cash-ledger-summary" style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
            <div className="card cash-ledger-total-card cash-ledger-debit-card" style={{ flex: 1, padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              <span className="cash-ledger-total-label">Total Debit</span>
              <strong className="cash-ledger-total-value">Rs. {fmt(totals.debit)}</strong>
            </div>
            <div className="card cash-ledger-total-card cash-ledger-credit-card" style={{ flex: 1, padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              <span className="cash-ledger-total-label">Total Credit</span>
              <strong className="cash-ledger-total-value">Rs. {fmt(totals.credit)}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="card filters-section report-filter-bar">
        <div className="ledger-filter-row">
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} title="Date From" className="report-filter-input" />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} title="Date To" className="report-filter-input" />
        </div>
      </div>

      {error && <div className="sl-modal-error" role="alert" style={{ marginBottom: 'var(--spacing-md)' }}>{error}</div>}

      <div className="card cash-ledger-table-card other-ledger-table-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}><FontAwesomeIcon icon={faSpinner} spin /> Loading…</div>
        ) : (
          <table className="report-table cash-ledger-table other-ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Remark</th>
                <th className="fl-num">Debit</th>
                <th className="fl-num">Credit</th>
                <th className="fl-num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data && Number(data.opening_balance) !== 0 && (
                <tr>
                  <td colSpan={7} style={{ fontStyle: 'italic' }}>Balance brought forward</td>
                  <td className="fl-num fl-balance-cell">{fmt(data.opening_balance)}</td>
                </tr>
              )}
              {transactions.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 'var(--spacing-2xl)', color: 'var(--color-text-secondary)' }}>
                  {ledgerId ? 'No transactions yet' : 'Select an Other Ledger'}
                </td></tr>
              ) : transactions.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)}</td>
                  <td>{t.company_name || '-'}</td>
                  <td><span className="fl-type-chip">{SOURCE_LABELS[t.source_type] || t.source_type}</span></td>
                  <td>{t.reference_no || '—'}</td>
                  <td><span className="fl-remark-text">{t.remark || '—'}</span></td>
                  <td className="fl-num">{money(t.debit, 'fl-debit-amount')}</td>
                  <td className="fl-num">{money(t.credit, 'fl-credit-amount')}</td>
                  <td className="fl-num fl-balance-cell">{fmt(t.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default OtherLedgers;
