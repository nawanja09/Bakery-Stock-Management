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
    company_id: ''
  });

  // Cash Book = a Company's Cash account. Every company has exactly one,
  // so this list is Companies only - Bank accounts are never valid for
  // Petty Cash. JH is the default.
  const [companies, setCompanies] = useState([]);
  const cashBookOptions = companies.map(c => ({ value: String(c.id), label: `${c.name} - Cash Book` }));

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const res = await api.get('/purchases/companies');
        const companiesData = res.data || [];
        setCompanies(companiesData);
        const jh = companiesData.find(c => (c.name || '').toUpperCase() === 'JH');
        if (jh) {
          setReimbursementForm(prev => (prev.company_id ? prev : { ...prev, company_id: String(jh.id) }));
        }
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };
    loadCompanies();
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
    if (!reimbursementForm.company_id) {
      showPopup('error', 'Please select a Cash Book');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        reference_number: reimbursementForm.reference_number,
        reimbursement_date: reimbursementForm.date,
        amount: parseFloat(reimbursementForm.amount),
        company_id: reimbursementForm.company_id
      };

      await api.post('/expenses/petty-cash/reimbursement', payload);

      showPopup('success', 'Reimbursement recorded successfully');

      // Reset form
      const jh = companies.find(c => (c.name || '').toUpperCase() === 'JH');
      setReimbursementForm({
        date: new Date().toISOString().split('T')[0],
        reference_number: '',
        amount: '',
        company_id: jh ? String(jh.id) : ''
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
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>
            <FontAwesomeIcon icon={faMoneyBillWave} style={{ marginRight: '8px' }} />
            Petty Cash Reimbursement
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Record and manage petty cash reimbursements
          </p>
        </div>
      </header>

      <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
        <div style={{ fontSize: '48px', color: 'var(--color-primary)', opacity: 0.8 }}><FontAwesomeIcon icon={faMoneyBillWave} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>Current Balance</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--color-text-primary)', margin: 'var(--spacing-xs) 0' }}>Rs. {balance.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2xl)' }}>
        {/* Reimbursement Form */}
        <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
            <div>
              <FontAwesomeIcon icon={faReceipt} style={{ marginRight: '8px' }} />
              Record Reimbursement
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchReimbursementData}
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
          </div>

          <form onSubmit={handleReimbursementSubmit}>
            <div className="form-grid two-col">
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
            <div className="form-grid two-col">
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
                <label htmlFor="company_id">Cash Book *</label>
                <select
                  id="company_id"
                  name="company_id"
                  value={reimbursementForm.company_id}
                  onChange={handleReimbursementChange}
                  required
                >
                  <option value="">Select Cash Book</option>
                  {cashBookOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setReimbursementForm({
                  date: new Date().toISOString().split('T')[0],
                  reference_number: '',
                  amount: ''
                })}
              >
                <FontAwesomeIcon icon={faTimes} /> Clear
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                {isLoading ? 'Recording...' : 'Record Reimbursement'}
              </button>
            </div>
          </form>
        </div>

        {/* Reimbursements History */}
        <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
            <div>
              <FontAwesomeIcon icon={faHistory} style={{ marginRight: '8px' }} />
              Reimbursement History
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
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