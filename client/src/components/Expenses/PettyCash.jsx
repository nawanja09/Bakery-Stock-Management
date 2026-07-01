// src/components/Expenses/PettyCash.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, faTimes, faPlus, faHistory, faMoneyBillWave, faReceipt,
  faPrint, faFileExcel, faEye, faSync, faSpinner, faEdit, faTrash, faInfoCircle
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
  const { showPopup } = usePopup();
  const [isEditing, setIsEditing] = useState(false);
  const [user, setUser] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [suggestedVoucherNo, setSuggestedVoucherNo] = useState('');
  const [suggestedReferenceNo, setSuggestedReferenceNo] = useState('');
  const [isEditingReimbursement, setIsEditingReimbursement] = useState(false);
  const [editingReimbursementId, setEditingReimbursementId] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedReimbursement, setSelectedReimbursement] = useState(null);

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

  const [reimbursementForm, setReimbursementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference_number: '',
    amount: ''
  });

  const expenseTypes = [
    'Travel', 'Stationery', 'Refreshments', 'Transport', 'Vehicle Maintenance',
    'Office Supplies', 'Miscellaneous', 'Staff Welfare', 'Cleaning', 'Repairs',
    'Utilities', 'Entertainment'
  ];

  // Helper to get user role directly from localStorage (fallback)
  const getUserRole = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        return parsed.role;
      } catch(e) { return null; }
    }
    return null;
  };

  const fetchVoucherSuggestion = useCallback(async () => {
    try {
      const response = await api.get('/expenses/petty-cash/next-voucher-number');
      if (response.data.voucher_number) setSuggestedVoucherNo(response.data.voucher_number);
    } catch (error) { console.error('Error fetching voucher suggestion:', error); }
  }, []);

  const fetchReferenceSuggestion = useCallback(async () => {
    try {
      const response = await api.get('/expenses/petty-cash/next-reference-number');
      if (response.data.reference_number) setSuggestedReferenceNo(response.data.reference_number);
    } catch (error) { console.error('Error fetching reference suggestion:', error); }
  }, []);

  const fetchPettyCashData = useCallback(async () => {
    setIsFetching(true);
    try {
      const balanceRes = await api.get('/expenses/petty-cash/balance');
      setBalance(balanceRes.data.balance || 0);
      setBalanceData(balanceRes.data);
      const vouchersRes = await api.get('/expenses/petty-cash/vouchers');
      setVouchers(vouchersRes.data || []);
      const reimbursementRes = await api.get('/expenses/petty-cash/reimbursements');
      setReimbursements(reimbursementRes.data || []);
    } catch (error) {
      console.error('Error fetching petty cash data:', error);
      showPopup('error', 'Failed to load data from server');
    } finally {
      setIsFetching(false);
    }
  }, [showPopup]);

  useEffect(() => {
    const loggedInUser = localStorage.getItem('user');
    if (loggedInUser) {
      try {
        const parsed = JSON.parse(loggedInUser);
        setUser(parsed);
        console.log('✅ User loaded from localStorage:', parsed); // Debug log
      } catch (e) {
        console.error('Error parsing user:', e);
      }
    } else {
      console.warn('⚠️ No user found in localStorage');
    }
  }, []);

  useEffect(() => { fetchPettyCashData(); }, [fetchPettyCashData]);
  useEffect(() => {
    if (activeTab === 'voucher') fetchVoucherSuggestion();
    else if (activeTab === 'reimbursement') fetchReferenceSuggestion();
  }, [activeTab, fetchVoucherSuggestion, fetchReferenceSuggestion]);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingId(null);
    setVoucherForm({
      date: new Date().toISOString().split('T')[0],
      voucher_number: '', employee_name: '', payee_name: '', expense_type: '',
      description: '', vehicle_number: '', amount: '', receipt_no: ''
    });
    fetchVoucherSuggestion();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this voucher?')) {
      setIsLoading(true);
      try {
        const response = await api.delete(`/expenses/petty-cash/voucher/${id}`);
        if (response.status === 200 || response.status === 204) {
          showPopup('success', 'Petty cash voucher deleted successfully!');
          await fetchPettyCashData();
        } else {
          showPopup('error', response.data?.error || 'Failed to delete voucher');
        }
      } catch (error) {
        console.error('Error deleting voucher:', error);
        showPopup('error', error.response?.data?.error || 'Failed to delete voucher');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleVoucherSubmit = async (e) => {
    e.preventDefault();
    if (!voucherForm.voucher_number || !voucherForm.payee_name || !voucherForm.expense_type || !voucherForm.amount || parseFloat(voucherForm.amount) <= 0) {
      showPopup('error', 'Please fill all required fields with valid amount');
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
      if (isEditing) response = await api.put(`/expenses/petty-cash/voucher/${editingId}`, payload);
      else response = await api.post('/expenses/petty-cash/voucher', payload);
      if (response.status === 201 || response.status === 200) {
        showPopup('success', isEditing ? 'Voucher updated successfully!' : 'Petty cash voucher created successfully!');
        handleCancelEdit();
        await fetchPettyCashData();
        await fetchVoucherSuggestion();
      } else showPopup('error', response.data.error || `Failed to ${isEditing ? 'update' : 'create'} voucher`);
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Network error. Please try again.');
    } finally { setIsLoading(false); }
  };

  const handleReimbursementSubmit = async (e) => {
    e.preventDefault();
    if (!reimbursementForm.reference_number || !reimbursementForm.amount || parseFloat(reimbursementForm.amount) <= 0) {
      showPopup('error', 'Reference number and valid amount are required');
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        reference_number: reimbursementForm.reference_number,
        reimbursement_date: reimbursementForm.date,
        amount: parseFloat(reimbursementForm.amount)
      };
      let response;
      if (isEditingReimbursement) {
        response = await api.put(`/expenses/petty-cash/reimbursement/${editingReimbursementId}`, payload);
      } else {
        response = await api.post('/expenses/petty-cash/reimbursement', payload);
      }
      if (response.status === 201 || response.status === 200) {
        showPopup('success', isEditingReimbursement ? 'Reimbursement updated successfully!' : 'Reimbursement recorded successfully!');
        setIsEditingReimbursement(false);
        setEditingReimbursementId(null);
        setReimbursementForm({ date: new Date().toISOString().split('T')[0], reference_number: '', amount: '' });
        await fetchPettyCashData();
        await fetchReferenceSuggestion();
      } else showPopup('error', response.data.error || 'Failed to save reimbursement');
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Network error. Please try again.');
    } finally { setIsLoading(false); }
  };

  const handleEditReimbursement = (reimbursement) => {
    setIsEditingReimbursement(true);
    setEditingReimbursementId(reimbursement.id);
    setReimbursementForm({
      date: reimbursement.reimbursement_date || reimbursement.date,
      reference_number: reimbursement.reference_number,
      amount: reimbursement.amount.toString()
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditReimbursement = () => {
    setIsEditingReimbursement(false);
    setEditingReimbursementId(null);
    setReimbursementForm({ date: new Date().toISOString().split('T')[0], reference_number: '', amount: '' });
    fetchReferenceSuggestion();
  };

  const handleViewReimbursement = (reimbursement) => {
    setSelectedReimbursement(reimbursement);
    setShowViewModal(true);
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'LKR 0.00';
    return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-LK');
  };

  const handlePrintVouchers = () => {
    const printContent = document.getElementById('vouchers-table-container');
    if (!printContent) { showPopup('error', 'No data to print'); return; }
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>Petty Cash Vouchers</title>
      <style>body{font-family:Arial;margin:20px;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f2f2f2;}</style>
      </head><body><h2>Petty Cash Vouchers</h2>${printContent.cloneNode(true).outerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  };

  const handleExportVouchers = () => {
    if (!vouchers.length) { showPopup('error', 'No voucher data to export'); return; }
    const headers = ['Date', 'Voucher No.', 'Payee', 'Expense Type', 'Receipt No.', 'Amount (LKR)'];
    const rows = vouchers.map(v => [formatDate(v.voucher_date || v.date), v.voucher_number, v.payee_name || v.payee, v.expense_type, v.receipt_no || '-', v.amount]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `petty_cash_vouchers_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Determine if user is admin (case-insensitive, with fallback)
  const isAdmin = () => {
    const role = user?.role || getUserRole();
    return role && role.toLowerCase() === 'admin';
  };

  return (
    <div className="expenses-container">
      <div className="expenses-header">
        <h1 className="expenses-title"><FontAwesomeIcon icon={faMoneyBillWave} className="title-icon" /> Petty Cash Management</h1>
      </div>

      <div className="balance-card">
        <div className="balance-icon"><FontAwesomeIcon icon={faMoneyBillWave} /></div>
        <div className="balance-info">
          <div className="balance-label">Current Petty Cash Balance</div>
          <div className="balance-amount">{formatCurrency(balance)}</div>
          <div className="balance-breakdown">
            <span className="breakdown-item">Total Reimbursement: <strong>{formatCurrency(balanceData.totalReimbursements || 0)}</strong></span>
            <span className="breakdown-separator">|</span>
            <span className="breakdown-item">Total Vouchers: <strong>{formatCurrency(balanceData.totalVouchers || 0)}</strong></span>
          </div>
        </div>
        <div className="balance-stats">
          <button className="icon-btn refresh-btn" onClick={fetchPettyCashData} disabled={isFetching} title="Refresh Balance" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', width: '40px', height: '40px', borderRadius: '50%' }}>
            <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
          </button>
        </div>
      </div>

      <div className="expenses-tabs">
        <button className={`tab-button ${activeTab === 'voucher' ? 'active' : ''}`} onClick={() => setActiveTab('voucher')}><FontAwesomeIcon icon={faReceipt} /> Petty Cash Voucher</button>
        <button className={`tab-button ${activeTab === 'reimbursement' ? 'active' : ''}`} onClick={() => setActiveTab('reimbursement')}><FontAwesomeIcon icon={faHistory} /> Reimbursement</button>
      </div>

      {activeTab === 'voucher' && (
        <div className="expenses-form-container">
          <div className="form-card">
            <h3 className="form-title"><FontAwesomeIcon icon={isEditing ? faEdit : faPlus} /> {isEditing ? 'Edit Petty Cash Voucher' : 'New Petty Cash Voucher'}</h3>
            <form onSubmit={handleVoucherSubmit} className="expenses-form">
              <div className="form-row">
                <div className="form-group"><label>Date <span className="required">*</span></label><input type="date" name="date" value={voucherForm.date} onChange={handleVoucherChange} required className="form-input" /></div>
                <div className="form-group"><label>Voucher Number <span className="required">*</span></label><div className="input-with-button"><input type="text" name="voucher_number" value={voucherForm.voucher_number} onChange={handleVoucherChange} required className="form-input" placeholder="Enter voucher number" /></div></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Employee Name</label><input type="text" name="employee_name" value={voucherForm.employee_name} onChange={handleVoucherChange} className="form-input" placeholder="Optional" /></div>
                <div className="form-group"><label>Payee Name <span className="required">*</span></label><input type="text" name="payee_name" value={voucherForm.payee_name} onChange={handleVoucherChange} required className="form-input" placeholder="Enter payee name" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Expenses Type <span className="required">*</span></label><select name="expense_type" value={voucherForm.expense_type} onChange={handleVoucherChange} required className="form-select"><option value="">Select Expense Type</option>{expenseTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
                <div className="form-group"><label>Vehicle Number</label><input type="text" name="vehicle_number" value={voucherForm.vehicle_number} onChange={handleVoucherChange} className="form-input" placeholder="If applicable" /></div>
              </div>
              <div className="form-group full-width"><label>Description</label><textarea name="description" value={voucherForm.description} onChange={handleVoucherChange} className="form-textarea" rows="3" placeholder="Optional" /></div>
              <div className="form-row">
                <div className="form-group"><label>Amount (LKR) <span className="required">*</span></label><input type="number" name="amount" value={voucherForm.amount} onChange={handleVoucherChange} required min="0.01" step="0.01" className="form-input amount-input" placeholder="0.00" /></div>
                <div className="form-group"><label>Receipt Number</label><input type="text" name="receipt_no" value={voucherForm.receipt_no} onChange={handleVoucherChange} className="form-input" placeholder="Optional" /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={isEditing ? handleCancelEdit : () => setVoucherForm({ date: new Date().toISOString().split('T')[0], voucher_number: '', employee_name: '', payee_name: '', expense_type: '', description: '', vehicle_number: '', amount: '', receipt_no: '' })} className="btn-secondary" disabled={isLoading}><FontAwesomeIcon icon={faTimes} /> {isEditing ? 'Cancel' : 'Clear'}</button>
                <button type="submit" className="btn-primary" disabled={isLoading}><FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} /> {isLoading ? (isEditing ? 'Updating...' : 'Submitting...') : (isEditing ? 'Update Voucher' : 'Submit Voucher')}</button>
              </div>
            </form>
          </div>

          <div className="history-section">
            <div className="history-header"><h3>Recent Vouchers</h3><div className="history-actions"><button className="icon-btn" onClick={fetchPettyCashData} disabled={isFetching}><FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} /></button><button className="icon-btn" onClick={handlePrintVouchers}><FontAwesomeIcon icon={faPrint} /></button><button className="icon-btn" onClick={handleExportVouchers}><FontAwesomeIcon icon={faFileExcel} /></button></div></div>
            <div className="table-container" id="vouchers-table-container">
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Voucher No.</th><th>Payee</th><th>Expense Type</th><th>Receipt No.</th><th>Amount (LKR)</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr><td colSpan="7" className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading vouchers...</td></tr>
                  ) : vouchers.length > 0 ? (
                    vouchers.map(v => (
                      <tr key={v.id}>
                        <td>{formatDate(v.voucher_date || v.date)}</td>
                        <td className="voucher-number">{v.voucher_number}</td>
                        <td>{v.payee_name || v.payee}</td>
                        <td>{v.expense_type}</td>
                        <td className="receipt-no">{v.receipt_no || '-'}</td>
                        <td className="amount-cell">{formatCurrency(v.amount)}</td>
                        <td>
                          <div className="action-buttons">
                            <button className="action-btn view-btn" title="View"><FontAwesomeIcon icon={faEye} /></button>
                            <button className="action-btn edit-btn" title="Edit" onClick={() => handleEdit(v)}><FontAwesomeIcon icon={faEdit} /></button>
                            {/* ✅ Fixed: case‑insensitive admin check with fallback */}
                            {isAdmin() && (
                              <button className="action-btn delete-btn" title="Delete" onClick={() => handleDelete(v.id)}>
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="7" className="empty-row">No vouchers found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      
      {/* Reimbursement Tab */}
      {activeTab === 'reimbursement' && (
        <div className="expenses-form-container">
          <div className="form-card">
            <h3 className="form-title"><FontAwesomeIcon icon={isEditingReimbursement ? faEdit : faHistory} /> {isEditingReimbursement ? 'Edit Reimbursement' : 'New Reimbursement'}</h3>
            <form onSubmit={handleReimbursementSubmit} className="expenses-form">
              <div className="form-row">
                <div className="form-group"><label>Date <span className="required">*</span></label><input type="date" name="date" value={reimbursementForm.date} onChange={handleReimbursementChange} required className="form-input" /></div>
                <div className="form-group"><label>Reference Number <span className="required">*</span></label><div className="input-with-button"><input type="text" name="reference_number" value={reimbursementForm.reference_number} onChange={handleReimbursementChange} required className="form-input" placeholder="Enter reference number" /></div></div>
              </div>
              <div className="form-row"><div className="form-group left-align"><label>Amount (LKR) <span className="required">*</span></label><input type="number" name="amount" value={reimbursementForm.amount} onChange={handleReimbursementChange} required min="0.01" step="0.01" className="form-input amount-input" placeholder="0.00" /></div></div>
              <div className="form-actions">
                {isEditingReimbursement && <button type="button" onClick={handleCancelEditReimbursement} className="btn-secondary" disabled={isLoading}><FontAwesomeIcon icon={faTimes} /> Cancel</button>}
                <button type="button" onClick={() => setReimbursementForm({ date: new Date().toISOString().split('T')[0], reference_number: '', amount: '' })} className="btn-secondary" disabled={isLoading}><FontAwesomeIcon icon={faTimes} /> Clear</button>
                <button type="submit" className="btn-primary" disabled={isLoading}><FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} /> {isLoading ? 'Submitting...' : (isEditingReimbursement ? 'Update Reimbursement' : 'Submit Reimbursement')}</button>
              </div>
            </form>
          </div>

          <div className="history-section">
            <div className="history-header"><h3>Reimbursement Details</h3><div className="history-actions"><button className="icon-btn" onClick={fetchPettyCashData}><FontAwesomeIcon icon={faSync} /></button></div></div>
            <div className="table-container">
              <table className="data-table"><thead><tr><th>Date</th><th>Reference Number</th><th>Amount (LKR)</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {isFetching ? <tr><td colSpan="5" className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading reimbursements...</td></tr> : reimbursements.length > 0 ? reimbursements.map(r => (<tr key={r.id}><td>{formatDate(r.reimbursement_date || r.date)}</td><td className="reference-number">{r.reference_number}</td><td className="amount-cell">{formatCurrency(r.amount)}</td><td><span className={`status-badge status-${(r.status || 'Completed').toLowerCase()}`}>{r.status || 'Completed'}</span></td><td><div className="action-buttons"><button className="action-btn view-btn" title="View Details" onClick={() => handleViewReimbursement(r)}><FontAwesomeIcon icon={faEye} /></button><button className="action-btn edit-btn" title="Edit Reimbursement" onClick={() => handleEditReimbursement(r)}><FontAwesomeIcon icon={faEdit} /></button></div></td></tr>)) : <tr><td colSpan="5" className="empty-row">No reimbursements found</td></tr>}
              </tbody></table>
            </div>
          </div>
        </div>
      )}

      {/* View Modal for Reimbursement Details */}
      {showViewModal && selectedReimbursement && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><FontAwesomeIcon icon={faInfoCircle} /> Reimbursement Details</h3>
              <button className="modal-close" onClick={() => setShowViewModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-row"><strong>Reference Number:</strong> {selectedReimbursement.reference_number}</div>
              <div className="detail-row"><strong>Date:</strong> {formatDate(selectedReimbursement.reimbursement_date || selectedReimbursement.date)}</div>
              <div className="detail-row"><strong>Amount:</strong> {formatCurrency(selectedReimbursement.amount)}</div>
              <div className="detail-row"><strong>Status:</strong> <span className={`status-badge status-${(selectedReimbursement.status || 'Completed').toLowerCase()}`}>{selectedReimbursement.status || 'Completed'}</span></div>
              <div className="detail-row"><strong>Created Date:</strong> {selectedReimbursement.created_date || '-'}</div>
              {selectedReimbursement.updated_at && <div className="detail-row"><strong>Last Updated:</strong> {new Date(selectedReimbursement.updated_at).toLocaleString()}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowViewModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Simple CSS for modal */}
      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #e9ecef;
        }
        .modal-header h3 {
          margin: 0;
          color: #2c3e50;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #6c757d;
        }
        .modal-body {
          padding: 20px;
        }
        .detail-row {
          margin-bottom: 12px;
          padding: 6px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .modal-footer {
          padding: 16px 20px;
          border-top: 1px solid #e9ecef;
          text-align: right;
        }
      `}</style>
    </div>
  );
};

export default PettyCash;