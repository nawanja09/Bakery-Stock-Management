// src/components/Expenses/PettyCash.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faTimes, 
  faPlus, 
  faHistory,
  faMoneyBillWave,
  faReceipt,
  faPrint,
  faFileExcel,
  faEye,
  faSync,
  faSpinner,
  faEdit
} from '@fortawesome/free-solid-svg-icons';
import './Expenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const PettyCash = () => {
  const [activeTab, setActiveTab] = useState('voucher');
  const [balance, setBalance] = useState(0);
  const [balanceData, setBalanceData] = useState({ totalReimbursements: 0, totalVouchers: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [vouchers, setVouchers] = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const navigate = useNavigate();
  const { showPopup } = usePopup();
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Voucher Form State
  const [voucherForm, setVoucherForm] = useState({
    date: new Date().toISOString().split('T')[0],
    voucher_number: '',
    employee_name: '',
    payee_name: '',
    expense_type: '',
    description: '',
    vehicle_number: '',
    amount: '',
    receipt_no: ''
  });

  // Reimbursement Form State
  const [reimbursementForm, setReimbursementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference_number: '',
    amount: ''
  });

  const expenseTypes = [
    'Travel',
    'Stationery',
    'Refreshments',
    'Transport',
    'Vehicle Maintenance',
    'Office Supplies',
    'Miscellaneous',
    'Staff Welfare',
    'Cleaning',
    'Repairs',
    'Utilities',
    'Entertainment'
  ];

  // Generate voucher number automatically
  const generateVoucherNumber = async () => {
    try {
      const response = await api.get('/expenses/petty-cash/next-voucher-number');
      if (response.data.voucher_number) {
        setVoucherForm(prev => ({ ...prev, voucher_number: response.data.voucher_number }));
      } else {
        // Fallback: generate client-side
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const count = vouchers.length + 1;
        const newVoucherNo = `PC-${year}${month}-${String(count).padStart(4, '0')}`;
        setVoucherForm(prev => ({ ...prev, voucher_number: newVoucherNo }));
      }
    } catch (error) {
      // Generate fallback voucher number
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const count = vouchers.length + 1;
      const newVoucherNo = `PC-${year}${month}-${String(count).padStart(4, '0')}`;
      setVoucherForm(prev => ({ ...prev, voucher_number: newVoucherNo }));
    }
  };

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
  const fetchPettyCashData = async () => {
    setIsFetching(true);
    try {
      // Fetch petty cash balance
      const balanceRes = await api.get('/expenses/petty-cash/balance');
      setBalance(balanceRes.data.balance || 0);
      setBalanceData(balanceRes.data);

      // Fetch vouchers from database
      const vouchersRes = await api.get('/expenses/petty-cash/vouchers');
      setVouchers(vouchersRes.data || []);

      // Fetch reimbursements from database
      const reimbursementRes = await api.get('/expenses/petty-cash/reimbursements');
      setReimbursements(reimbursementRes.data || []);
    } catch (error) {
      console.error('Error fetching petty cash data:', error);
      showPopup('error', 'Failed to load data from server');
    } finally {
      setIsFetching(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchPettyCashData();
  }, []);

  // Generate voucher number when voucher tab opens and no voucher number exists
  useEffect(() => {
    if (activeTab === 'voucher' && !voucherForm.voucher_number) {
      generateVoucherNumber();
    }
  }, [activeTab]);

  // Generate reference number when reimbursement tab opens
  useEffect(() => {
    if (activeTab === 'reimbursement' && !reimbursementForm.reference_number) {
      generateReferenceNumber();
    }
  }, [activeTab]);

  const handleVoucherChange = (e) => {
    const { name, value } = e.target;
    setVoucherForm(prev => ({ ...prev, [name]: value }));
  };

  const handleReimbursementChange = (e) => {
    const { name, value } = e.target;
    setReimbursementForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEdit = (voucher) => {
    setIsEditing(true);
    setEditingId(voucher.id);
    setVoucherForm({
      date: voucher.date || (voucher.voucher_date ? new Date(voucher.voucher_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      voucher_number: voucher.voucher_number,
      employee_name: voucher.employee_name || '',
      payee_name: voucher.payee_name || voucher.payee || '',
      expense_type: voucher.expense_type,
      description: voucher.description || '',
      vehicle_number: voucher.vehicle_number || '',
      amount: voucher.amount,
      receipt_no: voucher.receipt_no || ''
    });
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingId(null);
    setVoucherForm({
      date: new Date().toISOString().split('T')[0],
      voucher_number: '',
      employee_name: '',
      payee_name: '',
      expense_type: '',
      description: '',
      vehicle_number: '',
      amount: ''
    });
    generateVoucherNumber();
  };

  // Submit Voucher to Database
  const handleVoucherSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!voucherForm.voucher_number) {
      showPopup('error', 'Voucher number is required');
      return;
    }
    if (!voucherForm.payee_name) {
      showPopup('error', 'Payee name is required');
      return;
    }
    if (!voucherForm.expense_type) {
      showPopup('error', 'Expense type is required');
      return;
    }
    if (!voucherForm.amount || parseFloat(voucherForm.amount) <= 0) {
      showPopup('error', 'Valid amount is required');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        voucher_number: voucherForm.voucher_number,
        voucher_date: voucherForm.date,
        employee_name: voucherForm.employee_name || null,
        payee_name: voucherForm.payee_name,
        expense_type: voucherForm.expense_type,
        description: voucherForm.description || null,
        vehicle_number: voucherForm.vehicle_number || null,
        amount: parseFloat(voucherForm.amount),
        receipt_no: voucherForm.receipt_no || null
      };

      let response;
      if (isEditing) {
        response = await api.put(`/expenses/petty-cash/voucher/${editingId}`, payload);
      } else {
        response = await api.post('/expenses/petty-cash/voucher', payload);
      }
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', isEditing ? 'Voucher updated successfully!' : 'Petty cash voucher created successfully!');
        
        // Reset form
        setIsEditing(false);
        setEditingId(null);
        setVoucherForm({
          date: new Date().toISOString().split('T')[0],
          voucher_number: '',
          employee_name: '',
          payee_name: '',
          expense_type: '',
          description: '',
          vehicle_number: '',
          amount: '',
          receipt_no: ''
        });
        
        // Refresh all data
        await fetchPettyCashData();
        
        // Generate new voucher number for next entry if not editing
        if (!isEditing) {
          await generateVoucherNumber();
        }
      } else {
        showPopup('error', response.data.error || `Failed to ${isEditing ? 'update' : 'create'} voucher`);
      }
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} voucher:`, error);
      if (error.response?.data?.error) {
        showPopup('error', error.response.data.error);
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
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

      const response = await api.post('/expenses/petty-cash/reimbursement', payload);
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', 'Reimbursement recorded successfully!');
        
        // Reset form
        setReimbursementForm({
          date: new Date().toISOString().split('T')[0],
          reference_number: '',
          amount: ''
        });
        
        // Refresh all data
        await fetchPettyCashData();
        
        // Generate new reference number for next entry
        await generateReferenceNumber();
      } else {
        showPopup('error', response.data.error || 'Failed to record reimbursement');
      }
    } catch (error) {
      console.error('Error recording reimbursement:', error);
      if (error.response?.data?.error) {
        showPopup('error', error.response.data.error);
      } else {
        showPopup('error', 'Network error. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'LKR 0.00';
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-LK');
  };

  return (
    <div className="expenses-container">
      <div className="expenses-header">
        <h1 className="expenses-title">
          <FontAwesomeIcon icon={faMoneyBillWave} className="title-icon" />
          Petty Cash Management
        </h1>
      </div>

      {/* Petty Cash Balance Card */}
      <div className="balance-card">
        <div className="balance-icon">
          <FontAwesomeIcon icon={faMoneyBillWave} />
        </div>
        <div className="balance-info">
          <div className="balance-label">Current Petty Cash Balance</div>
          <div className="balance-amount">{formatCurrency(balance)}</div>
          <div className="balance-breakdown">
            <span className="breakdown-item">
              Total Reimbursement: <strong>{formatCurrency(balanceData.totalReimbursements || 0)}</strong>
            </span>
            <span className="breakdown-separator">|</span>
            <span className="breakdown-item">
              Total Vouchers: <strong>{formatCurrency(balanceData.totalVouchers || 0)}</strong>
            </span>
          </div>
        </div>
        <div className="balance-stats">
          <button 
            className="icon-btn refresh-btn" 
            onClick={fetchPettyCashData}
            disabled={isFetching}
            title="Refresh Balance"
            style={{ 
              background: 'rgba(255,255,255,0.2)', 
              color: 'white', 
              border: 'none',
              width: '40px',
              height: '40px',
              borderRadius: '50%'
            }}
          >
            <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="expenses-tabs">
        <button 
          className={`tab-button ${activeTab === 'voucher' ? 'active' : ''}`}
          onClick={() => setActiveTab('voucher')}
        >
          <FontAwesomeIcon icon={faReceipt} />
          Petty Cash Voucher
        </button>
        <button 
          className={`tab-button ${activeTab === 'reimbursement' ? 'active' : ''}`}
          onClick={() => setActiveTab('reimbursement')}
        >
          <FontAwesomeIcon icon={faHistory} />
          Reimbursement
        </button>
      </div>

      {/* Petty Cash Voucher Form */}
      {activeTab === 'voucher' && (
        <div className="expenses-form-container">
          <div className="form-card">
            <h3 className="form-title">
              <FontAwesomeIcon icon={isEditing ? faEdit : faPlus} />
              {isEditing ? 'Edit Petty Cash Voucher' : 'New Petty Cash Voucher'}
            </h3>
            
            <form onSubmit={handleVoucherSubmit} className="expenses-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Date <span className="required">*</span></label>
                  <input
                    type="date"
                    name="date"
                    value={voucherForm.date}
                    onChange={handleVoucherChange}
                    required
                    className="form-input"
                  />
                </div>
                
                <div className="form-group">
                  <label>Voucher Number <span className="required">*</span></label>
                  <input
                    type="text"
                    name="voucher_number"
                    value={voucherForm.voucher_number}
                    onChange={handleVoucherChange}
                    required
                    className="form-input"
                    placeholder="Auto-generated"
                    readOnly
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Employee Name</label>
                  <input
                    type="text"
                    name="employee_name"
                    value={voucherForm.employee_name}
                    onChange={handleVoucherChange}
                    className="form-input"
                    placeholder="Enter employee name (optional)"
                  />
                </div>
                
                <div className="form-group">
                  <label>Payee Name <span className="required">*</span></label>
                  <input
                    type="text"
                    name="payee_name"
                    value={voucherForm.payee_name}
                    onChange={handleVoucherChange}
                    required
                    className="form-input"
                    placeholder="Enter payee name"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Expenses Type <span className="required">*</span></label>
                  <select
                    name="expense_type"
                    value={voucherForm.expense_type}
                    onChange={handleVoucherChange}
                    required
                    className="form-select"
                  >
                    <option value="">Select Expense Type</option>
                    {expenseTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Vehicle Number</label>
                  <input
                    type="text"
                    name="vehicle_number"
                    value={voucherForm.vehicle_number}
                    onChange={handleVoucherChange}
                    className="form-input"
                    placeholder="If applicable"
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label>Description</label>
                <textarea
                  name="description"
                  value={voucherForm.description}
                  onChange={handleVoucherChange}
                  className="form-textarea"
                  rows="3"
                  placeholder="Enter description (optional)"
                />
              </div>

              <div className="form-group full-width">
                <label>Amount (LKR) <span className="required">*</span></label>
                <input
                  type="number"
                  name="amount"
                  value={voucherForm.amount}
                  onChange={handleVoucherChange}
                  required
                  min="0.01"
                  step="0.01"
                  className="form-input amount-input"
                  placeholder="0.00"
                />
              </div>

              <div className="form-group full-width">
                <label>Receipt Number</label>
                <input
                  type="text"
                  name="receipt_no"
                  value={voucherForm.receipt_no}
                  onChange={handleVoucherChange}
                  className="form-input"
                  placeholder="Enter receipt number (if any)"
                />
              </div>

              <div className="form-actions">
                <button 
                   type="button" 
                   onClick={isEditing ? handleCancelEdit : () => {
                    setVoucherForm({
                      date: new Date().toISOString().split('T')[0],
                      voucher_number: '',
                      employee_name: '',
                      payee_name: '',
                      expense_type: '',
                      description: '',
                      vehicle_number: '',
                      amount: ''
                    });
                    generateVoucherNumber();
                  }}
                  className="btn-secondary"
                  disabled={isLoading}
                >
                  <FontAwesomeIcon icon={faTimes} />
                  {isEditing ? 'Cancel' : 'Clear'}
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isLoading}
                >
                  <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                  {isLoading ? (isEditing ? 'Updating...' : 'Submitting...') : (isEditing ? 'Update Voucher' : 'Submit Voucher')}
                </button>
              </div>
            </form>
          </div>

          {/* Recent Vouchers Table - Data from Database */}
          <div className="history-section">
            <div className="history-header">
              <h3>Recent Vouchers</h3>
              <div className="history-actions">
                <button 
                  className="icon-btn" 
                  title="Refresh"
                  onClick={fetchPettyCashData}
                  disabled={isFetching}
                >
                  <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
                </button>
                <button className="icon-btn" title="Print">
                  <FontAwesomeIcon icon={faPrint} />
                </button>
                <button className="icon-btn" title="Export to Excel">
                  <FontAwesomeIcon icon={faFileExcel} />
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher No.</th>
                    <th>Payee</th>
                    <th>Expense Type</th>
                    <th>Receipt No.</th>
                    <th>Amount (LKR)</th>
                    <th>Actions</th>
                   </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr>
                      <td colSpan="6" className="loading-row">
                        <FontAwesomeIcon icon={faSpinner} spin /> Loading vouchers...
                      </td>
                    </tr>
                  ) : vouchers.length > 0 ? (
                    vouchers.map(voucher => (
                      <tr key={voucher.id}>
                        <td>{formatDate(voucher.voucher_date || voucher.date)}</td>
                        <td className="voucher-number">{voucher.voucher_number}</td>
                        <td>{voucher.payee_name || voucher.payee}</td>
                        <td>{voucher.expense_type}</td>
                        <td className="receipt-no">{voucher.receipt_no || '-'}</td>
                        <td className="amount-cell">{formatCurrency(voucher.amount)}</td>
                        <td>
                          <div className="action-buttons">
                            <button className="action-btn view-btn" title="View Details">
                              <FontAwesomeIcon icon={faEye} />
                            </button>
                            <button 
                              className="action-btn edit-btn" 
                              title="Edit Voucher"
                              onClick={() => handleEdit(voucher)}
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="empty-row">No vouchers found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reimbursement Form */}
      {activeTab === 'reimbursement' && (
        <div className="expenses-form-container">
          <div className="form-card">
            <h3 className="form-title">
              <FontAwesomeIcon icon={faHistory} />
              New Reimbursement
            </h3>
            
            <form onSubmit={handleReimbursementSubmit} className="expenses-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Date <span className="required">*</span></label>
                  <input
                    type="date"
                    name="date"
                    value={reimbursementForm.date}
                    onChange={handleReimbursementChange}
                    required
                    className="form-input"
                  />
                </div>
                
                <div className="form-group">
                  <label>Reference Number <span className="required">*</span></label>
                  <input
                    type="text"
                    name="reference_number"
                    value={reimbursementForm.reference_number}
                    onChange={handleReimbursementChange}
                    required
                    className="form-input"
                    placeholder="Auto-generated"
                    readOnly
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label>Amount (LKR) <span className="required">*</span></label>
                <input
                  type="number"
                  name="amount"
                  value={reimbursementForm.amount}
                  onChange={handleReimbursementChange}
                  required
                  min="0.01"
                  step="0.01"
                  className="form-input amount-input"
                  placeholder="0.00"
                />
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={() => {
                    setReimbursementForm({
                      date: new Date().toISOString().split('T')[0],
                      reference_number: '',
                      amount: ''
                    });
                    generateReferenceNumber();
                  }}
                  className="btn-secondary"
                  disabled={isLoading}
                >
                  <FontAwesomeIcon icon={faTimes} />
                  Clear
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isLoading}
                >
                  <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                  {isLoading ? 'Submitting...' : 'Submit Reimbursement'}
                </button>
              </div>
            </form>
          </div>

          {/* Reimbursement Details Table - Data from Database */}
          <div className="history-section">
            <div className="history-header">
              <h3>Reimbursement Details</h3>
              <div className="history-actions">
                <button 
                  className="icon-btn" 
                  title="Refresh"
                  onClick={fetchPettyCashData}
                >
                  <FontAwesomeIcon icon={faSync} />
                </button>
              </div>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference Number</th>
                    <th>Amount (LKR)</th>
                    <th>Status</th>
                    <th>Actions</th>
                   </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr>
                      <td colSpan="5" className="loading-row">
                        <FontAwesomeIcon icon={faSpinner} spin /> Loading reimbursements...
                      </td>
                    </tr>
                  ) : reimbursements.length > 0 ? (
                    reimbursements.map(reimbursement => (
                      <tr key={reimbursement.id}>
                        <td>{formatDate(reimbursement.reimbursement_date || reimbursement.date)}</td>
                        <td className="reference-number">{reimbursement.reference_number}</td>
                        <td className="amount-cell">{formatCurrency(reimbursement.amount)}</td>
                        <td>
                          <span className={`status-badge status-${(reimbursement.status || 'Completed').toLowerCase()}`}>
                            {reimbursement.status || 'Completed'}
                          </span>
                        </td>
                        <td>
                          <button className="action-btn view-btn" title="View Details">
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="empty-row">No reimbursements found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PettyCash;