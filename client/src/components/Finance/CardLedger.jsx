// src/components/Finance/CardLedger.jsx
//
// Finance -> Card Ledger.
//   Pending   - card transactions not yet realised. They have NO effect on any
//               Bank Balance. Each row has a "Realise" action.
//   Completed - realised card transactions, with their Realise Date. Realising
//               posts the amount to the Bank Ledger / Bank Balance exactly once
//               (enforced by the server, see services/cardLedgerService.js).
// The database is the only source of truth: after every change both tabs are
// re-read from the API.
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCreditCard, faSpinner, faCheck, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import './FinanceForm.css';
import './CardLedger.css';

const WRITE_ROLES = ['Admin', 'Super Admin', 'Accountant'];

const getStoredUserRole = () => {
  try {
    const storedUser = localStorage.getItem('user');
    const role = storedUser ? JSON.parse(storedUser).role : null;
    return role === 'QB' ? 'View Only' : role;
  } catch (e) {
    return null;
  }
};

// Local (not UTC) calendar date, so the default is right early in the morning in Sri Lanka.
const todayLocal = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const fmtMoney = (value) =>
  (Number.parseFloat(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' without going through Date (no timezone shifts).
const fmtDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const isRealDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

const bankLabel = (row) => `${row.bank_name || ''}${row.account_number ? `  ${row.account_number}` : ''}`.trim();

const CardLedger = () => {
  const { showPopup } = usePopup();
  const canWrite = WRITE_ROLES.includes(getStoredUserRole());

  const [tab, setTab] = useState('Pending');
  const [banks, setBanks] = useState([]);
  const [filters, setFilters] = useState({ bankId: '', dateFrom: '', dateTo: '' });
  const [data, setData] = useState({
    Pending: { transactions: [], total: 0 },
    Completed: { transactions: [], total: 0 }
  });
  const [loading, setLoading] = useState(true);

  // Realise modal
  const [realiseRow, setRealiseRow] = useState(null);
  const [realiseDate, setRealiseDate] = useState('');
  const [realiseError, setRealiseError] = useState('');
  const [realising, setRealising] = useState(false);

  const fetchAll = useCallback(async () => {
    const params = {};
    if (filters.bankId) params.bankId = filters.bankId;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    try {
      const [pending, completed] = await Promise.all([
        api.get('/finance/card-ledger', { params: { ...params, status: 'Pending' } }),
        api.get('/finance/card-ledger', { params: { ...params, status: 'Completed' } })
      ]);
      setData({
        Pending: { transactions: pending.data?.transactions || [], total: pending.data?.total || 0 },
        Completed: { transactions: completed.data?.transactions || [], total: completed.data?.total || 0 }
      });
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to load card transactions');
    } finally {
      setLoading(false);
    }
  }, [filters, showPopup]);

  useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);

  useEffect(() => {
    api.get('/finance/bank/accounts/all')
      .then((res) => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBanks([]));
  }, []);

  const openRealise = (row) => {
    setRealiseRow(row);
    // Default to today, but never earlier than the transaction itself.
    const today = todayLocal();
    setRealiseDate(today < row.transaction_date ? row.transaction_date : today);
    setRealiseError('');
  };

  const closeRealise = () => { if (!realising) setRealiseRow(null); };

  const handleRealise = async (event) => {
    event.preventDefault();
    if (realising || !realiseRow) return; // one submit at a time
    if (!realiseDate) return setRealiseError('Realise Date is required');
    if (!isRealDate(realiseDate)) return setRealiseError('Please enter a valid Realise Date');
    if (realiseDate < realiseRow.transaction_date) {
      return setRealiseError('Realise Date cannot be earlier than the transaction date');
    }

    setRealising(true);
    setRealiseError('');
    try {
      await api.post(`/finance/card-ledger/${realiseRow.id}/realise`, { realise_date: realiseDate });
      showPopup(
        'success',
        `Realised Rs. ${fmtMoney(realiseRow.amount)} on ${fmtDate(realiseDate)}. ${bankLabel(realiseRow)} balance increased.`
      );
      setRealiseRow(null);
      await fetchAll();
    } catch (error) {
      setRealiseError(error.response?.data?.error || 'Failed to realise card transaction');
      // It may have been realised by someone else in the meantime - refresh the lists.
      fetchAll();
    } finally {
      setRealising(false);
    }
  };

  const setFilter = (name) => (event) => setFilters((prev) => ({ ...prev, [name]: event.target.value }));
  const rows = data[tab].transactions;
  const isPending = tab === 'Pending';
  const colCount = isPending ? (canWrite ? 7 : 6) : 7;

  return (
    <div className="page-container cl-page">
      <header className="page-header">
        <div>
          <h2 style={{ margin: 0 }}>
            <FontAwesomeIcon icon={faCreditCard} style={{ marginRight: '8px' }} /> Card Ledger
          </h2>
        </div>
      </header>

      <div className="card cl-card">
        <div className="cl-tabs" role="tablist">
          {['Pending', 'Completed'].map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={`cl-tab ${tab === name ? 'active' : ''}`}
              onClick={() => setTab(name)}
            >
              {name} <span className="cl-count">{data[name].transactions.length}</span>
            </button>
          ))}
        </div>

        <div className="cl-filters">
          <div className="form-group">
            <label htmlFor="cl-bank">Bank Account</label>
            <select id="cl-bank" value={filters.bankId} onChange={setFilter('bankId')} className="form-select">
              <option value="">All bank accounts</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>{b.company} - {b.bank_name}{b.account_number ? `  ${b.account_number}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="cl-from">{isPending ? 'Transaction Date From' : 'Realise Date From'}</label>
            <input id="cl-from" type="date" value={filters.dateFrom} onChange={setFilter('dateFrom')} className="form-input" />
          </div>
          <div className="form-group">
            <label htmlFor="cl-to">{isPending ? 'Transaction Date To' : 'Realise Date To'}</label>
            <input id="cl-to" type="date" value={filters.dateTo} onChange={setFilter('dateTo')} className="form-input" />
          </div>
        </div>

        {isPending && (
          <p className="cl-note">
            Pending card transactions are <strong>not</strong> in the Bank Balance yet. Realise a transaction once the bank has received it.
          </p>
        )}

        {loading ? (
          <div className="cl-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading card transactions...</div>
        ) : (
          <div className="cl-table-wrap">
            <table className="report-table cl-table">
              <thead>
                <tr>
                  <th>Transaction Date</th>
                  {!isPending && <th>Realise Date</th>}
                  <th>Company</th>
                  <th>Bank Account</th>
                  <th>Reference No</th>
                  <th>Remark</th>
                  <th className="cl-num">Amount (Rs.)</th>
                  {isPending && canWrite && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="cl-empty">
                      {isPending ? 'No pending card transactions.' : 'No completed card transactions.'}
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.transaction_date)}</td>
                    {!isPending && <td className="cl-realise-date">{fmtDate(row.realise_date)}</td>}
                    <td>{row.company_name}</td>
                    <td>{bankLabel(row)}</td>
                    <td>{row.reference_number || ''}</td>
                    <td>{row.remark || ''}</td>
                    <td className="cl-num">{fmtMoney(row.amount)}</td>
                    {isPending && canWrite && (
                      <td>
                        <button type="button" className="btn btn-primary cl-realise-btn" onClick={() => openRealise(row)}>
                          <FontAwesomeIcon icon={faCheck} /> Realise
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={isPending ? 5 : 6} className="cl-total-label">Total</td>
                    <td className="cl-num cl-total">{fmtMoney(data[tab].total)}</td>
                    {isPending && canWrite && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {realiseRow && (
        <div className="cl-modal-overlay" onClick={closeRealise}>
          <div className="cl-modal" role="dialog" aria-modal="true" aria-labelledby="cl-realise-title" onClick={(e) => e.stopPropagation()}>
            <div className="cl-modal-header">
              <h3 id="cl-realise-title">Realise Card Transaction</h3>
              <button type="button" className="cl-modal-close" onClick={closeRealise} aria-label="Close" disabled={realising}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <form onSubmit={handleRealise} noValidate>
              <div className="cl-modal-body">
                <div className="cl-summary-card">
                  <div className="cl-summary-row"><span className="cl-summary-lbl">Transaction Date</span><span>{fmtDate(realiseRow.transaction_date)}</span></div>
                  <div className="cl-summary-row"><span className="cl-summary-lbl">Bank Account</span><span>{bankLabel(realiseRow)}</span></div>
                  {realiseRow.reference_number && (
                    <div className="cl-summary-row"><span className="cl-summary-lbl">Reference No</span><span>{realiseRow.reference_number}</span></div>
                  )}
                  <div className="cl-summary-row"><span className="cl-summary-lbl">Amount</span><strong>Rs. {fmtMoney(realiseRow.amount)}</strong></div>
                </div>

                <div className="form-group">
                  <label htmlFor="cl-realise-date">Realise Date <span className="required">*</span></label>
                  <input
                    id="cl-realise-date"
                    type="date"
                    min={realiseRow.transaction_date}
                    max={todayLocal()}
                    value={realiseDate}
                    onChange={(e) => { setRealiseDate(e.target.value); setRealiseError(''); }}
                    className="form-input"
                    autoFocus
                  />
                  <span className="form-helper">Rs. {fmtMoney(realiseRow.amount)} is added to the Bank Balance on this date. This cannot be undone or repeated.</span>
                </div>

                {realiseError && <div className="cl-modal-error" role="alert">{realiseError}</div>}
              </div>

              <div className="cl-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeRealise} disabled={realising}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={realising}>
                  {realising ? <><FontAwesomeIcon icon={faSpinner} spin /> Realising...</> : <><FontAwesomeIcon icon={faCheck} /> Confirm Realise</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardLedger;
