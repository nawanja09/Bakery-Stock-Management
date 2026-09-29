import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faSpinner, faSearch, faRotateLeft, faBalanceScale, faCalendarDay } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { formatCurrency } from '../../utils/formatters';
import './AnalystPage.css';

const METHODS = [
  ['all', 'All'], ['petty_cash', 'Petty Cash'], ['cash_expenses', 'Cash Expenses'],
  ['bank_charges', 'Bank Charges'], ['hidden_expenses', 'Hidden Expenses'],
  ['purchasing', 'Purchasing'], ['other_expenses', 'Other Expenses']
];
const COMPANIES = [
  ['all', 'All Companies'], ['JH', 'JH'], ['RD', 'RD']
];
const initialRange = { fromDate: '', toDate: '' };
const formatDate = (value) => {
  if (!value) return '-';
  const raw = String(value);
  // Plain 'YYYY-MM-DD' (what the API returns) is formatted as-is, never via
  // Date, so no timezone conversion can move it to another day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`;
};

const AnalystPage = () => {
  const page = useLocation().pathname.split('/').pop();
  const isIncome = page === 'income' || page === 'incomes';
  const isBalanceSheet = page === 'balance-sheet';

  const [range, setRange] = useState(initialRange);
  const [method, setMethod] = useState('all');
  const [company, setCompany] = useState('all');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [balance, setBalance] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const balanceRequestRef = useRef(0);
  const reportRequestRef = useRef(0);

  const updateRange = (event) => setRange(current => ({ ...current, [event.target.name]: event.target.value }));
  const validateRange = () => range.fromDate && range.toDate && range.fromDate > range.toDate ? 'From Date cannot be after To Date.' : '';

  const loadReport = useCallback(async () => {
    const requestId = ++reportRequestRef.current;
    const validation = validateRange();
    if (validation) {
      setError(validation);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const endpoint = isIncome ? '/analyst/incomes' : '/analyst/expenses';
      const params = {
        ...(range.fromDate && { fromDate: range.fromDate }),
        ...(range.toDate && { toDate: range.toDate })
      };
      if (isIncome) {
        if (company && company !== 'all') params.company = company;
      } else {
        params.method = method;
      }
      const response = await api.get(endpoint, { params });
      if (requestId !== reportRequestRef.current) return;
      setRecords(response.data.records || []);
      setSummary(response.data);
    } catch (requestError) {
      if (requestId !== reportRequestRef.current) return;
      setError(requestError.response?.data?.error || 'Unable to load the report. Please try again.');
      setRecords([]);
      setSummary(null);
    } finally {
      if (requestId === reportRequestRef.current) setLoading(false);
    }
  }, [range, isIncome, company, method]);

  useEffect(() => {
    if (!isBalanceSheet) {
      setRange(initialRange);
      setMethod('all');
      setCompany('all');
      setError('');
      const endpoint = isIncome ? '/analyst/incomes' : '/analyst/expenses';
      const requestId = ++reportRequestRef.current;
      setLoading(true);
      api.get(endpoint)
        .then(res => {
          if (requestId !== reportRequestRef.current) return;
          setRecords(res.data.records || []);
          setSummary(res.data);
        })
        .catch(err => {
          if (requestId !== reportRequestRef.current) return;
          setError(err.response?.data?.error || 'Unable to load the report. Please try again.');
          setRecords([]);
          setSummary(null);
        })
        .finally(() => {
          if (requestId === reportRequestRef.current) setLoading(false);
        });
    }
  }, [isIncome, isBalanceSheet]);

  const clearReport = () => {
    const requestId = ++reportRequestRef.current;
    setRange(initialRange);
    setMethod('all');
    setCompany('all');
    setError('');
    const endpoint = isIncome ? '/analyst/incomes' : '/analyst/expenses';
    setLoading(true);
    api.get(endpoint)
      .then(res => {
        if (requestId !== reportRequestRef.current) return;
        setRecords(res.data.records || []);
        setSummary(res.data);
      })
      .catch(err => {
        if (requestId !== reportRequestRef.current) return;
        setError(err.response?.data?.error || 'Unable to load the report. Please try again.');
        setRecords([]);
        setSummary(null);
      })
      .finally(() => {
        if (requestId === reportRequestRef.current) setLoading(false);
      });
  };

  const loadBalance = useCallback(async () => {
    const requestId = ++balanceRequestRef.current;
    if (!selectedDate) {
      setLoading(false);
      setBalance(null);
      setError('Select a date to view the balance sheet.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.get('/analyst/balance-sheet', {
        params: { date: selectedDate },
        timeout: 30000
      });
      if (requestId !== balanceRequestRef.current) return;
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('The Balance Sheet response was empty.');
      }
      setBalance(response.data);
    } catch (requestError) {
      if (requestId !== balanceRequestRef.current) return;
      const message = requestError.code === 'ECONNABORTED'
        ? 'The Balance Sheet request timed out. Please try again.'
        : requestError.response?.data?.error || requestError.message || 'Unable to calculate the balance sheet.';
      setError(message);
      setBalance(null);
    } finally {
      if (requestId === balanceRequestRef.current) setLoading(false);
    }
  }, [selectedDate]);
  useEffect(() => {
    if (isBalanceSheet && selectedDate) loadBalance();
    return () => { balanceRequestRef.current += 1; };
  }, [isBalanceSheet, selectedDate, loadBalance]);
  useEffect(() => {
    if (!isBalanceSheet) return undefined;
    const refreshBalance = () => {
      if (selectedDate) loadBalance();
    };
    window.addEventListener('purchase-payment-updated', refreshBalance);
    return () => window.removeEventListener('purchase-payment-updated', refreshBalance);
  }, [isBalanceSheet, selectedDate, loadBalance]);
  const clearBalance = () => {
    balanceRequestRef.current += 1;
    setSelectedDate('');
    setBalance(null);
    setError('');
    setLoading(false);
  };

  if (isBalanceSheet) return <BalanceSheet selectedDate={selectedDate} setSelectedDate={setSelectedDate} balance={balance} loading={loading} error={error} loadBalance={loadBalance} clearBalance={clearBalance} />;
  return (
    <div className="page-container analyst-page">
      <header className="page-header analyst-header">
        <div>
          <h2><FontAwesomeIcon icon={faChartLine} /> Analyst / {isIncome ? 'Income' : 'Expenses'}</h2>
        </div>
      </header>
      <div className="card analyst-filters">
        <label>From Date<input type="date" name="fromDate" value={range.fromDate} onChange={updateRange} /></label>
        <label>To Date<input type="date" name="toDate" value={range.toDate} onChange={updateRange} /></label>
        {isIncome ? (
          <label>Company<select value={company} onChange={event => setCompany(event.target.value)}>{COMPANIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        ) : (
          <label>Expense Method<select value={method} onChange={event => setMethod(event.target.value)}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        )}
        <div className="analyst-actions">
          <button className="btn btn-primary" onClick={loadReport} disabled={loading}><FontAwesomeIcon icon={loading ? faSpinner : faSearch} spin={loading} /> Apply</button>
          <button className="btn btn-secondary" onClick={clearReport} disabled={loading}><FontAwesomeIcon icon={faRotateLeft} /> Clear</button>
        </div>
      </div>
      {error && <div className="analyst-error" role="alert">{error}</div>}
      <div className="analyst-summary-grid">
        <SummaryCard label={isIncome ? 'Total Income' : 'Total Expenses'} value={isIncome ? summary?.totalIncome : summary?.totalExpenses} />
        <SummaryCard label="Transactions" value={summary?.transactionCount || 0} numeric />
        <SummaryCard label={isIncome ? 'Selected Company' : 'Selected Method'} value={isIncome ? COMPANIES.find(item => item[0] === company)?.[1] : METHODS.find(item => item[0] === method)?.[1]} />
      </div>
      <div className="card analyst-table-card">
        <div className="analyst-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference No</th>
                {isIncome ? (
                  <>
                    <th>Company</th>
                    <th>Department</th>
                  </>
                ) : (
                  <>
                    <th>Expense Method</th>
                    <th>Expense Type</th>
                    <th>Sub Expense Type</th>
                    <th>Company</th>
                    <th>Payment Type</th>
                    <th>Description</th>
                    <th>Status</th>
                  </>
                )}
                <th className="analyst-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {records.length ? records.map(record => (
                <tr key={isIncome ? `inc-${record.id}` : `${record.expense_method}-${record.id}`}>
                  <td>{formatDate(record.date || record.income_date)}</td>
                  <td>{record.reference || (isIncome ? `INC-${record.id}` : '-')}</td>
                  {isIncome ? (
                    <>
                      <td><span className="analyst-badge">{record.company_name}</span></td>
                      <td>{record.department_name}</td>
                    </>
                  ) : (
                    <>
                      <td><span className="analyst-badge">{record.expense_method}</span></td>
                      <td>{record.expense_type || '-'}</td>
                      <td>{record.sub_expense_type || '-'}</td>
                      <td>{record.company_name || '-'}</td>
                      <td>{record.payment_source || '-'}</td>
                      <td>{record.description || '-'}</td>
                      <td>{record.status || '-'}</td>
                    </>
                  )}
                  <td className="analyst-amount">{formatCurrency(record.amount)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={isIncome ? 5 : 10} className="analyst-empty">
                    {isIncome ? 'No income records found for the selected filters.' : 'No expense records found for the selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, numeric }) => <div className="card analyst-summary-card"><span>{label}</span><strong>{numeric ? value : value === undefined ? formatCurrency(0) : typeof value === 'number' ? formatCurrency(value) : value}</strong></div>;

const BsRow = ({ label, value, tone, indent, showAmount = true }) => (
  <tr className={['bs-row', tone && `bs-row--${tone}`, indent && 'bs-row--indent'].filter(Boolean).join(' ')}>
    <td className="bs-row-label">{label}</td>
    <td className="bs-row-amount">{showAmount ? formatCurrency(value) : ''}</td>
  </tr>
);
const BsSectionRow = ({ label }) => (
  <tr className="bs-row bs-row--section"><td colSpan={2}>{label}</td></tr>
);
const BsSubheadRow = ({ label }) => (
  <tr className="bs-row bs-row--subhead"><td colSpan={2}>{label}</td></tr>
);

const BalanceSheet = ({ selectedDate, setSelectedDate, balance, loading, error, loadBalance, clearBalance }) => {
  const netPositive = !balance || Number(balance.netBalance) >= 0;
  return (
    <div className="page-container balance-sheet-page">
      <div className="bs-title-bar">
        <FontAwesomeIcon icon={faBalanceScale} />
        <h2>BALANCE SHEET</h2>
      </div>

      <div className="card analyst-filters">
        <label>
          <FontAwesomeIcon icon={faCalendarDay} /> Select Date
          <input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
        </label>
        <div className="analyst-actions">
          <button className="btn btn-primary" onClick={loadBalance} disabled={loading || !selectedDate}><FontAwesomeIcon icon={loading ? faSpinner : faSearch} spin={loading} /> Refresh</button>
          <button className="btn btn-secondary" onClick={clearBalance} disabled={loading}><FontAwesomeIcon icon={faRotateLeft} /> Clear</button>
        </div>
      </div>

      {error && <div className="analyst-error" role="alert">{error}</div>}

      {!balance ? (
        <div className="analyst-empty-panel">{error || 'Select a date to view the balance sheet.'}</div>
      ) : (
        <div className="card bs-sheet-card">
          <div className="bs-table-scroll">
            <table className="bs-table">
              <thead>
                <tr>
                  <th>BALANCE SHEET</th>
                  <th className="bs-row-amount">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                <BsSectionRow label="ASSETS" />
                <BsSubheadRow label="1. Cash Book" />
                <BsRow label="Cash Book - JH" value={balance.cashBookJH} indent />
                <BsRow label="Cash Book - RD" value={balance.cashBookRD} indent />
                <BsRow label="Total of Cash Book" value={balance.cashBookTotal} tone="subtotal" indent />
                <BsSubheadRow label="2. Stock Value" />
                <BsRow label="Stock Value" value={balance.storesValue} indent />
                <BsSubheadRow label="3. Bank Value" />
                {balance.banks && balance.banks.map((bank, index) => (
                  <BsRow key={bank.id || index} label={`${bank.bank_name} - ${bank.account_number}${bank.company ? ` (${bank.company})` : ''}`} value={bank.balance} indent />
                ))}
                <BsRow label="Total of Bank Value" value={balance.totalBankValues} tone="subtotal" indent />
                <BsRow label="Total Value" value={balance.totalAssets} tone="total" />

                <BsSectionRow label="PAYABLES / LIABILITIES" />
                <BsRow label={`Pending / Outstanding (${balance.pendingPurchasingCount || 0} invoices)`} value={balance.totalPurchasingPending} indent />
                <BsRow label="Purchasing Advance Payment Balance" value={balance.purchasingAdvancePaymentBalance} indent />
                <BsRow label="Total Available Pending Credits" value={balance.totalAvailablePendingCredits} indent />

                <tr className={`bs-row bs-row--net ${netPositive ? 'bs-row--net-positive' : 'bs-row--net-negative'}`}>
                  <td className="bs-row-label">NET BALANCE</td>
                  <td className="bs-row-amount">{formatCurrency(balance.netBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  );
};

export default AnalystPage;
