// src/components/Expenses/NewExpenses.jsx
//
// Replaces the old Online Expenses / Cheque Expenses screens with a
// single New Expenses workflow: enter a bill -> pick bills for the
// same payee -> Pay -> choose Payment Type (Cash / Cheque / Bank) ->
// submit. Transfer Amount must cover the Total Bill Amount; anything
// extra is recorded as an overpayment credit for that payee.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faTimes,
  faPlus,
  faEdit,
  faTrash,
  faSearch,
  faFileExcel,
  faSpinner,
  faReceipt,
  faMoneyBillWave,
  faCheckCircle,
  faCreditCard,
  faBuildingColumns,
  faChevronDown,
  faChevronUp,
  faExclamationTriangle,
  faFileInvoiceDollar
} from '@fortawesome/free-solid-svg-icons';
import './OnlineExpenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const emptyBillForm = {
  bill_date: new Date().toISOString().split('T')[0],
  bill_number: '',
  company_id: '',
  payee_id: '',
  payee_name: '',
  vat_reg_number: '',
  expense_type_id: '',
  expense_type: '',
  without_vat_amount: '',
  vat_amount: '',
  total_bill_amount: '',
  description: ''
};

const emptyPaymentForm = {
  payment_date: new Date().toISOString().split('T')[0],
  payee_id: '',
  payee_name: '',
  payment_type_id: '',
  payment_type: '',
  bank_id: '',
  bank_name: '',
  cheque_number: '',
  voucher_number: '',
  reference_number: '',
  description: '',
  transfer_amount: '0.00'
};

const NewExpenses = () => {
  const { showPopup } = usePopup();

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [bills, setBills] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  // 'pending' shows bills still awaiting payment (original behaviour),
  // 'paid' shows bills that have already been settled in full.
  const [viewFilter, setViewFilter] = useState('pending');

  // Lookups
  const [payees, setPayees] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [banks, setBanks] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Payee dropdown (bill form)
  const [payeeSearch, setPayeeSearch] = useState('');
  const [filteredPayees, setFilteredPayees] = useState([]);
  const [isPayeeDropdownOpen, setIsPayeeDropdownOpen] = useState(false);
  const [highlightedPayeeIndex, setHighlightedPayeeIndex] = useState(0);
  const payeeInputRef = useRef(null);

  // Quick-add mini modals
  const [showAddPayee, setShowAddPayee] = useState(false);
  const [newPayeeName, setNewPayeeName] = useState('');
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Bank dropdown (payment modal)
  const [bankSearchTerm, setBankSearchTerm] = useState('');
  const [filteredBanks, setFilteredBanks] = useState([]);
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState([]);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);

  const [formData, setFormData] = useState(emptyBillForm);

  const fetchBills = useCallback(async () => {
    setIsFetching(true);
    try {
      const response = await api.get('/new-expenses');
      setBills(response.data || []);
    } catch (error) {
      console.error('Error fetching expense bills:', error);
      showPopup('error', 'Failed to load expense bills');
      setBills([]);
    } finally {
      setIsFetching(false);
    }
  }, [showPopup]);

  const fetchPayees = useCallback(async () => {
    try {
      const response = await api.get('/payees');
      setPayees(response.data || []);
    } catch (error) {
      console.error('Error fetching payees:', error);
    }
  }, []);

  const fetchExpenseTypes = useCallback(async () => {
    try {
      const response = await api.get('/expense-types');
      setExpenseTypes(response.data || []);
    } catch (error) {
      console.error('Error fetching expense types:', error);
    }
  }, []);

  const fetchPaymentTypes = useCallback(async () => {
    try {
      const response = await api.get('/payment-methods');
      setPaymentTypes(response.data || []);
    } catch (error) {
      console.error('Error fetching payment types:', error);
    }
  }, []);

  const fetchBanks = useCallback(async () => {
    try {
      const response = await api.get('/expenses/banks');
      setBanks(response.data || []);
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await api.get('/companies');
      setCompanies(response.data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      showPopup('error', 'Failed to load companies');
    }
  }, [showPopup]);

  useEffect(() => {
    fetchBills();
    fetchPayees();
    fetchExpenseTypes();
    fetchPaymentTypes();
    fetchBanks();
    fetchCompanies();
  }, [fetchBills, fetchPayees, fetchExpenseTypes, fetchPaymentTypes, fetchBanks, fetchCompanies]);

  useEffect(() => {
    const query = payeeSearch.trim().toLowerCase();
    setFilteredPayees(query === '' ? payees : payees.filter(p => p.payee_name.toLowerCase().includes(query)));
    setHighlightedPayeeIndex(0);
  }, [payeeSearch, payees]);

  useEffect(() => {
    if (bankSearchTerm.trim() === '') {
      setFilteredBanks(banks);
    } else {
      setFilteredBanks(banks.filter(b => b.bank_name.toLowerCase().includes(bankSearchTerm.toLowerCase())));
    }
  }, [bankSearchTerm, banks]);

  useEffect(() => {
    const withoutVat = parseFloat(formData.without_vat_amount) || 0;
    const vat = parseFloat(formData.vat_amount) || 0;
    setFormData(prev => ({ ...prev, total_bill_amount: (withoutVat + vat).toFixed(2) }));
  }, [formData.without_vat_amount, formData.vat_amount]);

  // ---------- Bill form handlers ----------
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePayeeInputChange = (e) => {
    const value = e.target.value;
    setPayeeSearch(value);
    setFormData(prev => ({ ...prev, payee_name: value, payee_id: '' }));
    setIsPayeeDropdownOpen(true);
  };

  const handlePayeeSelect = (payee) => {
    setPayeeSearch(payee.payee_name);
    setFormData(prev => ({
      ...prev,
      payee_id: payee.id,
      payee_name: payee.payee_name,
      vat_reg_number: payee.vat_reg_number || ''
    }));
    setIsPayeeDropdownOpen(false);
  };

  const handlePayeeKeyDown = (e) => {
    if (!isPayeeDropdownOpen || filteredPayees.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedPayeeIndex(prev => (prev + 1) % filteredPayees.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedPayeeIndex(prev => (prev - 1 + filteredPayees.length) % filteredPayees.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredPayees[highlightedPayeeIndex];
      if (selected) handlePayeeSelect(selected);
    } else if (e.key === 'Escape') {
      setIsPayeeDropdownOpen(false);
    }
  };

  const handleQuickAddPayee = async () => {
    if (!newPayeeName.trim()) return;
    try {
      const response = await api.post('/payees', { payee_name: newPayeeName.trim() });
      const created = response.data;
      setPayees(prev => [...prev, created].sort((a, b) => a.payee_name.localeCompare(b.payee_name)));
      handlePayeeSelect(created);
      setShowAddPayee(false);
      setNewPayeeName('');
      showPopup('success', 'Payee added');
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to add payee');
    }
  };

  const handleQuickAddType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const response = await api.post('/expense-types', { name: newTypeName.trim() });
      const created = response.data;
      setExpenseTypes(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData(prev => ({ ...prev, expense_type_id: created.id, expense_type: created.name }));
      setShowAddType(false);
      setNewTypeName('');
      showPopup('success', 'Expense type added');
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to add expense type');
    }
  };

  const handleExpenseTypeChange = (e) => {
    const id = e.target.value;
    const type = expenseTypes.find(t => String(t.id) === String(id));
    setFormData(prev => ({ ...prev, expense_type_id: id, expense_type: type ? type.name : '' }));
  };

  const resetForm = () => {
    setFormData(emptyBillForm);
    setPayeeSearch('');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.bill_date || !formData.company_id || !formData.payee_name || !formData.expense_type) {
      showPopup('error', 'Please fill all required fields');
      return;
    }
    if (!formData.without_vat_amount || parseFloat(formData.without_vat_amount) <= 0) {
      showPopup('error', 'Valid amount is required');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        bill_date: formData.bill_date,
        bill_number: formData.bill_number || null,
        company_id: formData.company_id,
        payee_id: formData.payee_id || null,
        payee_name: formData.payee_name,
        vat_reg_number: formData.vat_reg_number || null,
        expense_type_id: formData.expense_type_id || null,
        expense_type: formData.expense_type,
        without_vat_amount: parseFloat(formData.without_vat_amount),
        vat_amount: parseFloat(formData.vat_amount) || 0,
        total_bill_amount: parseFloat(formData.total_bill_amount),
        description: formData.description || null
      };

      if (editingId) {
        await api.put(`/new-expenses/${editingId}`, payload);
        showPopup('success', 'Expense bill updated successfully!');
      } else {
        await api.post('/new-expenses', payload);
        showPopup('success', 'Expense bill recorded successfully!');
      }

      resetForm();
      await fetchBills();
    } catch (error) {
      console.error('Error saving expense bill:', error);
      showPopup('error', error.response?.data?.error || 'Failed to save expense bill');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (bill) => {
    setEditingId(bill.id);
    setFormData({
      bill_date: bill.bill_date,
      bill_number: bill.bill_number || '',
      company_id: bill.company_id || '',
      payee_id: bill.payee_id || '',
      payee_name: bill.payee_name,
      vat_reg_number: bill.vat_reg_number || '',
      expense_type_id: bill.expense_type_id || '',
      expense_type: bill.expense_type,
      without_vat_amount: String(bill.without_vat_amount),
      vat_amount: String(bill.vat_amount),
      total_bill_amount: String(bill.total_bill_amount),
      description: bill.description || ''
    });
    setPayeeSearch(bill.payee_name);
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense bill?')) return;
    setIsLoading(true);
    try {
      await api.delete(`/new-expenses/${id}`);
      showPopup('success', 'Expense bill deleted successfully!');
      await fetchBills();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to delete expense bill');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Selection ----------
  const filteredBills = bills.filter(bill => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      bill.bill_number?.toLowerCase().includes(q) ||
      bill.payee_name?.toLowerCase().includes(q) ||
      bill.expense_type?.toLowerCase().includes(q) ||
      bill.vat_reg_number?.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    const isPaid = parseFloat(bill.balance || 0) <= 0;
    return viewFilter === 'paid' ? isPaid : !isPaid;
  });

  const pendingCount = bills.filter(b => parseFloat(b.balance || 0) > 0).length;
  const paidCount = bills.filter(b => parseFloat(b.balance || 0) <= 0).length;

  const allSelected = filteredBills.length > 0 && filteredBills.every(b => selectedIds.includes(b.id));

  const handleSelectAll = (e) => {
    setSelectedIds(e.target.checked ? filteredBills.map(b => b.id) : []);
  };

  const handleSelectOne = (id) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'LKR 0.00';
    return new Intl.NumberFormat('en-LK', {
      style: 'currency', currency: 'LKR', minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(amount);
  };

  const selectedBills = bills.filter(b => selectedIds.includes(b.id));
  const selectedPayeeNames = [...new Set(selectedBills.map(b => b.payee_name).filter(Boolean))];
  const canPay = selectedBills.length > 0 && selectedPayeeNames.length === 1;
  const totalSelectedBalance = selectedBills.reduce((sum, b) => sum + parseFloat(b.balance || 0), 0);

  // ---------- Payment modal ----------
  const handleOpenPaymentModal = () => {
    if (!canPay) {
      if (selectedPayeeNames.length > 1) {
        showPopup('error', `Selected bills have different payees (${selectedPayeeNames.join(', ')}). Please select bills for one payee.`);
      } else {
        showPopup('error', 'Select at least one bill to pay');
      }
      return;
    }

    setSelectedForPayment(selectedBills);
    setPaymentForm({
      ...emptyPaymentForm,
      payee_id: selectedBills[0].payee_id || '',
      payee_name: selectedPayeeNames[0],
      transfer_amount: totalSelectedBalance.toFixed(2)
    });
    setBankSearchTerm('');
    setShowPaymentModal(true);
  };

  const handleClosePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedForPayment([]);
    setBankSearchTerm('');
    setIsBankDropdownOpen(false);
  };

  const handlePaymentFormChange = (e) => {
    const { name, value } = e.target;
    setPaymentForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePaymentTypeChange = (e) => {
    const id = e.target.value;
    const type = paymentTypes.find(t => String(t.id) === String(id));
    setPaymentForm(prev => ({
      ...prev,
      payment_type_id: id,
      payment_type: type ? type.name : '',
      // Clear reference fields when the type changes so a stale value
      // from a previous selection can't slip through validation.
      cheque_number: '',
      voucher_number: '',
      bank_id: '',
      bank_name: ''
    }));
    setBankSearchTerm('');
  };

  const handleBankSelect = (bank) => {
    setPaymentForm(prev => ({ ...prev, bank_name: bank.bank_name, bank_id: bank.id }));
    setBankSearchTerm(bank.bank_name);
    setIsBankDropdownOpen(false);
  };

  const paymentTypeLower = paymentForm.payment_type.toLowerCase();
  const isCheque = paymentTypeLower === 'cheque';
  const isBankLike = paymentTypeLower === 'bank' || paymentTypeLower === 'online';
  const needsBank = isCheque || isBankLike;

  const totalBillAmountForPayment = selectedForPayment.reduce((sum, b) => sum + parseFloat(b.balance || 0), 0);
  const transferAmountValue = parseFloat(paymentForm.transfer_amount) || 0;
  const overpayment = Math.max(0, transferAmountValue - totalBillAmountForPayment);

  const paymentValid =
    !!paymentForm.payment_date &&
    !!paymentForm.payment_type &&
    (!needsBank || !!paymentForm.bank_id) &&
    (!isCheque || !!paymentForm.cheque_number.trim()) &&
    (!isBankLike || !!paymentForm.voucher_number.trim()) &&
    transferAmountValue >= totalBillAmountForPayment &&
    transferAmountValue > 0;

  const handleProcessPayment = async () => {
    if (!paymentValid) {
      if (transferAmountValue < totalBillAmountForPayment) {
        showPopup('error', 'Transfer amount must be equal to or greater than the total bill amount');
      } else {
        showPopup('error', 'Please fill all required payment fields');
      }
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        expense_ids: selectedForPayment.map(b => b.id),
        payment_date: paymentForm.payment_date,
        payee_id: paymentForm.payee_id || null,
        payee_name: paymentForm.payee_name,
        payment_type_id: paymentForm.payment_type_id || null,
        payment_type: paymentForm.payment_type,
        bank_id: needsBank ? paymentForm.bank_id : null,
        cheque_number: isCheque ? paymentForm.cheque_number : null,
        voucher_number: isBankLike ? paymentForm.voucher_number : null,
        reference_number: paymentForm.reference_number || null,
        transfer_amount: transferAmountValue,
        description: paymentForm.description || null
      };

      const response = await api.post('/new-expenses/pay', payload);
      const paidOverpayment = response.data?.overpayment || 0;

      showPopup(
        'success',
        paidOverpayment > 0
          ? `Payment submitted. Overpayment of ${formatCurrency(paidOverpayment)} recorded for ${paymentForm.payee_name}.`
          : 'Payment submitted successfully!'
      );

      setSelectedIds([]);
      handleClosePaymentModal();
      await fetchBills();
    } catch (error) {
      console.error('Error submitting payment:', error);
      showPopup('error', error.response?.data?.error || 'Failed to submit payment');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="online-expenses-container">
      <div className="online-header">
        <h1 className="online-title">
          <FontAwesomeIcon icon={faFileInvoiceDollar} className="title-icon" />
          New Expenses
        </h1>
      </div>

      {/* New Expense Bill Form */}
      <div className="form-card">
        <h3 className="form-title">
          <FontAwesomeIcon icon={editingId ? faEdit : faPlus} />
          {editingId ? 'Edit Expense Bill' : 'New Expense Bill'}
        </h3>

        <form onSubmit={handleSubmit} className="online-form">
          <div className="form-row">
            <div className="form-group">
              <label>Bill Date <span className="required">*</span></label>
              <input
                type="date" name="bill_date" value={formData.bill_date}
                onChange={handleChange} required className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Bill Number</label>
              <input
                type="text" name="bill_number" value={formData.bill_number}
                onChange={handleChange} className="form-input" placeholder="Enter bill number"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Company <span className="required">*</span></label>
              <select name="company_id" value={formData.company_id} onChange={handleChange} required className="form-select">
                <option value="">Select Company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Payee Name <span className="required">*</span></label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div className="payee-dropdown-wrapper" style={{ flex: 1 }}>
                  <div className="payee-input-inner">
                    <input
                      type="text" name="payee_name" value={payeeSearch}
                      onChange={handlePayeeInputChange}
                      onFocus={() => setIsPayeeDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsPayeeDropdownOpen(false), 150)}
                      onKeyDown={handlePayeeKeyDown}
                      ref={payeeInputRef} required className="form-input"
                      placeholder="Search or select payee" autoComplete="off"
                    />
                  </div>
                  {isPayeeDropdownOpen && (
                    <div className="payee-dropdown">
                      {filteredPayees.length === 0 ? (
                        <div className="dropdown-empty">No matching payees found.</div>
                      ) : (
                        filteredPayees.map((payee, index) => (
                          <button
                            type="button" key={payee.id}
                            className={`dropdown-item ${index === highlightedPayeeIndex ? 'highlighted' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handlePayeeSelect(payee)}
                          >
                            <span>{payee.payee_name}</span>
                            {payee.vat_reg_number ? <span className="dropdown-annotation">{payee.vat_reg_number}</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>VAT Reg Number</label>
              <input
                type="text" name="vat_reg_number" value={formData.vat_reg_number}
                readOnly className="form-input" placeholder="Auto-filled from payee"
              />
            </div>
            <div className="form-group">
              <label>Expenses Type <span className="required">*</span></label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  name="expense_type_id" value={formData.expense_type_id}
                  onChange={handleExpenseTypeChange} required className="form-select" style={{ flex: 1 }}
                >
                  <option value="">Select Expense Type</option>
                  {expenseTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Without VAT Amount <span className="required">*</span></label>
              <input
                type="number" name="without_vat_amount" value={formData.without_vat_amount}
                onChange={handleChange} required min="0" step="0.01"
                className="form-input amount-input" placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label>VAT Amount</label>
              <input
                type="number" name="vat_amount" value={formData.vat_amount}
                onChange={handleChange} min="0" step="0.01"
                className="form-input amount-input" placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Total Bill Amount</label>
              <input
                type="text" value={formData.total_bill_amount} readOnly
                className="form-input total-amount" placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-group full-width">
            <label>Description</label>
            <textarea
              name="description" value={formData.description} onChange={handleChange}
              className="form-textarea" rows="3" placeholder="Enter description (optional)"
            />
          </div>

          <div className="form-actions">
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary" disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
            )}
            <button type="button" onClick={resetForm} className="btn-secondary" disabled={isLoading}>
              <FontAwesomeIcon icon={faTimes} /> Clear
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
              {isLoading ? 'Processing...' : (editingId ? 'Update Bill' : 'Submit')}
            </button>
          </div>
        </form>
      </div>

      {/* Expenses Details Table */}
      <div className="table-section">
        <div className="table-header">
          <h3 className="table-title">
            <FontAwesomeIcon icon={faReceipt} /> Expenses Details
          </h3>
          <div className="table-actions">
            <div className="expense-view-tabs">
              <button
                type="button"
                className={`expense-view-tab ${viewFilter === 'pending' ? 'active' : ''}`}
                onClick={() => { setViewFilter('pending'); setSelectedIds([]); }}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                className={`expense-view-tab ${viewFilter === 'paid' ? 'active' : ''}`}
                onClick={() => { setViewFilter('paid'); setSelectedIds([]); }}
              >
                Paid ({paidCount})
              </button>
            </div>
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text" placeholder="Search by bill number, payee, expense type..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input"
              />
              {searchTerm && <button className="clear-search" onClick={() => setSearchTerm('')}>×</button>}
            </div>
            <button className="action-icon-btn" title="Export to Excel">
              <FontAwesomeIcon icon={faFileExcel} />
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="online-table">
            <thead>
              <tr>
                {viewFilter === 'pending' && (
                  <th style={{ width: '40px' }}>
                    <input type="checkbox" checked={allSelected} onChange={handleSelectAll} className="select-checkbox" />
                  </th>
                )}
                <th>Bill Date</th>
                <th>Bill Number</th>
                <th>Payee Name</th>
                <th>Company</th>
                <th>VAT Reg No</th>
                <th>Without VAT Amount</th>
                <th>VAT Amount</th>
                <th>Total Bill Amount</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Description</th>
                {viewFilter === 'pending' && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr><td colSpan="12" className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading expenses...</td></tr>
              ) : filteredBills.length > 0 ? (
                filteredBills.map(bill => {
                  const isPaid = parseFloat(bill.balance || 0) <= 0;
                  return (
                    <tr key={bill.id}>
                      {viewFilter === 'pending' && (
                        <td>
                          <input type="checkbox" checked={selectedIds.includes(bill.id)} onChange={() => handleSelectOne(bill.id)} className="select-checkbox" />
                        </td>
                      )}
                      <td className="date-cell">{bill.bill_date}</td>
                      <td className="bill-number-cell">{bill.bill_number || '-'}</td>
                      <td className="payee-cell">{bill.payee_name}</td>
                      <td>{bill.company_name || '-'}</td>
                      <td className="vat-cell">{bill.vat_reg_number || '-'}</td>
                      <td className="amount-cell">{formatCurrency(bill.without_vat_amount)}</td>
                      <td className="amount-cell">{formatCurrency(bill.vat_amount)}</td>
                      <td className="amount-cell total">{formatCurrency(bill.total_bill_amount)}</td>
                      <td className="balance-cell">
                        <span className={parseFloat(bill.balance) > 0 ? 'balance-positive' : 'balance-zero'}>
                          {formatCurrency(bill.balance)}
                        </span>
                      </td>
                      <td>
                        <span className={`payment-status-badge ${isPaid ? 'paid' : 'pending'}`}>
                          <span className="status-dot"></span>
                          {bill.payment_status || (isPaid ? 'Paid' : 'Pending')}
                        </span>
                      </td>
                      <td className="description-cell">{bill.description || '-'}</td>
                      {viewFilter === 'pending' && (
                        <td className="action-cell">
                          <button onClick={() => handleEdit(bill)} className="edit-btn" title="Edit"><FontAwesomeIcon icon={faEdit} /></button>
                          <button onClick={() => handleDelete(bill.id)} className="delete-btn" title="Delete"><FontAwesomeIcon icon={faTrash} /></button>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="12" className="empty-row">
                    {viewFilter === 'paid' ? 'No paid expense bills found' : 'No pending expense bills found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {viewFilter === 'pending' && (
          <div className="payment-action-bar">
            <div className="selected-info">
              {selectedIds.length > 0 ? (
                <>
                  <span className="selected-count">
                    <FontAwesomeIcon icon={faCheckCircle} /> {selectedIds.length} bill(s) selected
                    <span className="selected-total"> | Total: {formatCurrency(totalSelectedBalance)}</span>
                  </span>
                  {selectedPayeeNames.length === 1 ? (
                    <span className="payee-status valid">✓ Payee: <strong>{selectedPayeeNames[0]}</strong></span>
                  ) : selectedPayeeNames.length > 1 ? (
                    <span className="payee-status invalid">
                      <FontAwesomeIcon icon={faExclamationTriangle} /> Multiple payees selected ({selectedPayeeNames.join(', ')})
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="selected-count"><FontAwesomeIcon icon={faReceipt} /> Select bill(s) to pay</span>
              )}
            </div>
            <button className="btn-pay" onClick={handleOpenPaymentModal} disabled={isLoading}>
              <FontAwesomeIcon icon={faMoneyBillWave} /> Pay
            </button>
          </div>
        )}
      </div>

      {/* Payment Details Modal */}
      {showPaymentModal && (
        <div className="payment-modal-overlay" onClick={handleClosePaymentModal}>
          <div className="payment-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3>
                <FontAwesomeIcon icon={faCreditCard} /> Payment Details
                <span className="payment-count">{selectedForPayment.length} bill(s)</span>
              </h3>
              <button className="payment-modal-close" onClick={handleClosePaymentModal}>×</button>
            </div>

            <div className="payment-modal-body">
              <div className="payment-details-section">
                <div className="payment-section-title">Payment Details</div>

                <div className="payment-form-row">
                  <div className="payment-form-group">
                    <label>Payment Date <span className="required">*</span></label>
                    <input
                      type="date" name="payment_date" value={paymentForm.payment_date}
                      onChange={handlePaymentFormChange} className="payment-input" required
                    />
                  </div>
                  <div className="payment-form-group">
                    <label>Payee Name</label>
                    <input type="text" value={paymentForm.payee_name} readOnly className="payment-input" />
                  </div>
                </div>

                <div className="payment-form-row">
                  <div className="payment-form-group">
                    <label>Payment Type <span className="required">*</span></label>
                    <select
                      name="payment_type_id" value={paymentForm.payment_type_id}
                      onChange={handlePaymentTypeChange} className="payment-input" required
                    >
                      <option value="">Select Payment Type</option>
                      {paymentTypes.filter(pt => pt.name.toLowerCase() !== 'cash').map(pt => (
                        <option key={pt.id} value={pt.id}>{pt.name}</option>
                      ))}
                    </select>
                  </div>

                  {needsBank && (
                    <div className="payment-form-group">
                      <label>Bank <span className="required">*</span></label>
                      <div className="custom-select-container">
                        <div className="custom-select-trigger" onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}>
                          <input
                            type="text" placeholder="Search or select bank..." value={bankSearchTerm}
                            onChange={(e) => { setBankSearchTerm(e.target.value); setPaymentForm(prev => ({ ...prev, bank_name: e.target.value, bank_id: '' })); }}
                            onFocus={() => setIsBankDropdownOpen(true)} className="custom-select-input" autoComplete="off" required
                          />
                          <FontAwesomeIcon icon={isBankDropdownOpen ? faChevronUp : faChevronDown} className="dropdown-icon" />
                        </div>
                        {isBankDropdownOpen && (
                          <div className="custom-select-dropdown">
                            {filteredBanks.length > 0 ? (
                              filteredBanks.map(bank => (
                                <div key={bank.id} className="dropdown-item" onClick={() => handleBankSelect(bank)}>
                                  <FontAwesomeIcon icon={faBuildingColumns} className="dropdown-icon-sm" /> {bank.bank_name}
                                </div>
                              ))
                            ) : (
                              <div className="dropdown-empty">No banks found</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="payment-form-row">
                  {isCheque && (
                    <div className="payment-form-group">
                      <label>Cheque Number <span className="required">*</span></label>
                      <input
                        type="text" name="cheque_number" value={paymentForm.cheque_number}
                        onChange={handlePaymentFormChange} className="payment-input"
                        placeholder="Enter cheque number" required
                      />
                    </div>
                  )}
                  {isBankLike && (
                    <div className="payment-form-group">
                      <label>Voucher Number <span className="required">*</span></label>
                      <input
                        type="text" name="voucher_number" value={paymentForm.voucher_number}
                        onChange={handlePaymentFormChange} className="payment-input"
                        placeholder="Enter voucher number" required
                      />
                    </div>
                  )}
                  <div className="payment-form-group">
                    <label>Reference Number</label>
                    <input
                      type="text" name="reference_number" value={paymentForm.reference_number}
                      onChange={handlePaymentFormChange} className="payment-input" placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="payment-form-row">
                  <div className="payment-form-group full-width">
                    <label>Description</label>
                    <input
                      type="text" name="description" value={paymentForm.description}
                      onChange={handlePaymentFormChange} className="payment-input" placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              <div className="online-details-section">
                <div className="payment-section-title">Bill Details</div>

                {selectedForPayment.length > 0 && (
                  <div className="online-expense-summary">
                    {selectedForPayment.map((bill, index) => (
                      <div key={bill.id} className="expense-summary-item">
                        <div className="expense-summary-row">
                          <span className="summary-label">Bill Date</span>
                          <span className="summary-value">{bill.bill_date}</span>
                        </div>
                        <div className="expense-summary-row">
                          <span className="summary-label">Bill Number</span>
                          <span className="summary-value">{bill.bill_number || '-'}</span>
                        </div>
                        <div className="expense-summary-row">
                          <span className="summary-label">Balance</span>
                          <span className="summary-value">{formatCurrency(bill.balance)}</span>
                        </div>
                        {index < selectedForPayment.length - 1 && <hr className="expense-divider" />}
                      </div>
                    ))}
                  </div>
                )}

                <div className="expense-summary-row total-row">
                  <span className="summary-label">Total Bill Amount</span>
                  <span className="summary-value total-amount">{formatCurrency(totalBillAmountForPayment)}</span>
                </div>

                <div className="payment-form-group transfer-row">
                  <label>Transfer Amount <span className="required">*</span></label>
                  <input
                    type="number" name="transfer_amount" value={paymentForm.transfer_amount}
                    onChange={handlePaymentFormChange} className="payment-input transfer-input"
                    placeholder="0.00" min="0" step="0.01" required
                  />
                  {transferAmountValue > 0 && transferAmountValue < totalBillAmountForPayment && (
                    <small style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      Transfer amount cannot be less than the total bill amount
                    </small>
                  )}
                </div>

                {overpayment > 0 && (
                  <div className="expense-summary-row balance-row">
                    <span className="summary-label">Overpayment</span>
                    <span className="summary-value balance-amount" style={{ color: '#856404' }}>
                      {formatCurrency(overpayment)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={handleClosePaymentModal} disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button type="button" className="btn-pay" onClick={handleProcessPayment} disabled={isLoading || !paymentValid}>
                <FontAwesomeIcon icon={isLoading ? faSpinner : faMoneyBillWave} spin={isLoading} />
                {isLoading ? 'Processing...' : 'Submit Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-add Payee modal */}
      {showAddPayee && (
        <div className="payment-modal-overlay" onClick={() => setShowAddPayee(false)}>
          <div className="payment-modal-content" style={{ maxWidth: '380px' }} onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3>Add Payee</h3>
              <button className="payment-modal-close" onClick={() => setShowAddPayee(false)}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div className="payment-form-group">
                <label>Payee Name <span className="required">*</span></label>
                <input
                  type="text" value={newPayeeName} onChange={(e) => setNewPayeeName(e.target.value)}
                  className="payment-input" placeholder="Enter payee name" autoFocus
                />
              </div>
            </div>
            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowAddPayee(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleQuickAddPayee}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-add Expense Type modal */}
      {showAddType && (
        <div className="payment-modal-overlay" onClick={() => setShowAddType(false)}>
          <div className="payment-modal-content" style={{ maxWidth: '380px' }} onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3>Add Expense Type</h3>
              <button className="payment-modal-close" onClick={() => setShowAddType(false)}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div className="payment-form-group">
                <label>Type Name <span className="required">*</span></label>
                <input
                  type="text" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}
                  className="payment-input" placeholder="Enter expense type" autoFocus
                />
              </div>
            </div>
            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowAddType(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleQuickAddType}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewExpenses;
