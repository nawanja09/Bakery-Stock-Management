// src/components/Expenses/BankDetails.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuildingColumns,
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
  faSync,
  faSearch,
  faSpinner,
  faToggleOn,
  faToggleOff,
  faUniversity,
  faMoneyBillWave
} from '@fortawesome/free-solid-svg-icons';
import './BankDetails.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const emptyForm = {
  bank_name: '',
  account_number: '',
  branch_name: '',
  account_type: 'Current',
  currency: 'LKR',
  opening_balance: '',
  current_balance: '',
  company: 'JH',
  notes: '',
  status: 'Active'
};

const BankDetails = () => {
  const [banks, setBanks] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchBanks();
  }, []);

  const fetchBanks = async () => {
    setIsFetching(true);
    try {
      const res = await api.get('/expenses/banks/all');
      setBanks(res.data || []);
    } catch (err) {
      console.error('Error fetching banks:', err);
      showPopup('error', 'Failed to load banks');
    } finally {
      setIsFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      if (name === 'opening_balance') {
        const openingBalance = value;
        const currentBalance = prev.current_balance === '' || parseFloat(prev.current_balance) === parseFloat(prev.opening_balance)
          ? openingBalance
          : prev.current_balance;
        return { ...prev, opening_balance: openingBalance, current_balance: currentBalance };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.bank_name.trim()) {
      showPopup('error', 'Bank name is required');
      return;
    }
    setIsLoading(true);
    try {
      if (editingId) {
        await api.put(`/expenses/banks/${editingId}`, formData);
        showPopup('success', 'Bank updated successfully!');
      } else {
        await api.post('/expenses/banks', formData);
        showPopup('success', 'Bank added successfully!');
      }
      resetForm();
      await fetchBanks();
    } catch (err) {
      console.error(err);
      showPopup('error', err.response?.data?.error || 'Failed to save bank');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (bank) => {
    setEditingId(bank.id);
    setFormData({
      bank_name: bank.bank_name || '',
      account_number: bank.account_number || '',
      branch_name: bank.branch_name || '',
      account_type: bank.account_type || 'Current',
      currency: bank.currency || 'LKR',
      opening_balance: bank.opening_balance ?? '',
      current_balance: bank.current_balance ?? bank.opening_balance ?? '',
      company: bank.company || 'JH',
      notes: bank.notes || '',
      status: bank.status || 'Active'
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleStatus = async (bank) => {
    const newStatus = bank.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await api.put(`/expenses/banks/${bank.id}`, { ...bank, status: newStatus });
      showPopup('success', `Bank marked as ${newStatus}`);
      await fetchBanks();
    } catch (err) {
      showPopup('error', 'Failed to update status');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this bank?')) return;
    try {
      await api.delete(`/expenses/banks/${id}`);
      showPopup('success', 'Bank removed successfully');
      await fetchBanks();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to delete bank');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(false);
  };

  const formatCurrency = (val) => {
    if (val == null || val === '') return '—';
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(val);
  };

  const filtered = banks.filter(b =>
    b.bank_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.account_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.branch_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bd-container">
      {/* Header */}
      <div className="bd-header">
        <div className="bd-header-left">
          <h1 className="bd-title">
            <FontAwesomeIcon icon={faBuildingColumns} className="bd-title-icon" />
            Bank Details
          </h1>
          <p className="bd-subtitle">Manage your bank accounts for expense tracking</p>
        </div>
        <button
          className="bd-btn-primary"
          onClick={() => { setShowForm(true); setEditingId(null); setFormData(emptyForm); }}
        >
          <FontAwesomeIcon icon={faPlus} /> Add New Bank
        </button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bd-form-card">
          <div className="bd-form-header">
            <h3>
              <FontAwesomeIcon icon={editingId ? faEdit : faPlus} />
              {editingId ? ' Edit Bank' : ' Add New Bank'}
            </h3>
            <button className="bd-close-btn" onClick={resetForm}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="bd-form">
            <div className="bd-section-label">Basic Information</div>
            <div className="bd-form-row">
              <div className="bd-form-group">
                <label>Bank Name <span className="bd-required">*</span></label>
                <input
                  type="text"
                  name="bank_name"
                  value={formData.bank_name}
                  onChange={handleChange}
                  placeholder="e.g. Commercial Bank of Ceylon"
                  className="bd-input"
                  required
                />
              </div>
              <div className="bd-form-group">
                <label>Account Number</label>
                <input
                  type="text"
                  name="account_number"
                  value={formData.account_number}
                  onChange={handleChange}
                  placeholder="e.g. 1234567890"
                  className="bd-input"
                />
              </div>
              <div className="bd-form-group">
                <label>Branch Name</label>
                <input
                  type="text"
                  name="branch_name"
                  value={formData.branch_name}
                  onChange={handleChange}
                  placeholder="e.g. Colombo Main Branch"
                  className="bd-input"
                />
              </div>
            </div>

            <div className="bd-form-row">
              <div className="bd-form-group">
                <label>Account Type</label>
                <select name="account_type" value={formData.account_type} onChange={handleChange} className="bd-select">
                  <option value="Current">Current</option>
                  <option value="Savings">Savings</option>
                  <option value="Fixed Deposit">Fixed Deposit</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="bd-form-group">
                <label>Currency</label>
                <select name="currency" value={formData.currency} onChange={handleChange} className="bd-select">
                  <option value="LKR">LKR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div className="bd-form-group">
                <label>Company <span className="bd-required">*</span></label>
                <select name="company" value={formData.company} onChange={handleChange} className="bd-select">
                  <option value="JH">JH</option>
                  <option value="RD">RD</option>
                  <option value="RR">RR</option>
                </select>
              </div>
              <div className="bd-form-group">
                <label>Status</label>
                <select name="status" value={formData.status} onChange={handleChange} className="bd-select">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="bd-section-label">Balance Information</div>
            <div className="bd-form-row">
              <div className="bd-form-group">
                <label>Opening Balance (LKR)</label>
                <input
                  type="number"
                  name="opening_balance"
                  value={formData.opening_balance}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="bd-input"
                />
              </div>
              <div className="bd-form-group">
                <label>Current Balance (LKR)</label>
                <input
                  type="number"
                  name="current_balance"
                  value={formData.current_balance}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="bd-input"
                />
              </div>
            </div>

            <div className="bd-form-group bd-full-width">
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="2"
                placeholder="Additional notes (optional)"
                className="bd-textarea"
              />
            </div>

            <div className="bd-form-actions">
              <button type="button" onClick={resetForm} className="bd-btn-secondary" disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button type="submit" className="bd-btn-primary" disabled={isLoading}>
                <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                {isLoading ? ' Saving...' : (editingId ? ' Update Bank' : ' Add Bank')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bd-table-card">
        <div className="bd-table-header">
          <h3 className="bd-table-title">
            <FontAwesomeIcon icon={faUniversity} /> Registered Banks
            <span className="bd-count">{filtered.length}</span>
          </h3>
          <div className="bd-table-actions">
            <div className="bd-search-box">
              <FontAwesomeIcon icon={faSearch} className="bd-search-icon" />
              <input
                type="text"
                placeholder="Search by bank name, account, branch..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bd-search-input"
              />
              {searchTerm && (
                <button className="bd-clear-search" onClick={() => setSearchTerm('')}>×</button>
              )}
            </div>
            <button onClick={fetchBanks} className="bd-refresh-btn" disabled={isFetching}>
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              {isFetching ? ' Loading...' : ' Refresh'}
            </button>
          </div>
        </div>

        <div className="bd-table-container">
          <table className="bd-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Bank Name</th>
                <th>Account Number</th>
                <th>Branch</th>
                <th>Type</th>
                <th>Company</th>
                <th>Current Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr>
                  <td colSpan="9" className="bd-loading-row">
                    <FontAwesomeIcon icon={faSpinner} spin /> Loading banks...
                  </td>
                </tr>
              ) : filtered.length > 0 ? (
                filtered.map((bank, idx) => (
                  <tr key={bank.id} className={bank.status === 'Inactive' ? 'bd-row-inactive' : ''}>
                    <td className="bd-num">{idx + 1}</td>
                    <td className="bd-bank-name">
                      <FontAwesomeIcon icon={faBuildingColumns} className="bd-row-icon" />
                      {bank.bank_name}
                    </td>
                    <td>{bank.account_number || '—'}</td>
                    <td>{bank.branch_name || '—'}</td>
                    <td>
                      <span className="bd-badge bd-badge-type">{bank.account_type || 'Current'}</span>
                    </td>
                    <td>
                      <span className="bd-badge bd-badge-company">{bank.company || '—'}</span>
                    </td>
                    <td className="bd-balance">
                      <FontAwesomeIcon icon={faMoneyBillWave} className="bd-money-icon" />
                      {formatCurrency(bank.current_balance)}
                    </td>
                    <td>
                      <span className={`bd-badge ${bank.status === 'Active' ? 'bd-badge-active' : 'bd-badge-inactive'}`}>
                        {bank.status || 'Active'}
                      </span>
                    </td>
                    <td className="bd-action-cell">
                      <button
                        onClick={() => handleToggleStatus(bank)}
                        className="bd-toggle-btn"
                        title={bank.status === 'Active' ? 'Deactivate' : 'Activate'}
                      >
                        <FontAwesomeIcon icon={bank.status === 'Active' ? faToggleOn : faToggleOff} />
                      </button>
                      <button onClick={() => handleEdit(bank)} className="bd-edit-btn" title="Edit">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button onClick={() => handleDelete(bank.id)} className="bd-delete-btn" title="Delete">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="bd-empty-row">
                    <FontAwesomeIcon icon={faBuildingColumns} style={{ fontSize: '2rem', opacity: 0.3 }} />
                    <p>No banks found. Add your first bank to get started.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BankDetails;
