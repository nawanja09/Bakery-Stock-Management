// src/components/Expenses/Reimbursement.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faTimes,
  faHistory,
  faMoneyBillWave,
  faReceipt,
  faPrint,
  faFileExcel,
  faEye,
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
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  // Reimbursement Form State
  const [reimbursementForm, setReimbursementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference_number: '',
    amount: ''
  });

  // Generate reference number for reimbursement
  const generateReferenceNumber = async () => {
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
  };

  // Fetch all data from database
  const fetchReimbursementData = async () => {
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
  };

  // Load data on component mount
  useEffect(() => {
    fetchReimbursementData();
  }, []);

  // Generate reference number on component mount
  useEffect(() => {
    if (!reimbursementForm.reference_number) {
      generateReferenceNumber();
    }
  }, []);

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

    setIsLoading(true);
    try {
      const payload = {
        reference_number: reimbursementForm.reference_number,
        reimbursement_date: reimbursementForm.date,
        amount: parseFloat(reimbursementForm.amount)
      };

      await api.post('/expenses/petty-cash/reimbursement', payload);

      showPopup('success', 'Reimbursement recorded successfully');

      // Reset form
      setReimbursementForm({
        date: new Date().toISOString().split('T')[0],
        reference_number: '',
        amount: ''
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
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {reimbursements.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="no-data">No reimbursements recorded yet</td>
                  </tr>
                ) : (
                  reimbursements.map((reimbursement) => (
                    <tr key={reimbursement.id}>
                      <td>{reimbursement.reference_number}</td>
                      <td>{reimbursement.date}</td>
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