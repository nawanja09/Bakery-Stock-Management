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
import useExpenseTypes, { withSavedOption, findExpenseTypeId } from './useExpenseTypes';

const RECENT_LIMIT = 10;

const PettyCash = () => {
  const [activeTab, setActiveTab] = useState('voucher');
  const [balance, setBalance] = useState(0);
  const [balanceData, setBalanceData] = useState({ totalReimbursements: 0, totalVouchers: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [reimbursements, setReimbursements] = useState([]);
  // Recent Vouchers table rows: vouchers (Credit) + reimbursements (Debit)
  // with a server-calculated running balance.
  const [transactions, setTransactions] = useState([]);
  // Optional Date Range for the Recent Vouchers table.
  // Empty = latest RECENT_LIMIT rows; set = every row in the range.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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
    expense_type_id: '',
    expense_type: '',
    sub_expense_type_id: '',
    sub_expense_type: '',
    description: '',
    vehicle_number: '',
    amount: '',
    receipt_no: '',
    company_id: ''
  });

  const [reimbursementForm, setReimbursementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference_number: '',
    amount: '',
    company_id: ''
  });

  // Cash Book = a Company's Cash account. Every company has exactly one,
  // so "select a Cash Book" and "select a Company" are the same choice -
  // Bank accounts are intentionally never offered here (Petty Cash is
  // Cash-only), so this list is Companies only.
  const [companies, setCompanies] = useState([]);
  const cashBookOptions = companies.map(c => ({ value: String(c.id), label: c.name }));

  const [payees, setPayees] = useState([]);

  // Expenses Type / Sub Expenses Type come from Expenses Type Management.
  // Sub types are loaded per selected Expenses Type.
  const { expenseTypes, subExpenseTypes, loadSubExpenseTypes, setSubExpenseTypes } = useExpenseTypes();

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
    if (fromDate && toDate && fromDate > toDate) {
      showPopup('error', 'From Date cannot be after To Date');
      return;
    }
    setIsFetching(true);
    try {
      const balanceRes = await api.get('/expenses/petty-cash/balance');
      setBalance(balanceRes.data.balance || 0);
      setBalanceData(balanceRes.data);
      const reimbursementRes = await api.get('/expenses/petty-cash/reimbursements');
      setReimbursements(reimbursementRes.data || []);
      // Combined Debit (Reimbursement) / Credit (Expenses) list with running
      // balance - always recalculated server-side from the full transaction
      // history, never edited here. No date range -> latest RECENT_LIMIT
      // rows; a date range returns every row in it (no limit).
      const hasRange = Boolean(fromDate || toDate);
      const transactionsRes = await api.get('/expenses/petty-cash/transactions', {
        params: hasRange
          ? { from_date: fromDate || undefined, to_date: toDate || undefined }
          : { limit: RECENT_LIMIT }
      });
      setTransactions(transactionsRes.data || []);
    } catch (error) {
      console.error('Error fetching petty cash data:', error);
      showPopup('error', 'Failed to load data from server');
    } finally {
      setIsFetching(false);
    }
  }, [showPopup, fromDate, toDate]);

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

  // Load Cash Book dropdown source (Companies only - Petty Cash never
  // touches a Bank account) and default both forms to JH.
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const res = await api.get('/purchases/companies');
        const companiesData = res.data || [];
        setCompanies(companiesData);

        // JH is the default Cash Book.
        const jh = companiesData.find(c => (c.name || '').toUpperCase() === 'JH');
        if (jh) {
          setReimbursementForm(prev => (prev.company_id ? prev : { ...prev, company_id: String(jh.id) }));
          setVoucherForm(prev => (prev.company_id ? prev : { ...prev, company_id: String(jh.id) }));
        }
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };
    loadCompanies();
  }, []);

  // Load the active Payees list (Payees table) so Payee Name is always
  // selected from real, managed payees rather than typed free-text.
  useEffect(() => {
    const loadPayees = async () => {
      try {
        const res = await api.get('/payees');
        setPayees((res.data || []).slice().sort((a, b) => (a.payee_name || '').localeCompare(b.payee_name || '')));
      } catch (error) {
        console.error('Error loading payees:', error);
      }
    };
    loadPayees();
  }, []);

  useEffect(() => {
    if (activeTab === 'voucher') fetchVoucherSuggestion();
    else if (activeTab === 'reimbursement') fetchReferenceSuggestion();
  }, [activeTab, fetchVoucherSuggestion, fetchReferenceSuggestion]);

  const handleVoucherChange = (e) => {
    const { name, value } = e.target;
    setVoucherForm(prev => ({ ...prev, [name]: value }));
  };

  // Changing the Expenses Type clears the Sub Expenses Type and loads only
  // that type's sub types.
  const handleExpenseTypeChange = (e) => {
    const id = e.target.value;
    const type = expenseTypes.find(t => String(t.id) === String(id));
    setVoucherForm(prev => ({
      ...prev,
      expense_type_id: id,
      expense_type: type ? type.name : '',
      sub_expense_type_id: '',
      sub_expense_type: ''
    }));
    loadSubExpenseTypes(id);
  };

  const handleSubExpenseTypeChange = (e) => {
    const id = e.target.value;
    const sub = subExpenseTypes.find(s => String(s.id) === String(id));
    setVoucherForm(prev => ({
      ...prev,
      sub_expense_type_id: id,
      sub_expense_type: sub ? sub.name : ''
    }));
  };

  const handleReimbursementChange = (e) => {
    const { name, value } = e.target;
    setReimbursementForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEdit = (voucher) => {
    setIsEditing(true);
    setEditingId(voucher.id);
    const savedTypeId = findExpenseTypeId(expenseTypes, voucher.expense_type_id, voucher.expense_type);
    loadSubExpenseTypes(savedTypeId);
    setVoucherForm({
      date: voucher.date || (voucher.voucher_date ? new Date(voucher.voucher_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
      voucher_number: voucher.voucher_number,
      employee_name: voucher.employee_name || '',
      payee_name: voucher.payee_name || voucher.payee || '',
      expense_type_id: savedTypeId,
      expense_type: voucher.expense_type,
      sub_expense_type_id: voucher.sub_expense_type_id ? String(voucher.sub_expense_type_id) : '',
      sub_expense_type: voucher.sub_expense_type || '',
      description: voucher.description || '',
      vehicle_number: voucher.vehicle_number || '',
      amount: voucher.amount,
      receipt_no: voucher.receipt_no || '',
      company_id: voucher.company_id ? String(voucher.company_id) : ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingId(null);
    const jh = companies.find(c => (c.name || '').toUpperCase() === 'JH');
    setSubExpenseTypes([]);
    setVoucherForm({
      date: new Date().toISOString().split('T')[0],
      voucher_number: '', employee_name: '', payee_name: '',
      expense_type_id: '', expense_type: '', sub_expense_type_id: '', sub_expense_type: '',
      description: '', vehicle_number: '', amount: '', receipt_no: '',
      company_id: jh ? String(jh.id) : ''
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
    if (!voucherForm.voucher_number || !voucherForm.payee_name || !voucherForm.expense_type_id || !voucherForm.amount || parseFloat(voucherForm.amount) <= 0) {
      showPopup('error', 'Please fill all required fields with valid amount');
      return;
    }
    if (subExpenseTypes.length > 0 && !voucherForm.sub_expense_type_id) {
      showPopup('error', 'Please select a Sub Expenses Type');
      return;
    }
    if (!isEditing && !voucherForm.company_id) {
      showPopup('error', 'Please select the Company for this voucher');
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        voucher_number: voucherForm.voucher_number,
        voucher_date: voucherForm.date,
        employee_name: voucherForm.employee_name || null,
        payee_name: voucherForm.payee_name,
        expense_type_id: voucherForm.expense_type_id,
        expense_type: voucherForm.expense_type,
        sub_expense_type_id: voucherForm.sub_expense_type_id || null,
        description: voucherForm.description || null,
        vehicle_number: voucherForm.vehicle_number || null,
        amount: parseFloat(voucherForm.amount),
        receipt_no: voucherForm.receipt_no || null
      };
      // Company is only set at creation time (used for per-company
      // reporting; it does not link to the Cash Ledger).
      if (!isEditing) {
        payload.company_id = voucherForm.company_id;
      }
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
    if (!isEditingReimbursement && !reimbursementForm.company_id) {
      showPopup('error', 'Please select a Company');
      return;
    }
    setIsLoading(true);
    try {
      const payload = {
        reference_number: reimbursementForm.reference_number,
        reimbursement_date: reimbursementForm.date,
        amount: parseFloat(reimbursementForm.amount)
      };

      // Company is only set at creation time (used for per-company
      // reporting; nothing is posted to the Cash Ledger).
      if (!isEditingReimbursement) {
        payload.company_id = reimbursementForm.company_id;
      }

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
        const jh = companies.find(c => (c.name || '').toUpperCase() === 'JH');
        setReimbursementForm({
          date: new Date().toISOString().split('T')[0],
          reference_number: '',
          amount: '',
          company_id: jh ? String(jh.id) : ''
        });
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
      amount: reimbursement.amount.toString(),
      company_id: reimbursement.company_id ? String(reimbursement.company_id) : ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditReimbursement = () => {
    setIsEditingReimbursement(false);
    setEditingReimbursementId(null);
    const jh = companies.find(c => (c.name || '').toUpperCase() === 'JH');
    setReimbursementForm({
      date: new Date().toISOString().split('T')[0],
      reference_number: '',
      amount: '',
      company_id: jh ? String(jh.id) : ''
    });
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
    if (!transactions.length) { showPopup('error', 'No voucher data to export'); return; }
    const headers = ['Date', 'Voucher / Reference No.', 'Payee', 'Expense Type', 'Sub Expense Type', 'Company', 'Receipt No.', 'Amount (LKR)', 'Debits - Reimbursement (LKR)', 'Credits - Expenses (LKR)', 'Balance (LKR)'];
    const rows = transactions.map(t => {
      const isReimb = t.source === 'REIMBURSEMENT';
      return [formatDate(t.date), t.reference_number, isReimb ? '-' : (t.payee_name || '-'), isReimb ? 'Reimbursement' : t.expense_type, isReimb ? '-' : (t.sub_expense_type || '-'), t.company_name || '-', t.receipt_no || '-', isReimb ? t.debit : t.credit, t.debit > 0 ? t.debit : '', t.credit > 0 ? t.credit : '', t.balance];
    });
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
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>
            <FontAwesomeIcon icon={faMoneyBillWave} style={{ marginRight: '8px' }} /> Petty Cash Expenses
          </h2>
        </div>
      </header>

      <div className="card" style={{ display: 'flex', alignItems: 'center', padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
        <div style={{ fontSize: '48px', color: 'var(--color-primary)', opacity: 0.8 }}><FontAwesomeIcon icon={faMoneyBillWave} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>Current Petty Cash Balance</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'var(--color-text-primary)', margin: 'var(--spacing-xs) 0' }}>{formatCurrency(balance)}</div>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={fetchPettyCashData} disabled={isFetching} title="Refresh Balance">
            <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} style={{ marginRight: '8px' }} /> Refresh
          </button>
        </div>
      </div>

      <div className="expense-view-tabs" style={{ display: 'flex', gap: '10px', marginBottom: 'var(--spacing-md)' }}>
        <button className={`btn ${activeTab === 'voucher' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('voucher')}><FontAwesomeIcon icon={faReceipt} style={{ marginRight: '8px' }} /> Petty Cash Voucher</button>
        <button className={`btn ${activeTab === 'reimbursement' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('reimbursement')}><FontAwesomeIcon icon={faHistory} style={{ marginRight: '8px' }} /> Reimbursement</button>
      </div>

      {activeTab === 'voucher' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2xl)' }}>
          <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
            <h3 className="form-section-title"><FontAwesomeIcon icon={isEditing ? faEdit : faPlus} /> {isEditing ? 'Edit Petty Cash Voucher' : 'New Petty Cash Voucher'}</h3>
            <form onSubmit={handleVoucherSubmit}>
              <div className="form-grid two-col">
                <div className="form-group"><label>Date <span className="required">*</span></label><input type="date" name="date" value={voucherForm.date} onChange={handleVoucherChange} required className="form-input" /></div>
                <div className="form-group"><label>Voucher Number <span className="required">*</span></label><div className="input-with-button"><input type="text" name="voucher_number" value={voucherForm.voucher_number} onChange={handleVoucherChange} required className="form-input" placeholder="Enter voucher number" /></div></div>
              </div>
              <div className="form-grid two-col">
                <div className="form-group"><label>Employee Name</label><input type="text" name="employee_name" value={voucherForm.employee_name} onChange={handleVoucherChange} className="form-input" placeholder="Optional" /></div>
                <div className="form-group">
                  <label>Payee Name <span className="required">*</span></label>
                  <select name="payee_name" value={voucherForm.payee_name} onChange={handleVoucherChange} required className="form-select">
                    <option value="">Select Payee</option>
                    {payees.map(p => <option key={p.id} value={p.payee_name}>{p.payee_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid two-col">
                <div className="form-group">
                  <label>Expenses Type <span className="required">*</span></label>
                  <select name="expense_type_id" value={voucherForm.expense_type_id} onChange={handleExpenseTypeChange} required className="form-select">
                    <option value="">Select Expense Type</option>
                    {withSavedOption(expenseTypes, voucherForm.expense_type_id, voucherForm.expense_type).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Sub Expenses Type {subExpenseTypes.length > 0 && <span className="required">*</span>}</label>
                  <select name="sub_expense_type_id" value={voucherForm.sub_expense_type_id} onChange={handleSubExpenseTypeChange} required={subExpenseTypes.length > 0} disabled={!voucherForm.expense_type_id} className="form-select">
                    <option value="">{voucherForm.expense_type_id ? 'Select Sub Expense Type' : 'Select Expense Type First'}</option>
                    {withSavedOption(subExpenseTypes, voucherForm.sub_expense_type_id, voucherForm.sub_expense_type).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid two-col">
                <div className="form-group"><label>Vehicle Number</label><input type="text" name="vehicle_number" value={voucherForm.vehicle_number} onChange={handleVoucherChange} className="form-input" placeholder="If applicable" /></div>
                <div className="form-group"><label>Receipt Number</label><input type="text" name="receipt_no" value={voucherForm.receipt_no} onChange={handleVoucherChange} className="form-input" placeholder="Optional" /></div>
              </div>
              <div className="form-grid two-col">
                <div className="form-group"><label>Amount (LKR) <span className="required">*</span></label><input type="number" name="amount" value={voucherForm.amount} onChange={handleVoucherChange} required min="0.01" step="0.01" className="form-input amount-input" placeholder="0.00" /></div>
              </div>
              <div className="form-grid two-col">
                <div className="form-group full-width"><label>Description</label><textarea name="description" value={voucherForm.description} onChange={handleVoucherChange} className="form-textarea" rows="3" placeholder="Optional" /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={isEditing ? handleCancelEdit : () => {
                  const jh = companies.find(c => (c.name || '').toUpperCase() === 'JH');
                  setSubExpenseTypes([]);
                  setVoucherForm({ date: new Date().toISOString().split('T')[0], voucher_number: '', employee_name: '', payee_name: '', expense_type_id: '', expense_type: '', sub_expense_type_id: '', sub_expense_type: '', description: '', vehicle_number: '', amount: '', receipt_no: '', company_id: jh ? String(jh.id) : '' });
                }} className="btn-secondary" disabled={isLoading}><FontAwesomeIcon icon={faTimes} /> {isEditing ? 'Cancel' : 'Clear'}</button>
                <button type="submit" className="btn-primary" disabled={isLoading}><FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} /> {isLoading ? (isEditing ? 'Updating...' : 'Submitting...') : (isEditing ? 'Update Voucher' : 'Submit Voucher')}</button>
              </div>
            </form>
          </div>

          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
              <div><h3>Recent Vouchers</h3></div>
              <div className="report-filter-actions">
                <button className="btn btn-secondary" onClick={fetchPettyCashData} disabled={isFetching}><FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} /></button>
                <button className="btn btn-secondary" onClick={handlePrintVouchers}><FontAwesomeIcon icon={faPrint} /> Print</button>
                <button className="btn btn-success" onClick={handleExportVouchers}><FontAwesomeIcon icon={faFileExcel} /> Export</button>
              </div>
            </div>

            {/* Date Range filter */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--spacing-md)', flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>From Date</label>
                <input type="date" className="form-input" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>To Date</label>
                <input type="date" className="form-input" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
              </div>
              {(fromDate || toDate) && (
                <button className="btn btn-secondary" onClick={() => { setFromDate(''); setToDate(''); }}>
                  <FontAwesomeIcon icon={faTimes} /> Clear
                </button>
              )}
              <small style={{ color: 'var(--color-text-secondary)', marginLeft: 'auto' }}>
                {fromDate || toDate
                  ? `Showing all transactions ${fromDate ? `from ${formatDate(fromDate)} ` : ''}${toDate ? `to ${formatDate(toDate)}` : ''}`
                  : `Showing the latest ${RECENT_LIMIT} transactions`}
              </small>
            </div>

            <div style={{ overflowX: 'auto' }} id="vouchers-table-container">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher No.</th>
                    <th>Payee</th>
                    <th>Expense Type</th>
                    <th>Sub Expense Type</th>
                    <th>Debits</th>
                    <th>Credits</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr><td colSpan="11" className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading vouchers...</td></tr>
                  ) : transactions.length > 0 ? (
                    transactions.map(t => {
                      const isReimbursement = t.source === 'REIMBURSEMENT';
                      return (
                        <tr key={`${t.source}-${t.id}`}>
                          <td>{formatDate(t.date)}</td>
                          <td className="voucher-number">{t.reference_number}</td>
                          <td>{isReimbursement ? '-' : t.payee_name}</td>
                          <td>{isReimbursement ? 'Reimbursement' : t.expense_type}</td>
                          <td>{isReimbursement ? '-' : (t.sub_expense_type || '-')}</td>
                          <td className="amount-cell">{t.debit > 0 ? formatCurrency(t.debit) : '-'}</td>
                          <td className="amount-cell">{t.credit > 0 ? formatCurrency(t.credit) : '-'}</td>
                          <td className="amount-cell"><strong>{formatCurrency(t.balance)}</strong></td>
                          <td>
                            {!isReimbursement && (
                              <div className="action-buttons">
                                <button className="action-btn view-btn" title="View"><FontAwesomeIcon icon={faEye} /></button>
                                {isAdmin() && (
                                  <button className="action-btn delete-btn" title="Delete" onClick={() => handleDelete(t.id)}>
                                    <FontAwesomeIcon icon={faTrash} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan="11" className="empty-row">No vouchers found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      
      {/* Reimbursement Tab */}
      {activeTab === 'reimbursement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2xl)' }}>
          <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
            <h3 className="form-section-title"><FontAwesomeIcon icon={isEditingReimbursement ? faEdit : faHistory} /> {isEditingReimbursement ? 'Edit Reimbursement' : 'New Reimbursement'}</h3>
            <form onSubmit={handleReimbursementSubmit}>
              <div className="form-grid two-col">
                <div className="form-group"><label>Date <span className="required">*</span></label><input type="date" name="date" value={reimbursementForm.date} onChange={handleReimbursementChange} required className="form-input" /></div>
                <div className="form-group"><label>Reference Number <span className="required">*</span></label><div className="input-with-button"><input type="text" name="reference_number" value={reimbursementForm.reference_number} onChange={handleReimbursementChange} required className="form-input" placeholder="Enter reference number" /></div></div>
              </div>
              <div className="form-grid two-col">
                <div className="form-group left-align"><label>Amount (LKR) <span className="required">*</span></label><input type="number" name="amount" value={reimbursementForm.amount} onChange={handleReimbursementChange} required min="0.01" step="0.01" className="form-input amount-input" placeholder="0.00" /></div>
                <div className="form-group">
                  <label>Company {!isEditingReimbursement && <span className="required">*</span>}</label>
                  {isEditingReimbursement ? (
                    <input
                      type="text"
                      className="form-input"
                      disabled
                      value={cashBookOptions.find(o => o.value === reimbursementForm.company_id)?.label || 'Not recorded'}
                    />
                  ) : (
                    <select name="company_id" value={reimbursementForm.company_id} onChange={handleReimbursementChange} required className="form-select">
                      <option value="">Select Company</option>
                      {cashBookOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {reimbursementForm.company_id && (
                    <small style={{ color: '#495057', display: 'block', marginTop: '4px' }}>
                      Company: <strong>{companies.find(c => String(c.id) === reimbursementForm.company_id)?.name || '-'}</strong>
                    </small>
                  )}
                </div>
              </div>
              <div className="form-actions">
                {isEditingReimbursement && <button type="button" onClick={handleCancelEditReimbursement} className="btn-secondary" disabled={isLoading}><FontAwesomeIcon icon={faTimes} /> Cancel</button>}
                <button type="button" onClick={() => {
                  const jh = companies.find(c => (c.name || '').toUpperCase() === 'JH');
                  setReimbursementForm({ date: new Date().toISOString().split('T')[0], reference_number: '', amount: '', company_id: jh ? String(jh.id) : '' });
                }} className="btn-secondary" disabled={isLoading}><FontAwesomeIcon icon={faTimes} /> Clear</button>
                <button type="submit" className="btn-primary" disabled={isLoading}><FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} /> {isLoading ? 'Submitting...' : (isEditingReimbursement ? 'Update Reimbursement' : 'Submit Reimbursement')}</button>
              </div>
            </form>
          </div>

          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
              <div><h3>Reimbursement Details</h3></div>
              <div className="report-filter-actions">
                <button className="btn btn-secondary" onClick={fetchPettyCashData}><FontAwesomeIcon icon={faSync} /> Refresh</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="report-table"><thead><tr><th>Date</th><th>Reference Number</th><th>Company</th><th>Amount (LKR)</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {isFetching ? <tr><td colSpan="6" className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading reimbursements...</td></tr> : reimbursements.length > 0 ? reimbursements.map(r => (<tr key={r.id}><td>{formatDate(r.reimbursement_date || r.date)}</td><td className="reference-number">{r.reference_number}</td><td>{r.company_name || r.bank_name || '-'}</td><td className="amount-cell">{formatCurrency(r.amount)}</td><td><span className={`status-badge status-${(r.status || 'Completed').toLowerCase()}`}>{r.status || 'Completed'}</span></td><td><div className="action-buttons"><button className="action-btn view-btn" title="View Details" onClick={() => handleViewReimbursement(r)}><FontAwesomeIcon icon={faEye} /></button><button className="action-btn edit-btn" title="Edit Reimbursement" onClick={() => handleEditReimbursement(r)}><FontAwesomeIcon icon={faEdit} /></button></div></td></tr>)) : <tr><td colSpan="6" className="empty-row">No reimbursements found</td></tr>}
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
              <div className="detail-row"><strong>Company:</strong> {selectedReimbursement.company_name || selectedReimbursement.bank_name || 'Not recorded'}</div>
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