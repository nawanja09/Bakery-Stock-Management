// src/components/Expenses/ChequeExpenses.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSave, 
  faTimes, 
  faPlus, 
  faSearch,
  faSync,
  faSpinner,
  faMoneyCheck,
  faCalendarCheck,
  faCheckCircle,
  faEdit,
  faTrash
} from '@fortawesome/free-solid-svg-icons';
import './ChequeExpenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const ChequeExpenses = () => {
  const [activeTab, setActiveTab] = useState('voucher'); // 'voucher', 'unrealised', 'realised'
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [unrealisedCheques, setUnrealisedCheques] = useState([]);
  const [realisedCheques, setRealisedCheques] = useState([]);
  const [payees, setPayees] = useState([]);
  const [payeeSearch, setPayeeSearch] = useState('');
  const [filteredPayees, setFilteredPayees] = useState([]);
  const [selectedPayee, setSelectedPayee] = useState(null);
  const [isPayeesLoading, setIsPayeesLoading] = useState(false);
  const [payeesError, setPayeesError] = useState('');
  const [isPayeeDropdownOpen, setIsPayeeDropdownOpen] = useState(false);
  const [highlightedPayeeIndex, setHighlightedPayeeIndex] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const { showPopup } = usePopup();
  const payeeInputRef = useRef(null);

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
    'Office Supplies',
    'Utilities',
    'Rent',
    'Maintenance',
    'Professional Fees',
    'Advertising',
    'Travel',
    'Training',
    'Insurance',
    'Communication',
    'Transport',
    'Other'
  ];

  const fetchChequeData = useCallback(async () => {
    setIsFetching(true);
    try {
      // Fetch unrealised cheques
      const unrealisedRes = await api.get('/expenses/cheque/unrealised');
      setUnrealisedCheques(unrealisedRes.data || []);

      // Fetch realised cheques
      const realisedRes = await api.get('/expenses/cheque/realised');
      setRealisedCheques(realisedRes.data || []);
    } catch (error) {
      console.error('Error fetching cheque data:', error);
      showPopup('error', 'Failed to load data from server');
      // Set demo data if API fails
      setUnrealisedCheques([]);
      setRealisedCheques([]);
    } finally {
      setIsFetching(false);
    }
  }, [showPopup]);

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

  useEffect(() => {
    fetchChequeData();
    fetchPayees();
  }, [fetchChequeData, fetchPayees]);

  useEffect(() => {
    const query = payeeSearch.trim().toLowerCase();
    const filtered = query === ''
      ? payees
      : payees.filter(payee => payee.payee_name.toLowerCase().includes(query));

    setFilteredPayees(filtered);
    setHighlightedPayeeIndex(0);
  }, [payeeSearch, payees]);

  useEffect(() => {
    const exactMatch = payees.find(
      payee => payee.payee_name.toLowerCase() === payeeSearch.trim().toLowerCase()
    );
    setSelectedPayee(exactMatch || null);
  }, [payeeSearch, payees]);

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

  // Calculate total amount when without_vat or vat changes
  useEffect(() => {
    const withoutVat = parseFloat(formData.without_vat_amount) || 0;
    const vat = parseFloat(formData.vat_amount) || 0;
    const total = withoutVat + vat;
    setFormData(prev => ({ ...prev, total_bill_amount: total.toFixed(2) }));
  }, [formData.without_vat_amount, formData.vat_amount]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
        response = await api.put(`/expenses/cheque/voucher/${editingId}`, payload);
      } else {
        response = await api.post('/expenses/cheque/voucher', payload);
      }
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', editingId ? 'Cheque expense voucher updated successfully!' : 'Cheque expense voucher created successfully!');
        
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
        setEditingId(null);
        
        // Refresh data
        await fetchChequeData();
      }
    } catch (error) {
      console.error(editingId ? 'Error updating cheque voucher:' : 'Error creating cheque voucher:', error);
      showPopup('error', error.response?.data?.error || (editingId ? 'Failed to update voucher' : 'Failed to create voucher'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (cheque) => {
    setEditingId(cheque.id);
    setActiveTab('voucher');
    setFormData({
      bill_date: cheque.date || cheque.bill_date || new Date().toISOString().split('T')[0],
      bill_number: cheque.bill_number || '',
      payee_name: cheque.payee_name || '',
      vat_reg_number: cheque.vat_reg_number || '',
      expense_type: cheque.expense_type || '',
      without_vat_amount: cheque.without_vat_amount != null ? cheque.without_vat_amount.toString() : '',
      vat_amount: cheque.vat_amount != null ? cheque.vat_amount.toString() : '',
      total_bill_amount: cheque.total_bill_amount != null ? cheque.total_bill_amount.toString() : '',
      description: cheque.description || ''
    });
    setPayeeSearch(cheque.payee_name || '');
    setSelectedPayee(null);
    document.querySelector('.voucher-form-container')?.scrollIntoView({ behavior: 'smooth' });
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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this cheque voucher?')) return;

    setIsLoading(true);
    try {
      const response = await api.delete(`/expenses/cheque/voucher/${id}`);
      if (response.status === 200) {
        showPopup('success', 'Cheque voucher deleted successfully!');
        await fetchChequeData();
      }
    } catch (error) {
      console.error('Error deleting cheque voucher:', error);
      showPopup('error', error.response?.data?.error || 'Failed to delete cheque voucher');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRealiseCheque = async (chequeId, realiseDate) => {
    if (!realiseDate) {
      showPopup('error', 'Please select realise date');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.put(`/expenses/cheque/realise/${chequeId}`, {
        realise_date: realiseDate
      });
      
      if (response.status === 200) {
        showPopup('success', 'Cheque realised successfully!');
        await fetchChequeData();
      }
    } catch (error) {
      console.error('Error realising cheque:', error);
      showPopup('error', error.response?.data?.error || 'Failed to realise cheque');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChequeRealiseChange = (id, field, value) => {
    setUnrealisedCheques(prev => 
      prev.map(cheque => {
        if (cheque.id === id) {
          const updatedCheque = { ...cheque, [field]: value };
          // If checking "is_realised" and no date, set today's date
          if (field === 'is_realised' && value && !updatedCheque.realise_date) {
            updatedCheque.realise_date = new Date().toISOString().split('T')[0];
          }
          return updatedCheque;
        }
        return cheque;
      })
    );
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

  const filteredUnrealised = unrealisedCheques.filter(cheque =>
    cheque.cheque_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cheque.payee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cheque.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRealised = realisedCheques.filter(cheque =>
    cheque.cheque_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cheque.payee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cheque.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="cheque-expenses-container">
      <div className="cheque-header">
        <h1 className="cheque-title">
          <FontAwesomeIcon icon={faMoneyCheck} className="title-icon" />
          Cheque Expenses Management
        </h1>
      </div>

      {/* Tab Navigation */}
      <div className="cheque-tabs">
        <button 
          className={`tab-button ${activeTab === 'voucher' ? 'active' : ''}`}
          onClick={() => setActiveTab('voucher')}
        >
          <FontAwesomeIcon icon={faPlus} />
          Expenses Cheque Book
        </button>
        <button 
          className={`tab-button ${activeTab === 'unrealised' ? 'active' : ''}`}
          onClick={() => setActiveTab('unrealised')}
        >
          <FontAwesomeIcon icon={faCalendarCheck} />
          Unrealised Expense Cheques
        </button>
        <button 
          className={`tab-button ${activeTab === 'realised' ? 'active' : ''}`}
          onClick={() => setActiveTab('realised')}
        >
          <FontAwesomeIcon icon={faCheckCircle} />
          Realised Expense Cheques
        </button>
      </div>

      {/* New Expense Voucher Form */}
      {activeTab === 'voucher' && (
        <div className="voucher-form-container">
          <div className="form-card">
            <h3 className="form-title">
              <FontAwesomeIcon icon={editingId ? faEdit : faPlus} />
              {editingId ? 'Edit Expense Voucher' : 'New Expense Voucher'}
            </h3>
            
            <form onSubmit={handleSubmit} className="cheque-form">
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
                    if (editingId) {
                      setEditingId(null);
                    }
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
                  {isLoading ? (editingId ? 'Updating...' : 'Submitting...') : (editingId ? 'Update Voucher' : 'Submit Voucher')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unrealise Expense Cheques Table */}
      {activeTab === 'unrealised' && (
        <div className="unrealised-container">
          <div className="search-section">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search from Cheque Number, Payee Name, Voucher Number..."
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
              onClick={fetchChequeData} 
              className="refresh-btn"
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
          </div>

          <div className="table-container">
            <table className="cheque-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher Number</th>
                  <th>Cheque Number</th>
                  <th>Payee Name</th>
                  <th>Amount (LKR)</th>
                  <th>Cheque Realise</th>
                  <th>Realise Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isFetching ? (
                  <tr>
                    <td colSpan="8" className="loading-row">
                      <FontAwesomeIcon icon={faSpinner} spin /> Loading cheques...
                    </td>
                  </tr>
                ) : filteredUnrealised.length > 0 ? (
                  filteredUnrealised.map(cheque => (
                    <tr key={cheque.id}>
                      <td>{cheque.date}</td>
                      <td className="voucher-number">{cheque.voucher_number}</td>
                      <td className="cheque-number">{cheque.cheque_number}</td>
                      <td>{cheque.payee_name}</td>
                      <td className="amount-cell">{formatCurrency(cheque.amount)}</td>
                      <td className="checkbox-cell">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={cheque.is_realised || false}
                            onChange={(e) => handleChequeRealiseChange(cheque.id, 'is_realised', e.target.checked)}
                            className="realise-checkbox"
                          />
                          <span className="checkmark"></span>
                        </label>
                      </td>
                      <td>
                        <input
                          type="date"
                          value={cheque.realise_date || ''}
                          onChange={(e) => handleChequeRealiseChange(cheque.id, 'realise_date', e.target.value)}
                          className="realise-date-input"
                        />
                      </td>
                      <td className="action-cell">
                        <button
                          onClick={() => handleEdit(cheque)}
                          className="edit-btn"
                          title="Edit"
                        >
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button
                          onClick={() => handleDelete(cheque.id)}
                          className="delete-btn"
                          title="Delete"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                        <button
                          onClick={() => handleRealiseCheque(cheque.id, cheque.realise_date)}
                          className="save-btn"
                          disabled={!cheque.realise_date || isLoading}
                        >
                          <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                          Save
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty-row">No unrealised cheques found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Realised Expense Cheques Table */}
      {activeTab === 'realised' && (
        <div className="unrealised-container">
          <div className="search-section">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search from Cheque Number, Payee Name, Voucher Number..."
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
              onClick={fetchChequeData} 
              className="refresh-btn"
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
          </div>

          <div className="table-container">
            <table className="cheque-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher Number</th>
                  <th>Cheque Number</th>
                  <th>Payee Name</th>
                  <th>Amount (LKR)</th>
                  <th>Realise Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {isFetching ? (
                  <tr>
                    <td colSpan="7" className="loading-row">
                      <FontAwesomeIcon icon={faSpinner} spin /> Loading cheques...
                    </td>
                  </tr>
                ) : filteredRealised.length > 0 ? (
                  filteredRealised.map(cheque => (
                    <tr key={cheque.id}>
                      <td>{cheque.date}</td>
                      <td className="voucher-number">{cheque.voucher_number}</td>
                      <td className="cheque-number">{cheque.cheque_number}</td>
                      <td>{cheque.payee_name}</td>
                      <td className="amount-cell">{formatCurrency(cheque.amount)}</td>
                      <td>{cheque.realise_date}</td>
                      <td>
                        <span className="status-badge realised">Realised</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="empty-row">No realised cheques found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChequeExpenses;