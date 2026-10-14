// src/components/Expenses/BankCharges.jsx
import React, { useState, useEffect } from 'react';
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
  faUniversity
} from '@fortawesome/free-solid-svg-icons';
import './BankCharges.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

import { useConfirm } from '../common/ui';
const BankCharges = () => {
  const confirm = useConfirm();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isFetchingBanks, setIsFetchingBanks] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankCharges, setBankCharges] = useState([]);
  const [banks, setBanks] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const { showPopup } = usePopup();

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    company_id: '',
    bank_name: '',
    bank_id: '',
    reference_number: '',
    charges_type: '',
    bank_charge_type_id: '',
    description: '',
    amount: ''
  });

  const [chargesTypes, setChargesTypes] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Fetch banks on component mount
  useEffect(() => {
    fetchBanks();
    fetchChargesTypes();
    fetchCompanies();
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

  const fetchCompanies = async () => {
    try {
      const response = await api.get('/companies');
      setCompanies(response.data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      showPopup('error', 'Failed to load companies from server');
    }
  };

  // Fetch bank charges on component mount
  useEffect(() => {
    fetchBankCharges();
  }, []);

  const fetchBanks = async (companyId) => {
    if (!companyId) {
      setBanks([]);
      return;
    }

    setIsFetchingBanks(true);
    try {
      const response = await api.get('/expenses/banks', { params: { company_id: companyId } });
      const banksData = response.data || [];
      setBanks(banksData);
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
    if (name === 'company_id') {
      setFormData(prev => ({ ...prev, company_id: value, bank_name: '', bank_id: '' }));
      fetchBanks(value);
      return;
    }
    if (name === 'bank_name') {
      setFormData(prev => ({ ...prev, bank_name: value, bank_id: '' }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const bankNames = [...new Set(banks.map(bank => bank.bank_name))];
  const bankAccounts = banks.filter(bank => bank.bank_name === formData.bank_name);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.date || !formData.company_id || !formData.bank_name || !formData.bank_id || !formData.charges_type || !formData.amount) {
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
        company_id: formData.company_id,
        bank_name: formData.bank_name,
        bank_id: formData.bank_id || null,
        reference_number: formData.reference_number || null,
        charges_type: formData.charges_type,
        bank_charge_type_id: formData.bank_charge_type_id || null,
        description: formData.description || null,
        amount: parseFloat(formData.amount)
      };

      const response = await api.post('/expenses/bank-charges', payload);
      
      if (response.status === 201 || response.status === 200) {
        showPopup('success', 'Bank charge recorded successfully!');
        
        // Reset form
        setFormData({
          date: new Date().toISOString().split('T')[0],
          company_id: '',
          bank_name: '',
          bank_id: '',
          reference_number: '',
          charges_type: '',
          description: '',
          amount: ''
        });
        
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
      company_id: charge.company_id || '',
      bank_name: charge.bank_name,
      bank_id: charge.bank_id || '',
      reference_number: charge.reference_number || '',
      charges_type: charge.charges_type,
      bank_charge_type_id: charge.bank_charge_type_id || '',
      description: charge.description || '',
      amount: charge.amount.toString()
    });
    fetchBanks(charge.company_id);
    // Scroll to form
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    if (!formData.date || !formData.company_id || !formData.bank_name || !formData.bank_id || !formData.charges_type || !formData.amount) {
      showPopup('error', 'Please fill all required fields');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        date: formData.date,
        company_id: formData.company_id,
        bank_name: formData.bank_name,
        bank_id: formData.bank_id || null,
        reference_number: formData.reference_number || null,
        charges_type: formData.charges_type,
        bank_charge_type_id: formData.bank_charge_type_id || null,
        description: formData.description || null,
        amount: parseFloat(formData.amount)
      };

      const response = await api.put(`/expenses/bank-charges/${editingId}`, payload);
      
      if (response.status === 200) {
        showPopup('success', 'Bank charge updated successfully!');
        
        // Reset form and editing state
        setFormData({
          date: new Date().toISOString().split('T')[0],
          company_id: '',
          bank_name: '',
          bank_id: '',
          reference_number: '',
          charges_type: '',
          description: '',
          amount: ''
        });
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
    if (await confirm('Are you sure you want to delete this bank charge?')) {
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
      company_id: '',
      bank_name: '',
      bank_id: '',
      reference_number: '',
      charges_type: '',
      bank_charge_type_id: '',
      description: '',
      amount: ''
    });
    setBanks([]);
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
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>
            <FontAwesomeIcon icon={faBuildingColumns} style={{ marginRight: '8px' }} />
            Bank Charges Management
          </h2>
        </div>
      </header>

      {/* New Bank Charge Form */}
      <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
        <h3 className="form-section-title">
          <FontAwesomeIcon icon={editingId ? faEdit : faPlus} style={{ marginRight: '8px' }} />
          {editingId ? 'Edit Bank Charge' : 'New Bank Charge'}
        </h3>
        
        <form onSubmit={editingId ? handleUpdate : handleSubmit}>
          <div className="form-grid two-col">
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
              <label>Company <span className="required">*</span></label>
              <select name="company_id" value={formData.company_id} onChange={handleChange} required className="form-select">
                <option value="">Select Company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Bank Name <span className="required">*</span></label>
              <select name="bank_name" value={formData.bank_name} onChange={handleChange} required disabled={!formData.company_id || isFetchingBanks} className="form-select">
                <option value="">{!formData.company_id ? 'Select a company first' : isFetchingBanks ? 'Loading banks...' : bankNames.length === 0 ? 'No banks available for this company' : 'Select Bank Name'}</option>
                {bankNames.map(bankName => <option key={bankName} value={bankName}>{bankName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Bank Account <span className="required">*</span></label>
              <select name="bank_id" value={formData.bank_id} onChange={handleChange} required disabled={!formData.bank_name} className="form-select">
                <option value="">{!formData.bank_name ? 'Select a bank first' : bankAccounts.length === 0 ? 'No accounts available for this bank' : 'Select Bank Account'}</option>
                {bankAccounts.map(bank => <option key={bank.id} value={bank.id}>{bank.account_number || `Account #${bank.id}`}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid two-col">
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

            <div className="form-grid two-col">
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
            <div className="form-group">
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
                  company_id: '',
                  bank_name: '',
                  bank_id: '',
                  reference_number: '',
                  charges_type: '',
                  bank_charge_type_id: '',
                  description: '',
                  amount: ''
                });
                setBanks([]);
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
      <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
        <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
          <div>
            <FontAwesomeIcon icon={faUniversity} style={{ marginRight: '8px' }} />
            Bank Charge Details
          </div>
          <div className="report-filter-actions">
            <button className="btn btn-secondary" title="Print">
              <FontAwesomeIcon icon={faPrint} /> Print
            </button>
            <button className="btn btn-success" title="Export to Excel">
              <FontAwesomeIcon icon={faFileExcel} /> Export
            </button>
          </div>
        </div>

        <div className="filters-section" style={{ marginBottom: 'var(--spacing-md)' }}>
          <div className="report-filter-group" style={{ flex: '1 1 auto', maxWidth: '300px' }}>
            <div style={{ position: 'relative' }}>
              <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--color-text-tertiary)' }} />
              <input
                type="text"
                placeholder="Search by bank, reference, charges type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="report-filter-input"
                style={{ paddingLeft: '32px', width: '100%' }}
              />
              {searchTerm && (
                <button 
                  className="clear-search"
                  onClick={() => setSearchTerm('')}
                  style={{ position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="report-filter-actions" style={{ marginLeft: 'auto' }}>
            <button 
              onClick={fetchBankCharges} 
              className="btn btn-secondary"
              disabled={isFetching}
            >
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} style={{ marginRight: '8px' }} />
              Refresh
            </button>
            <button 
              onClick={() => fetchBanks(formData.company_id)}
              className="btn btn-secondary"
              disabled={isFetchingBanks}
              title="Refresh Company Bank List"
            >
              <FontAwesomeIcon icon={faBuildingColumns} style={{ marginRight: '8px' }} />
              Refresh Banks
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bank Name</th>
                <th>Company</th>
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
                  <td colSpan="8" className="loading-row">
                    <FontAwesomeIcon icon={faSpinner} spin /> Loading bank charges...
                  </td>
                </tr>
              ) : filteredCharges.length > 0 ? (
                filteredCharges.map(charge => (
                  <tr key={charge.id}>
                    <td className="date-cell">{charge.date}</td>
                    <td className="bank-cell">{charge.bank_name}</td>
                    <td>{charge.company_name || '-'}</td>
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
                  <td colSpan="8" className="empty-row">No bank charges found</td>
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
