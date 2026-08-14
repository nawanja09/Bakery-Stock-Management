// src/components/Expenses/Reimbursement.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faTimes,
  faHistory,
  faMoneyBillWave,
  faReceipt,
  faSync,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';
import './Expenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const Reimbursement = () => {
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [reimbursements, setReimbursements] = useState([]);
  const { showPopup } = usePopup();

  // Reimbursement Form State
  const [reimbursementForm, setReimbursementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference_number: '',
    amount: '',
    cash_book: ''
  });

  // Cash Book = which real Cash (company) or Bank account funds the
  // reimbursement. Combined into one dropdown, value format:
  // "CASH:<company_id>" or "BANK:<bank_id>". JH is the default.
  const [companies, setCompanies] = useState([]);
  const [banks, setBanks] = useState([]);
  const cashBookOptions = [
    ...companies.map(c => ({ value: `CASH:${c.id}`, label: `${c.name} - Cash` })),
    ...banks.map(b => ({ value: `BANK:${b.id}`, label: b.bank_name }))
  ];

  useEffect(() => {
    const loadCashBookOptions = async () => {
      try {
        const [companiesRes, banksRes] = await Promise.all([
          api.get('/purchases/companies'),
          api.get('/expenses/banks')
        ]);
        const companiesData = companiesRes.data || [];
        setCompanies(companiesData);
        setBanks(banksRes.data || []);
        const jh = companiesData.find(c => (c.name || '').toUpperCase() === 'JH');
        if (jh) {
          setReimbursementForm(prev => (prev.cash_book ? prev : { ...prev, cash_book: `CASH:${jh.id}` }));
        }
      } catch (error) {
        console.error('Error loading cash book options:', error);
      }
    };
    loadCashBookOptions();
  }, []);

  // Generate reference number for reimbursement
  const generateReferenceNumber = useCallback(async () => {
    try {
      const response = await api.get('/expenses/petty-cash/next-reference-number');
      if (response.data.reference_number) {
        setReimbursementForm(prev => ({ ...prev, reference_number: response.data.reference_number }));
      } else {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const count = reimbursements.length + 1;
        const newRefNo = `REF-${year}${month}-${String(count).padStart(4, '0')}`;
        setReimbursementForm(prev => ({ ...prev, reference_number: newRefNo }));
      }
    } catch (error) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const count = reimbursements.length + 1;
      const newRefNo = `REF-${year}${month}-${String(count).padStart(4, '0')}`;
      setReimbursementForm(prev => ({ ...prev, reference_number: newRefNo }));
    }
  }, [reimbursements.length]);

  // Fetch all data from database
  const fetchReimbursementData = useCallback(async () => {
    setIsFetching(true);
    try {
      // Fetch petty cash balance
      const balanceRes = await api.get('/expenses/petty-cash/balance');
      setBalance(balanceRes.data.balance || 0);

      // Fetch reimbursements from database
      const reimbursementRes = await api.get('/expenses/petty-cash/reimbursements');
      setReimbursements(reimbursementRes.data || []);
    } catch (error) {
      console.error('Error fetching reimbursement data:', error);
      showPopup('error', 'Failed to load data from server');
    } finally {
      setIsFetching(false);
    }
  }, [showPopup]);

  // Load data on component mount
  useEffect(() => {
    fetchReimbursementData();
  }, [fetchReimbursementData]);

  // Generate reference number on component mount
  useEffect(() => {
    if (!reimbursementForm.reference_number) {
      generateReferenceNumber();
    }
  }, [generateReferenceNumber, reimbursementForm.reference_number]);

  const handleReimbursementChange = (e) => {
    const { name, value } = e.target;
    setReimbursementForm(prev => ({ ...prev, [name]: value }));
  };

  // Submit Reimbursement to Database
  const handleReimbursementSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!reimbursementForm.reference_number) {
      showPopup('error', 'Reference number is required');
      return;
    }
    if (!reimbursementForm.amount || parseFloat(reimbursementForm.amount) <= 0) {
      showPopup('error', 'Valid amount is required');
      return;
    }
    if (!reimbursementForm.cash_book) {
      showPopup('error', 'Please select a cash book');
      return;
    }

    setIsLoading(true);
    try {
      const [fundingSource, accountId] = reimbursementForm.cash_book.split(':');
      const payload = {
        reference_number: reimbursementForm.reference_number,
        reimbursement_date: reimbursementForm.date,
        amount: parseFloat(reimbursementForm.amount),
        funding_source: fundingSource,
        ...(fundingSource === 'CASH' ? { company_id: accountId } : { bank_id: accountId })
      };

      await api.post('/expenses/petty-cash/reimbursement', payload);

      showPopup('success', 'Reimbursement recorded successfully');

      // Reset form
      const jh = companies.find(c => (c.name || '').toUpperCase() === 'JH');
      setReimbursementForm({
        date: new Date().toISOString().split('T')[0],
        reference_number: '',
        amount: '',
        cash_book: jh ? `CASH:${jh.id}` : ''
      });

      // Refresh data
      fetchReimbursementData();
    } catch (error) {
      console.error('Error submitting reimbursement:', error);
      showPopup('error', 'Failed to record reimbursement');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="petty-cash-container">
      <div className="petty-cash-header">
        <h2>
          <FontAwesomeIcon icon={faMoneyBillWave} className="header-icon" />
          Petty Cash Reimbursement
        </h2>
        <div className="balance-display">
          <span className="balance-label">Current Balance:</span>
          <span className="balance-amount">Rs. {balance.toLocaleString()}</span>
        </div>
      </div>

      <div className="petty-cash-content">
        {/* Reimbursement Form */}
        <div className="form-section">
          <div className="form-header">
            <h3>
              <FontAwesomeIcon icon={faReceipt} className="form-icon" />
              Record Reimbursement
            </h3>
            <button
              type="button"
              className="refresh-btn"
              onClick={fetchReimbursementData}
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
          </div>

          <form onSubmit={handleReimbursementSubmit} className="petty-cash-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="date">Date *</label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={reimbursementForm.date}
                  onChange={handleReimbursementChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="reference_number">Reference Number *</label>
                <input
                  type="text"
                  id="reference_number"
                  name="reference_number"
                  value={reimbursementForm.reference_number}
                  onChange={handleReimbursementChange}
                  placeholder="REF-YYYYMM-XXXX"
                  required
                  readOnly
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="amount">Amount (Rs.) *</label>
                <input
                  type="number"
                  id="amount"
                  name="amount"
                  value={reimbursementForm.amount}
                  onChange={handleReimbursementChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="cash_book">Cash Book *</label>
                <select
                  id="cash_book"
                  name="cash_book"
                  value={reimbursementForm.cash_book}
                  onChange={handleReimbursementChange}
                  required
                >
                  <option value="">Select Cash Book</option>
                  {cashBookOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <small style={{ color: '#6c757d', display: 'block', marginTop: '4px' }}>This will deduct the entered amount from the selected Cash Book and add it to the Petty Cash balance. JH is selected by default.</small>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="submit-btn"
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                {isLoading ? 'Recording...' : 'Record Reimbursement'}
              </button>
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setReimbursementForm({
                  date: new Date().toISOString().split('T')[0],
                  reference_number: '',
                  amount: ''
                })}
              >
                <FontAwesomeIcon icon={faTimes} />
                Clear
              </button>
            </div>
          </form>
        </div>

        {/* Reimbursements History */}
        <div className="history-section">
          <div className="history-header">
            <h3>
              <FontAwesomeIcon icon={faHistory} className="history-icon" />
              Reimbursement History
            </h3>
          </div>

          <div className="table-container">
            <table className="petty-cash-table">
              <thead>
                <tr>
                  <th>Reference Number</th>
                  <th>Date</th>
                  <th>Cash Book</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {reimbursements.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="no-data">No reimbursements recorded yet</td>
                  </tr>
                ) : (
                  reimbursements.map((reimbursement) => (
                    <tr key={reimbursement.id}>
                      <td>{reimbursement.reference_number}</td>
                      <td>{reimbursement.date}</td>
                      <td>{reimbursement.company_name || reimbursement.bank_name || '-'}</td>
                      <td>Rs. {parseFloat(reimbursement.amount).toLocaleString()}</td>
                      <td>
                        <span className={`status-badge ${reimbursement.status?.toLowerCase()}`}>
                          {reimbursement.status || 'Pending'}
                        </span>
                      </td>
                      <td>{reimbursement.created_by_name || 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reimbursement;