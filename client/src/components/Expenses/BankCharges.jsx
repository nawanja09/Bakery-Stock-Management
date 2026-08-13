// src/components/Expenses/BankCharges.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  faBuildingColumns,
  faUniversity,
  faChevronDown,
  faChevronUp
} from '@fortawesome/free-solid-svg-icons';
import './BankCharges.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const BankCharges = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isFetchingBanks, setIsFetchingBanks] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankSearchTerm, setBankSearchTerm] = useState('');
  const [bankCharges, setBankCharges] = useState([]);
  const [banks, setBanks] = useState([]);
  const [filteredBanks, setFilteredBanks] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const { showPopup } = usePopup();
  const navigate = useNavigate();

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    bank_name: '',
    reference_number: '',
    charges_type: '',
    bank_charge_type_id: '',
    description: '',
    amount: ''
  });

  const [chargesTypes, setChargesTypes] = useState([]);

  // Fetch banks on component mount
  useEffect(() => {
    fetchBanks();
    fetchChargesTypes();
  }, []);

  const fetchChargesTypes = async () => {
    try {
      const response = await api.get('/bank-charges-types');
      setChargesTypes(response.data || []);
    } catch (error) {
      console.error('Error fetching bank charge types:', error);
      showPopup('error', 'Failed to load bank charge types from server');
    }
  };

  // Fetch bank charges on component mount
  useEffect(() => {
    fetchBankCharges();
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

  const fetchBanks = async () => {
    setIsFetchingBanks(true);
    try {
      const response = await api.get('/expenses/banks');
      const banksData = response.data || [];
      setBanks(banksData);
      setFilteredBanks(banksData);
    } catch (error) {
      console.error('Error fetching banks:', error);
      showPopup('error', 'Failed to load banks from server');
    } finally {
      setIsFetchingBanks(false);
    }
  };

  const fetchBankCharges = async () => {
    setIsFetching(true);
    try {
      const response = await api.get('/expenses/bank-charges');
      setBankCharges(response.data || []);
    } catch (error) {
      console.error('Error fetching bank charges:', error);
      showPopup('error', 'Failed to load data from server');
    } finally {
      setIsFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBankSelect = (bankName) => {
    setFormData(prev => ({ ...prev, bank_name: bankName }));
    setBankSearchTerm(bankName);
    setIsBankDropdownOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.date || !formData.bank_name || !formData.charges_type || !formData.amount) {
      showPopup('error', 'Please fill all required fields');
      return;
    }
    
    if (parseFloat(formData.amount) <= 0) {
      showPopup('error', 'Valid amount is required');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        date: formData.date,
        bank_name: formData.bank_name,
        reference_number: formData.reference_number || null,
        charges_type: formData.charges_type,
        description: formData.description || null,
        amount: parseFloat(formData.amount)
      };

      const response = await api.post('/expenses/bank-charges', payload);
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', 'Bank charge recorded successfully!');
        
        // Reset form
        setFormData({
          date: new Date().toISOString().split('T')[0],
          bank_name: '',
          reference_number: '',
          charges_type: '',
          description: '',
          amount: ''
        });
        setBankSearchTerm('');
        
        // Refresh data
        await fetchBankCharges();
      }
    } catch (error) {
      console.error('Error creating bank charge:', error);
      showPopup('error', error.response?.data?.error || 'Failed to record bank charge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (charge) => {
    setEditingId(charge.id);
    setFormData({
      date: charge.date,
      bank_name: charge.bank_name,
      reference_number: charge.reference_number || '',
      charges_type: charge.charges_type,
      bank_charge_type_id: charge.bank_charge_type_id || '',
      description: charge.description || '',
      amount: charge.amount.toString()
    });
    setBankSearchTerm(charge.bank_name);
    setIsBankDropdownOpen(false);
    // Scroll to form
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    if (!formData.date || !formData.bank_name || !formData.charges_type || !formData.amount) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        date: formData.date,
        bank_name: formData.bank_name,
        reference_number: formData.reference_number || null,
        charges_type: formData.charges_type,
        description: formData.description || null,
        amount: parseFloat(formData.amount)
      };

      const response = await api.put(`/expenses/bank-charges/${editingId}`, payload);
      
      if (response.status === 200) {
        showPopup('success', 'Bank charge updated successfully!');
        
        // Reset form and editing state
        setFormData({
          date: new Date().toISOString().split('T')[0],
          bank_name: '',
          reference_number: '',
          charges_type: '',
          description: '',
          amount: ''
        });
        setBankSearchTerm('');
        setEditingId(null);
        
        // Refresh data
        await fetchBankCharges();
      }
    } catch (error) {
      console.error('Error updating bank charge:', error);
      showPopup('error', error.response?.data?.error || 'Failed to update bank charge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this bank charge?')) {
      setIsLoading(true);
      try {
        const response = await api.delete(`/expenses/bank-charges/${id}`);
        
        if (response.status === 200) {
          showPopup('success', 'Bank charge deleted successfully!');
          await fetchBankCharges();
        }
      } catch (error) {
        console.error('Error deleting bank charge:', error);
        showPopup('error', error.response?.data?.error || 'Failed to delete bank charge');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      bank_name: '',
      reference_number: '',
      charges_type: '',
      bank_charge_type_id: '',
      description: '',
      amount: ''
    });
    setBankSearchTerm('');
    setIsBankDropdownOpen(false);
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

  const filteredCharges = bankCharges.filter(charge =>
    charge.bank_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    charge.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    charge.charges_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    charge.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bank-charges-container">
      <div className="bank-header">
        <h1 className="bank-title">
          <FontAwesomeIcon icon={faBuildingColumns} className="title-icon" />
          Bank Charges Management
        </h1>
      </div>

      {/* New Bank Charge Form */}
      <div className="form-card">
        <h3 className="form-title">
          <FontAwesomeIcon icon={editingId ? faEdit : faPlus} />
          {editingId ? 'Edit Bank Charge' : 'New Bank Charge'}
        </h3>
        
        <form onSubmit={editingId ? handleUpdate : handleSubmit} className="bank-form">
          <div className="form-row">
            <div className="form-group">
              <label>Date <span className="required">*</span></label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>Bank <span className="required">*</span></label>
              <div className="custom-select-container">
                <div 
                  className="custom-select-trigger"
                  onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}
                >
                  <input
                    type="text"
                    placeholder="Search or select bank..."
                    value={bankSearchTerm}
                    onChange={(e) => {
                      setBankSearchTerm(e.target.value);
                      setIsBankDropdownOpen(true);
                    }}
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
                          {bank.bank_name}
                        </div>
                      ))
                    ) : (
                      <div className="dropdown-empty">
                        {banks.length === 0 ? (
                          <>
                            <span>No banks available. </span>
                            <button 
                              type="button"
                              className="add-bank-link"
                              onClick={() => navigate('/expenses/bank-details')}
                            >
                              Add bank details first?
                            </button>
                          </>
                        ) : (
                          'No matching banks found'
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {formData.bank_name && (
                <small className="selected-bank-info">
                  Selected: <strong>{formData.bank_name}</strong>
                </small>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Reference Number</label>
              <input
                type="text"
                name="reference_number"
                value={formData.reference_number}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter reference number (optional)"
              />
            </div>
            
            <div className="form-group">
              <label>Charges Type <span className="required">*</span></label>
              <select
                name="bank_charge_type_id"
                value={formData.bank_charge_type_id}
                onChange={(e) => {
                  const selectedType = chargesTypes.find(t => t.id.toString() === e.target.value);
                  setFormData(prev => ({
                    ...prev,
                    bank_charge_type_id: e.target.value,
                    charges_type: selectedType ? selectedType.type_name : ''
                  }));
                }}
                required
                className="form-select"
              >
                <option value="">Select Charges Type</option>
                {chargesTypes.map(type => (
                  <option key={type.id} value={type.id}>{type.type_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group full-width">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="form-textarea"
              rows="2"
              placeholder="Enter description (optional)"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount (LKR) <span className="required">*</span></label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                required
                min="0.01"
                step="0.01"
                className="form-input amount-input"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-actions">
            {editingId && (
              <button 
                type="button" 
                onClick={handleCancelEdit}
                className="btn-secondary"
              >
                <FontAwesomeIcon icon={faTimes} />
                Cancel
              </button>
            )}
            <button 
              type="button" 
              onClick={() => {
                setFormData({
                  date: new Date().toISOString().split('T')[0],
                  bank_name: '',
                  reference_number: '',
                  charges_type: '',
                  bank_charge_type_id: '',
                  description: '',
                  amount: ''
                });
                setBankSearchTerm('');
                setIsBankDropdownOpen(false);
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
              {isLoading ? 'Processing...' : (editingId ? 'Update Charge' : 'Submit')}
            </button>
          </div>
        </form>
      </div>

      {/* Bank Charge Details Table */}
      <div className="table-section">
        <div className="table-header">
          <h3 className="table-title">
            <FontAwesomeIcon icon={faUniversity} />
            Bank Charge Details
          </h3>
          <div className="table-actions">
            <div className="search-box">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Search by bank, reference, charges type..."
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
              onClick={fetchBankCharges} 
              className="refresh-btn"
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              Refresh
            </button>
            <button 
              onClick={fetchBanks}
              className="refresh-btn"
              disabled={isFetchingBanks}
              title="Refresh Bank List"
            >
              <FontAwesomeIcon icon={faBuildingColumns} />
              Refresh Banks
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
          <table className="bank-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bank Name</th>
                <th>Reference Number</th>
                <th>Charges Type</th>
                <th>Description</th>
                <th>Amount (LKR)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr>
                  <td colSpan="7" className="loading-row">
                    <FontAwesomeIcon icon={faSpinner} spin /> Loading bank charges...
                  </td>
                </tr>
              ) : filteredCharges.length > 0 ? (
                filteredCharges.map(charge => (
                  <tr key={charge.id}>
                    <td className="date-cell">{charge.date}</td>
                    <td className="bank-cell">{charge.bank_name}</td>
                    <td className="reference-cell">{charge.reference_number || '-'}</td>
                    <td>{charge.charges_type}</td>
                    <td className="description-cell">{charge.description || '-'}</td>
                    <td className="amount-cell">{formatCurrency(charge.amount)}</td>
                    <td className="action-cell">
                      <button
                        onClick={() => handleEdit(charge)}
                        className="edit-btn"
                        title="Edit"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        onClick={() => handleDelete(charge.id)}
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
                  <td colSpan="7" className="empty-row">No bank charges found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default BankCharges;