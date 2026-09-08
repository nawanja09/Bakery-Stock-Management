import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faSpinner, faSearch, faRotateLeft } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { formatCurrency } from '../../utils/formatters';
import './AnalystPage.css';

const METHODS = [
  ['all', 'All'], ['petty_cash', 'Petty Cash'], ['bank_charges', 'Bank Charges'],
  ['purchasing', 'Purchasing'], ['other_expenses', 'Other Expenses']
];
const initialRange = { fromDate: '', toDate: '' };
const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB') : '-';

const AnalystPage = () => {
  const page = useLocation().pathname.split('/').pop();
  const [range, setRange] = useState(initialRange);
  const [method, setMethod] = useState('all');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [balance, setBalance] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateRange = (event) => setRange(current => ({ ...current, [event.target.name]: event.target.value }));
  const validateRange = () => range.fromDate && range.toDate && range.fromDate > range.toDate ? 'From Date cannot be after To Date.' : '';
  const loadReport = async () => {
    const validation = validateRange();
    if (validation) return setError(validation);
    setLoading(true); setError('');
    try {
      const endpoint = page === 'incomes' ? '/analyst/incomes' : '/analyst/expenses';
      const params = { ...(range.fromDate && { fromDate: range.fromDate }), ...(range.toDate && { toDate: range.toDate }) };
      if (page === 'expenses') params.method = method;
      const response = await api.get(endpoint, { params });
      setRecords(response.data.records || []);
      setSummary(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to load the report. Please try again.');
      setRecords([]); setSummary(null);
    } finally { setLoading(false); }
  };
  const clearReport = () => { setRange(initialRange); setMethod('all'); setRecords([]); setSummary(null); setError(''); };
  const loadBalance = async () => {
    if (!selectedDate) return setError('Select a date to view the balance sheet.');
    setLoading(true); setError('');
    try { const response = await api.get('/analyst/balance-sheet', { params: { date: selectedDate } }); setBalance(response.data); }
    catch (requestError) { setError(requestError.response?.data?.error || 'Unable to calculate the balance sheet.'); setBalance(null); }
    finally { setLoading(false); }
  };
  const clearBalance = () => { setSelectedDate(''); setBalance(null); setError(''); };

  if (page === 'balance-sheet') return <BalanceSheet selectedDate={selectedDate} setSelectedDate={setSelectedDate} balance={balance} loading={loading} error={error} loadBalance={loadBalance} clearBalance={clearBalance} />;
  const incomes = page === 'incomes';
  return <div className="page-container analyst-page">
    <header className="page-header analyst-header">
        <div>
            <h2><FontAwesomeIcon icon={faChartLine} /> Analyst / {incomes ? 'Incomes' : 'Expenses'}</h2>
        </div>
    </header>
    <div className="card analyst-filters">
        <label>From Date<input type="date" name="fromDate" value={range.fromDate} onChange={updateRange} /></label>
        <label>To Date<input type="date" name="toDate" value={range.toDate} onChange={updateRange} /></label>
        {!incomes && <label>Expense Method<select value={method} onChange={event => setMethod(event.target.value)}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <div className="analyst-actions">
            <button className="btn btn-p55rimary" onClick={loadReport} disabled={loading}><FontAwesomeIcon icon={loading ? faSpinner : faSearch} spin={loading} /> Apply</button><button className="btn btn-secondary" onClick={clearReport} disabled={loading}><FontAwesomeIcon icon={faRotateLeft} /> Clear</button></div></div>
    {error && <div className="analyst-error" role="alert">{error}</div>}
    <div className="analyst-summary-grid"><SummaryCard label={incomes ? 'Total Income' : 'Total Expenses'} value={incomes ? summary?.totalIncome : summary?.totalExpenses} /><SummaryCard label="Transactions" value={summary?.transactionCount || 0} numeric /><SummaryCard label={incomes ? 'Selected Date Range' : 'Selected Method'} value={incomes ? `${formatDate(range.fromDate)} - ${formatDate(range.toDate)}` : METHODS.find(item => item[0] === method)?.[1]} /></div>
    <div className="card analyst-table-card"><div className="analyst-table-scroll"><table className="report-table"><thead><tr><th>Date</th><th>Reference No</th><th>{incomes ? 'Income Type' : 'Expense Method'}</th><th>Description</th><th>{incomes ? 'Payment Method / Account' : 'Payment Source'}</th><th className="analyst-amount">Amount</th></tr></thead><tbody>{records.length ? records.map(record => <tr key={`${record.expense_method || record.income_type}-${record.id}`}><td>{formatDate(record.date)}</td><td>{record.reference || '-'}</td><td><span className="analyst-badge">{record.income_type || record.expense_method}</span></td><td>{record.description || '-'}</td><td>{record.payment_method || record.payment_source || '-'}</td><td className="analyst-amount">{formatCurrency(record.amount)}</td></tr>) : <tr><td colSpan="6" className="analyst-empty">{incomes ? 'No income records found for the selected date range.' : 'No expense records found for the selected filters.'}</td></tr>}</tbody></table></div></div>
  </div>;
};

const SummaryCard = ({ label, value, numeric }) => <div className="card analyst-summary-card"><span>{label}</span><strong>{numeric ? value : value === undefined ? formatCurrency(0) : typeof value === 'number' ? formatCurrency(value) : value}</strong></div>;
const BalanceSheet = ({ selectedDate, setSelectedDate, balance, loading, error, loadBalance, clearBalance }) => <div className="page-container analyst-page"><header className="page-header analyst-header"><div><h2><FontAwesomeIcon icon={faChartLine} /> Analyst / Balance Sheet</h2></div></header><div className="card analyst-filters"><label>Select Date<input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} /></label><div className="analyst-actions"><button className="btn btn-primary" onClick={loadBalance} disabled={loading}><FontAwesomeIcon icon={loading ? faSpinner : faSearch} spin={loading} /> View</button><button className="btn btn-secondary" onClick={clearBalance} disabled={loading}><FontAwesomeIcon icon={faRotateLeft} /> Clear</button></div></div>{error && <div className="analyst-error" role="alert">{error}</div>}{!balance ? <div className="analyst-empty-panel">Select a date to view the balance sheet.</div> : <><div className="analyst-as-of">Balance as of: <strong>{formatDate(balance.date)}</strong></div><div className="analyst-summary-grid analyst-balance-grid"><SummaryCard label="Cash Book JH" value={balance.cashBookJH} /><SummaryCard label="Cash Book RD" value={balance.cashBookRD} /><SummaryCard label="Stores Value" value={balance.storesValue} /><SummaryCard label="Bank Values" value={balance.totalBankValues} /></div><div className="card analyst-table-card"><h3>Bank Accounts</h3><div className="analyst-table-scroll"><table className="report-table"><thead><tr><th>Bank Account</th><th>Account Number</th><th>Company</th><th className="analyst-amount">Balance</th></tr></thead><tbody>{balance.banks.length ? balance.banks.map(bank => <tr key={bank.id}><td>{bank.bank_name}</td><td>{bank.account_number || '-'}</td><td>{bank.company || '-'}</td><td className="analyst-amount">{formatCurrency(bank.balance)}</td></tr>) : <tr><td colSpan="4" className="analyst-empty">No active bank accounts found.</td></tr>}</tbody></table></div><div className="analyst-total-row"><span>Total Bank Values</span><strong>{formatCurrency(balance.totalBankValues)}</strong></div></div><div className="card analyst-position"><span>Total Financial Position</span><strong>{formatCurrency(balance.totalFinancialPosition)}</strong></div></>}</div>;

export default AnalystPage;
