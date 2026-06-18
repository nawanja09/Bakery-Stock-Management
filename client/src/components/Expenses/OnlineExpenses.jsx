// src/components/Expenses/OnlineExpenses.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faTimes, 
  faPlus, 
  faEdit,
  faTrash,
  faSearch,
  faPrint,
  faFileExcel,
  faSync,
  faSpinner,
  faGlobe,
  faReceipt,
  faMoneyBillWave,
  faCheckCircle,
  faCreditCard,
  faBuildingColumns,
  faChevronDown,
  faChevronUp
} from '@fortawesome/free-solid-svg-icons';
import './OnlineExpenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const OnlineExpenses = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlineExpenses, setOnlineExpenses] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState([]);
  const [isFetchingBanks, setIsFetchingBanks] = useState(false);
  const [banks, setBanks] = useState([]);
  const [filteredBanks, setFilteredBanks] = useState([]);
  const [bankSearchTerm, setBankSearchTerm] = useState('');
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  
  // Payee related state
  const [payees, setPayees] = useState([]);
  const [payeeSearch, setPayeeSearch] = useState('');
  const [filteredPayees, setFilteredPayees] = useState([]);
  const [selectedPayee, setSelectedPayee] = useState(null);
  const [isPayeesLoading, setIsPayeesLoading] = useState(false);
  const [payeesError, setPayeesError] = useState('');
  const [isPayeeDropdownOpen, setIsPayeeDropdownOpen] = useState(false);
  const [highlightedPayeeIndex, setHighlightedPayeeIndex] = useState(0);
  
  const { showPopup } = usePopup();
  const payeeInputRef = useRef(null);

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payee_name: '',
    bank_name: '',
    voucher_number: '',
    reference_number: '',
    expense_type: '',
    description: '',
    total_bill_amount: '',
    transfer_amount: ''
  });

  // Form State
  const [formData, setFormData] = useState({
    bill_date: new Date().toISOString().split('T')[0],
    bill_number: '',
    payee_name: '',
    vat_reg_number: '',
    expense_type: '',
    without_vat_amount: '',
    vat_amount: '',
    total_bill_amount: '',
    description: ''
  });

  const expenseTypes = [
    'Raw material',
    'Electricity',
    'Gas',
    'Water',
    'Insurance',
    'Internet'
  ];

  // Fetch banks
  const fetchBanks = useCallback(async () => {
    setIsFetchingBanks(true);
    try {
      const response = await api.get('/expenses/banks');
      const banksData = response.data || [];
      setBanks(banksData);
      setFilteredBanks(banksData);
    } catch (error) {
      console.error('Error fetching banks:', error);
    } finally {
      setIsFetchingBanks(false);
    }
  }, []);

  // Fetch payees from database
  const fetchPayees = useCallback(async () => {
    setIsPayeesLoading(true);
    setPayeesError('');

    try {
      const response = await api.get('/payees');
      const payeeData = response.data || [];
      setPayees(payeeData);
      setFilteredPayees(payeeData);
    } catch (error) {
      console.error('Error fetching payees:', error);
      setPayees([]);
      setFilteredPayees([]);
      setPayeesError('Unable to load payees. You may still type a payee name.');
    } finally {
      setIsPayeesLoading(false);
    }
  }, []);

  // Fetch data on component mount
  useEffect(() => {
    fetchOnlineExpenses();
    fetchPayees();
    fetchBanks();
  }, []);

  // Filter banks based on search term
  useEffect(() => {
    if (bankSearchTerm.trim() === '') {
      setFilteredBanks(banks);
    } else {
      const filtered = banks.filter(bank =>
        bank.bank_name.toLowerCase().includes(bankSearchTerm.toLowerCase())
      );
      setFilteredBanks(filtered);
    }
  }, [bankSearchTerm, banks]);

  // Filter payees based on search term
  useEffect(() => {
    const query = payeeSearch.trim().toLowerCase();
    const filtered = query === ''
      ? payees
      : payees.filter(payee => payee.payee_name.toLowerCase().includes(query));
    
    setFilteredPayees(filtered);
    setHighlightedPayeeIndex(0);
  }, [payeeSearch, payees]);

  // Update selectedPayee when search matches exactly
  useEffect(() => {
    const exactMatch = payees.find(
      payee => payee.payee_name.toLowerCase() === payeeSearch.trim().toLowerCase()
    );
    setSelectedPayee(exactMatch || null);
  }, [payeeSearch, payees]);

  // Calculate total amount when without_vat or vat changes
  useEffect(() => {
    const withoutVat = parseFloat(formData.without_vat_amount) || 0;
    const vat = parseFloat(formData.vat_amount) || 0;
    const total = withoutVat + vat;
    setFormData(prev => ({ ...prev, total_bill_amount: total.toFixed(2) }));
  }, [formData.without_vat_amount, formData.vat_amount]);

  const fetchOnlineExpenses = async () => {
    setIsFetching(true);
    try {
      const response = await api.get('/expenses/online');
      setOnlineExpenses(response.data || []);
    } catch (error) {
      console.error('Error fetching online expenses:', error);
      showPopup('error', 'Failed to load data from server');
      setOnlineExpenses([]);
    } finally {
      setIsFetching(false);
    }
  };

  // Payee input handlers
  const handlePayeeInputChange = (e) => {
    const value = e.target.value;
    setPayeeSearch(value);
    setFormData(prev => ({ ...prev, payee_name: value }));
    if (selectedPayee && selectedPayee.payee_name !== value) {
      setSelectedPayee(null);
      setFormData(prev => ({ ...prev, vat_reg_number: '' }));
    }
    setIsPayeeDropdownOpen(true);
  };

  const handlePayeeSelect = (payee) => {
    setSelectedPayee(payee);
    setPayeeSearch(payee.payee_name);
    setFormData(prev => ({
      ...prev,
      payee_name: payee.payee_name,
      vat_reg_number: payee.vat_reg_number || ''
    }));
    setIsPayeeDropdownOpen(false);
  };

  const handleClearPayee = () => {
    setSelectedPayee(null);
    setPayeeSearch('');
    setFormData(prev => ({ ...prev, payee_name: '', vat_reg_number: '' }));
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
      if (selected) {
        handlePayeeSelect(selected);
      }
    } else if (e.key === 'Escape') {
      setIsPayeeDropdownOpen(false);
    }
  };

  // Bank dropdown handlers
  const handleBankSelect = (bankName) => {
    setPaymentForm(prev => ({ ...prev, bank_name: bankName }));
    setBankSearchTerm(bankName);
    setIsBankDropdownOpen(false);
  };

  const handleBankSearchChange = (e) => {
    const value = e.target.value;
    setBankSearchTerm(value);
    setPaymentForm(prev => ({ ...prev, bank_name: value }));
    setIsBankDropdownOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePaymentFormChange = (e) => {
    const { name, value } = e.target;
    setPaymentForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.bill_date || !formData.payee_name || !formData.expense_type) {
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
        payee_name: formData.payee_name,
        vat_reg_number: formData.vat_reg_number || null,
        expense_type: formData.expense_type,
        without_vat_amount: parseFloat(formData.without_vat_amount),
        vat_amount: parseFloat(formData.vat_amount) || 0,
        total_bill_amount: parseFloat(formData.total_bill_amount),
        description: formData.description || null
      };

      let response;
      if (editingId) {
        response = await api.put(`/expenses/online/${editingId}`, payload);
      } else {
        response = await api.post('/expenses/online', payload);
      }
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', editingId ? 'Online expense updated successfully!' : 'Online expense recorded successfully!');
        
        // Reset form
        setFormData({
          bill_date: new Date().toISOString().split('T')[0],
          bill_number: '',
          payee_name: '',
          vat_reg_number: '',
          expense_type: '',
          without_vat_amount: '',
          vat_amount: '',
          total_bill_amount: '',
          description: ''
        });
        setPayeeSearch('');
        setSelectedPayee(null);
        setEditingId(null);
        
        // Refresh data
        await fetchOnlineExpenses();
      }
    } catch (error) {
      console.error(editingId ? 'Error updating online expense:' : 'Error creating online expense:', error);
      showPopup('error', error.response?.data?.error || (editingId ? 'Failed to update online expense' : 'Failed to record online expense'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (expense) => {
    setEditingId(expense.id);
    setFormData({
      bill_date: expense.bill_date,
      bill_number: expense.bill_number || '',
      payee_name: expense.payee_name,
      vat_reg_number: expense.vat_reg_number || '',
      expense_type: expense.expense_type,
      without_vat_amount: expense.without_vat_amount.toString(),
      vat_amount: expense.vat_amount.toString(),
      total_bill_amount: expense.total_bill_amount.toString(),
      description: expense.description || ''
    });
    setPayeeSearch(expense.payee_name);
    setSelectedPayee(null);
    // Scroll to form
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    if (!formData.bill_date || !formData.payee_name || !formData.expense_type) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        bill_date: formData.bill_date,
        bill_number: formData.bill_number || null,
        payee_name: formData.payee_name,
        vat_reg_number: formData.vat_reg_number || null,
        expense_type: formData.expense_type,
        without_vat_amount: parseFloat(formData.without_vat_amount),
        vat_amount: parseFloat(formData.vat_amount) || 0,
        total_bill_amount: parseFloat(formData.total_bill_amount),
        description: formData.description || null
      };

      const response = await api.put(`/expenses/online/${editingId}`, payload);
      
      if (response.status === 200) {
        showPopup('success', 'Online expense updated successfully!');
        
        // Reset form and editing state
        setFormData({
          bill_date: new Date().toISOString().split('T')[0],
          bill_number: '',
          payee_name: '',
          vat_reg_number: '',
          expense_type: '',
          without_vat_amount: '',
          vat_amount: '',
          total_bill_amount: '',
          description: ''
        });
        setPayeeSearch('');
        setSelectedPayee(null);
        setEditingId(null);
        
        // Refresh data
        await fetchOnlineExpenses();
      }
    } catch (error) {
      console.error('Error updating online expense:', error);
      showPopup('error', error.response?.data?.error || 'Failed to update online expense');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this online expense?')) {
      setIsLoading(true);
      try {
        const response = await api.delete(`/expenses/online/${id}`);
        
        if (response.status === 200) {
          showPopup('success', 'Online expense deleted successfully!');
          await fetchOnlineExpenses();
        }
      } catch (error) {
        console.error('Error deleting online expense:', error);
        showPopup('error', error.response?.data?.error || 'Failed to delete online expense');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setSelectedPayee(null);
    setPayeeSearch('');
    setFormData({
      bill_date: new Date().toISOString().split('T')[0],
      bill_number: '',
      payee_name: '',
      vat_reg_number: '',
      expense_type: '',
      without_vat_amount: '',
      vat_amount: '',
      total_bill_amount: '',
      description: ''
    });
  };

  // Selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = filteredExpenses.map(exp => exp.id);
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Payment handlers
  const handleOpenPaymentModal = async () => {
    // If no items selected, use the current filtered expenses
    let expensesToPay = [];
    
    if (selectedIds.length > 0) {
      // Get selected expenses
      expensesToPay = onlineExpenses.filter(exp => selectedIds.includes(exp.id));
    } else {
      // Use all filtered expenses that have balance > 0
      expensesToPay = filteredExpenses.filter(exp => parseFloat(exp.balance || 0) > 0);
    }

    if (expensesToPay.length === 0) {
      showPopup('error', 'No pending payments available');
      return;
    }

    // Get detailed information for the first expense
    try {
      const firstExpense = expensesToPay[0];
      const response = await api.get(`/expenses/online/${firstExpense.id}`);
      const expenseDetail = response.data;
      
      const totalAmount = expensesToPay.reduce((sum, exp) => sum + parseFloat(exp.balance || 0), 0);
      
      setSelectedForPayment(expensesToPay);
      setPaymentForm({
        payment_date: new Date().toISOString().split('T')[0],
        payee_name: firstExpense.payee_name,
        bank_name: '',
        voucher_number: '',
        reference_number: '',
        expense_type: firstExpense.expense_type,
        description: firstExpense.description || '',
        total_bill_amount: totalAmount.toFixed(2),
        transfer_amount: totalAmount.toFixed(2)
      });
      
      // Set payee search for dropdown
      setPayeeSearch(firstExpense.payee_name);
      
      setShowPaymentModal(true);
    } catch (error) {
      console.error('Error fetching expense details:', error);
      showPopup('error', 'Failed to load expense details');
    }
  };

  const handleClosePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedForPayment([]);
    setBankSearchTerm('');
    setIsBankDropdownOpen(false);
    setPayeeSearch('');
  };

  const handleProcessPayment = async () => {
    // Validation
    if (!paymentForm.payment_date) {
      showPopup('error', 'Payment date is required');
      return;
    }

    if (selectedForPayment.length === 0) {
      showPopup('error', 'No expenses selected for payment');
      return;
    }

    const transferAmount = parseFloat(paymentForm.transfer_amount) || 0;
    const totalBalance = selectedForPayment.reduce((sum, exp) => sum + parseFloat(exp.balance || 0), 0);

    if (transferAmount <= 0) {
      showPopup('error', 'Valid transfer amount is required');
      return;
    }

    if (transferAmount > totalBalance) {
      showPopup('error', `Transfer amount (${transferAmount}) exceeds total balance (${totalBalance})`);
      return;
    }

    setIsLoading(true);
    try {
      const expenseIds = selectedForPayment.map(exp => exp.id);
      
      const payload = {
        expense_ids: expenseIds,
        payment_date: paymentForm.payment_date,
        bank_name: paymentForm.bank_name || null,
        voucher_number: paymentForm.voucher_number || null,
        reference_number: paymentForm.reference_number || null,
        transfer_amount: transferAmount
      };

      const response = await api.post('/expenses/online/pay', payload);
      
      if (response.status === 200) {
        showPopup('success', response.data.message || 'Payment processed successfully!');
        
        // Reset selections
        setSelectedIds([]);
        setShowPaymentModal(false);
        setSelectedForPayment([]);
        
        // Refresh data
        await fetchOnlineExpenses();
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      showPopup('error', error.response?.data?.error || 'Failed to process payment');
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

  const filteredExpenses = onlineExpenses.filter(expense =>
    expense.bill_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.payee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.expense_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.vat_reg_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if all filtered items are selected
  const allSelected = filteredExpenses.length > 0 && 
    filteredExpenses.every(exp => selectedIds.includes(exp.id));

  return (
    <div className="online-expenses-container">
      <div className="online-header">
        <h1 className="online-title">
          <FontAwesomeIcon icon={faGlobe} className="title-icon" />
          Online Expenses Management
        </h1>
      </div>

      {/* New Expense Bill Form */}
      <div className="form-card">
        <h3 className="form-title">
          <FontAwesomeIcon icon={editingId ? faEdit : faPlus} />
          {editingId ? 'Edit Expense Bill' : 'New Expense Bill'}
        </h3>
        
        <form onSubmit={editingId ? handleUpdate : handleSubmit} className="online-form">
          <div className="form-row">
            <div className="form-group">
              <label>Bill Date <span className="required">*</span></label>
              <input
                type="date"
                name="bill_date"
                value={formData.bill_date}
                onChange={handleChange}
                required
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Bill Number</label>
              <input
                type="text"
                name="bill_number"
                value={formData.bill_number}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter bill number"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Payee Name <span className="required">*</span></label>
              <div className="payee-dropdown-wrapper">
                <div className="payee-input-inner">
                  <input
                    type="text"
                    name="payee_name"
                    value={payeeSearch}
                    onChange={handlePayeeInputChange}
                    onFocus={() => setIsPayeeDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setIsPayeeDropdownOpen(false), 150)}
                    onKeyDown={handlePayeeKeyDown}
                    ref={payeeInputRef}
                    required
                    className="form-input"
                    placeholder="Search or type payee name"
                    autoComplete="off"
                  />
                  {payeeSearch && (
                    <button type="button" className="clear-payee-btn" onClick={handleClearPayee}>
                      ×
                    </button>
                  )}
                </div>

                {isPayeeDropdownOpen && !isPayeesLoading && (
                  <div className="payee-dropdown">
                    {payeesError ? (
                      <div className="dropdown-empty">{payeesError}</div>
                    ) : filteredPayees.length === 0 ? (
                      <div className="dropdown-empty">
                        {payees.length === 0 ? 'No payees found. You can still type a payee name.' : 'No matching payees found.'}
                      </div>
                    ) : (
                      filteredPayees.map((payee, index) => (
                        <button
                          type="button"
                          key={payee.id}
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

                {isPayeesLoading && (
                  <div className="dropdown-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading payees...</div>
                )}
              </div>
            </div>
            
            <div className="form-group">
              <label>VAT Reg Number</label>
              <input
                type="text"
                name="vat_reg_number"
                value={formData.vat_reg_number}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter VAT registration number"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Expenses Type <span className="required">*</span></label>
              <select
                name="expense_type"
                value={formData.expense_type}
                onChange={handleChange}
                required
                className="form-select"
              >
                <option value="">Select Expense Type</option>
                {expenseTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Without VAT Amount <span className="required">*</span></label>
              <input
                type="number"
                name="without_vat_amount"
                value={formData.without_vat_amount}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="form-input amount-input"
                placeholder="0.00"
              />
            </div>
            
            <div className="form-group">
              <label>VAT Amount</label>
              <input
                type="number"
                name="vat_amount"
                value={formData.vat_amount}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="form-input amount-input"
                placeholder="0.00"
              />
            </div>
            
            <div className="form-group">
              <label>Total Bill Amount</label>
              <input
                type="text"
                name="total_bill_amount"
                value={formData.total_bill_amount}
                readOnly
                className="form-input total-amount"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-group full-width">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="form-textarea"
              rows="3"
              placeholder="Enter description (optional)"
            />
          </div>

          <div className="form-actions">
            {editingId && (
              <button 
                type="button" 
                onClick={handleCancelEdit}
                className="btn-secondary"
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={faTimes} />
                Cancel
              </button>
            )}
            <button 
              type="button" 
              onClick={() => {
                setFormData({
                  bill_date: new Date().toISOString().split('T')[0],
                  bill_number: '',
                  payee_name: '',
                  vat_reg_number: '',
                  expense_type: '',
                  without_vat_amount: '',
                  vat_amount: '',
                  total_bill_amount: '',
                  description: ''
                });
                setPayeeSearch('');
                setSelectedPayee(null);
                if (editingId) setEditingId(null);
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
              {isLoading ? 'Processing...' : (editingId ? 'Update Bill' : 'Submit')}
            </button>
          </div>
        </form>
      </div>

      {/* Online Expense Details Table */}
      <div className="table-section">
        <div className="table-header">
          <h3 className="table-title">
            <FontAwesomeIcon icon={faReceipt} />
            Online Expense Details
          </h3>
          <div className="table-actions">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search by bill number, payee, expense type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchTerm && (
                <button 
                  className="clear-search"
                  onClick={() => setSearchTerm('')}
                >
                  ×
                </button>
              )}
            </div>
            <button 
              onClick={fetchOnlineExpenses} 
              className="refresh-btn"
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
            <button className="action-icon-btn" title="Print">
              <FontAwesomeIcon icon={faPrint} />
            </button>
            <button className="action-icon-btn" title="Export to Excel">
              <FontAwesomeIcon icon={faFileExcel} />
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="online-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="select-checkbox"
                  />
                </th>
                <th>Bill Date</th>
                <th>Bill Number</th>
                <th>Payee Name</th>
                <th>VAT Reg No</th>
                <th>Without VAT Amount</th>
                <th>VAT Amount</th>
                <th>Total Bill Amount</th>
                <th>Balance</th>
                <th>Description</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr>
                  <td colSpan="11" className="loading-row">
                    <FontAwesomeIcon icon={faSpinner} spin /> Loading online expenses...
                  </td>
                </tr>
              ) : filteredExpenses.length > 0 ? (
                filteredExpenses.map(expense => (
                  <tr key={expense.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(expense.id)}
                        onChange={() => handleSelectOne(expense.id)}
                        className="select-checkbox"
                      />
                    </td>
                    <td className="date-cell">{expense.bill_date}</td>
                    <td className="bill-number-cell">{expense.bill_number || '-'}</td>
                    <td className="payee-cell">{expense.payee_name}</td>
                    <td className="vat-cell">{expense.vat_reg_number || '-'}</td>
                    <td className="amount-cell">{formatCurrency(expense.without_vat_amount)}</td>
                    <td className="amount-cell">{formatCurrency(expense.vat_amount)}</td>
                    <td className="amount-cell total">{formatCurrency(expense.total_bill_amount)}</td>
                    <td className="balance-cell">
                      <span className={parseFloat(expense.balance || 0) > 0 ? 'balance-positive' : 'balance-zero'}>
                        {formatCurrency(expense.balance || 0)}
                      </span>
                    </td>
                    <td className="description-cell">{expense.description || '-'}</td>
                    <td className="action-cell">
                      <button
                        onClick={() => handleEdit(expense)}
                        className="edit-btn"
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        onClick={() => handleDelete(expense.id)}
                        className="delete-btn"
                        title="Delete"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="11" className="empty-row">No online expenses found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Payment Action Bar */}
        <div className="payment-action-bar">
          <div className="selected-info">
            {selectedIds.length > 0 && (
              <span className="selected-count">
                <FontAwesomeIcon icon={faCheckCircle} /> {selectedIds.length} expense(s) selected
              </span>
            )}
          </div>
          <button
            className="btn-pay"
            onClick={handleOpenPaymentModal}
            disabled={isLoading}
          >
            <FontAwesomeIcon icon={faMoneyBillWave} />
            Pay
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="payment-modal-overlay" onClick={handleClosePaymentModal}>
          <div className="payment-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3>
                <FontAwesomeIcon icon={faCreditCard} />
                Payment Details
              </h3>
              <button className="payment-modal-close" onClick={handleClosePaymentModal}>×</button>
            </div>

            <div className="payment-modal-body">
              {/* Left Column - Payment Details */}
              <div className="payment-details-section">
                <div className="payment-section-title">Payment Details</div>
                
                <div className="payment-form-row">
                  <div className="payment-form-group">
                    <label>Payment Date <span className="required">*</span></label>
                    <input
                      type="date"
                      name="payment_date"
                      value={paymentForm.payment_date}
                      onChange={handlePaymentFormChange}
                      className="payment-input"
                    />
                  </div>
                  
                  <div className="payment-form-group">
                    <label>Payee Name</label>
                    <div className="payee-dropdown-wrapper">
                      <div className="payee-input-inner">
                        <input
                          type="text"
                          name="payee_name"
                          value={payeeSearch}
                          onChange={(e) => {
                            setPayeeSearch(e.target.value);
                            setPaymentForm(prev => ({ ...prev, payee_name: e.target.value }));
                          }}
                          className="payment-input"
                          placeholder="Type payee name"
                          autoComplete="off"
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="payment-form-row">
                  <div className="payment-form-group">
                    <label>Bank</label>
                    <div className="custom-select-container">
                      <div 
                        className="custom-select-trigger"
                        onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}
                      >
                        <input
                          type="text"
                          placeholder="Search or select bank..."
                          value={bankSearchTerm}
                          onChange={handleBankSearchChange}
                          onFocus={() => setIsBankDropdownOpen(true)}
                          className="custom-select-input"
                          autoComplete="off"
                        />
                        <FontAwesomeIcon 
                          icon={isBankDropdownOpen ? faChevronUp : faChevronDown} 
                          className="dropdown-icon"
                        />
                      </div>
                      
                      {isBankDropdownOpen && (
                        <div className="custom-select-dropdown">
                          {isFetchingBanks ? (
                            <div className="dropdown-loading">
                              <FontAwesomeIcon icon={faSpinner} spin /> Loading banks...
                            </div>
                          ) : filteredBanks.length > 0 ? (
                            filteredBanks.map(bank => (
                              <div
                                key={bank.id}
                                className="dropdown-item"
                                onClick={() => handleBankSelect(bank.bank_name)}
                              >
                                <FontAwesomeIcon icon={faBuildingColumns} className="dropdown-icon-sm" />
                                {bank.bank_name}
                              </div>
                            ))
                          ) : (
                            <div className="dropdown-empty">No banks found</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="payment-form-group">
                    <label>Voucher Number</label>
                    <input
                      type="text"
                      name="voucher_number"
                      value={paymentForm.voucher_number}
                      onChange={handlePaymentFormChange}
                      className="payment-input"
                      placeholder="Enter voucher number"
                    />
                  </div>
                </div>

                <div className="payment-form-row">
                  <div className="payment-form-group">
                    <label>Reference Number</label>
                    <input
                      type="text"
                      name="reference_number"
                      value={paymentForm.reference_number}
                      onChange={handlePaymentFormChange}
                      className="payment-input"
                      placeholder="Enter reference number"
                    />
                  </div>
                  
                  <div className="payment-form-group">
                    <label>Expense Type</label>
                    <input
                      type="text"
                      name="expense_type"
                      value={paymentForm.expense_type}
                      onChange={handlePaymentFormChange}
                      className="payment-input"
                      readOnly
                    />
                  </div>
                </div>

                <div className="payment-form-row">
                  <div className="payment-form-group full-width">
                    <label>Description</label>
                    <input
                      type="text"
                      name="description"
                      value={paymentForm.description}
                      onChange={handlePaymentFormChange}
                      className="payment-input"
                      placeholder="Enter description"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column - Online Expense Details */}
              <div className="online-details-section">
                <div className="payment-section-title">Online Expense Details</div>
                
                {selectedForPayment.length > 0 && (
                  <div className="online-expense-summary">
                    {selectedForPayment.map((expense, index) => (
                      <div key={expense.id} className="expense-summary-item">
                        <div className="expense-summary-row">
                          <span className="summary-label">Bill Date</span>
                          <span className="summary-value">{expense.bill_date}</span>
                        </div>
                        <div className="expense-summary-row">
                          <span className="summary-label">Bill Number</span>
                          <span className="summary-value">{expense.bill_number || '-'}</span>
                        </div>
                        <div className="expense-summary-row">
                          <span className="summary-label">Bill Amount</span>
                          <span className="summary-value">{formatCurrency(expense.total_bill_amount)}</span>
                        </div>
                        {index < selectedForPayment.length - 1 && <hr className="expense-divider" />}
                      </div>
                    ))}
                  </div>
                )}

                <div className="expense-summary-row total-row">
                  <span className="summary-label">Total Bill Amount</span>
                  <span className="summary-value total-amount">
                    {formatCurrency(selectedForPayment.reduce((sum, exp) => sum + parseFloat(exp.total_bill_amount || 0), 0))}
                  </span>
                </div>

                <div className="expense-summary-row balance-row">
                  <span className="summary-label">Balance</span>
                  <span className="summary-value balance-amount">
                    {formatCurrency(selectedForPayment.reduce((sum, exp) => sum + parseFloat(exp.balance || 0), 0))}
                  </span>
                </div>

                <div className="payment-form-group transfer-row">
                  <label>Transfer Amount <span className="required">*</span></label>
                  <input
                    type="number"
                    name="transfer_amount"
                    value={paymentForm.transfer_amount}
                    onChange={handlePaymentFormChange}
                    className="payment-input transfer-input"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            <div className="payment-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClosePaymentModal}
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={faTimes} />
                Cancel
              </button>
              <button
                type="button"
                className="btn-pay"
                onClick={handleProcessPayment}
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={isLoading ? faSpinner : faMoneyBillWave} spin={isLoading} />
                {isLoading ? 'Processing...' : 'Pay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineExpenses;