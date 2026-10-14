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

import { useConfirm } from '../common/ui';
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
  const confirm = useConfirm();
  const [banks, setBanks] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [baseTransactions, setBaseTransactions] = useState(0);
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
    if (name === 'opening_balance') {
      const parsed = parseFloat(value);
      const op = Number.isFinite(parsed) ? parsed : 0;
      let newCurrent;
      if (editingId) {
        newCurrent = value === '' ? baseTransactions : Number((op + baseTransactions).toFixed(2));
      } else {
        newCurrent = value;
      }
      setFormData(prev => ({
        ...prev,
        opening_balance: value,
        current_balance: newCurrent
      }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.bank_name.trim()) {
      showPopup('error', 'Bank name is required');
      return;
    }
    setIsLoading(true);
    try {
      const parsedOpening = formData.opening_balance === '' || formData.opening_balance == null
        ? 0
        : parseFloat(formData.opening_balance);
      const resolvedOpening = Number.isFinite(parsedOpening) ? parsedOpening : 0;

      const parsedCurrent = formData.current_balance === '' || formData.current_balance == null
        ? (editingId ? Number((resolvedOpening + baseTransactions).toFixed(2)) : resolvedOpening)
        : parseFloat(formData.current_balance);
      const resolvedCurrent = Number.isFinite(parsedCurrent) ? parsedCurrent : resolvedOpening;

      const payload = {
        ...formData,
        opening_balance: resolvedOpening,
        current_balance: resolvedCurrent
      };

      if (editingId) {
        await api.put(`/expenses/banks/${editingId}`, payload);
        showPopup('success', 'Bank updated successfully!');
      } else {
        await api.post('/expenses/banks', payload);
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
    const op = bank.opening_balance !== null && bank.opening_balance !== undefined && bank.opening_balance !== ''
      ? parseFloat(bank.opening_balance)
      : 0;
    const cur = bank.current_balance !== null && bank.current_balance !== undefined && bank.current_balance !== ''
      ? parseFloat(bank.current_balance)
      : op;
    const transactions = Number((cur - op).toFixed(2));
    setBaseTransactions(transactions);

    setFormData({
      bank_name: bank.bank_name || '',
      account_number: bank.account_number || '',
      branch_name: bank.branch_name || '',
      account_type: bank.account_type || 'Current',
      currency: bank.currency || 'LKR',
      opening_balance: bank.opening_balance ?? '',
      current_balance: cur,
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
    if (!await confirm('Are you sure you want to delete this bank?')) return;
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
    setBaseTransactions(0);
    setFormData(emptyForm);
    setShowForm(false);
  };

  const formatCurrency = (val) => {
    if (val == null || val === '') return '—';
    const num = parseFloat(val);
    if (!Number.isFinite(num)) return '—';
    const formatted = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return num < 0 ? `-${formatted}` : formatted;
  };

  const filtered = banks.filter(b =>
    b.bank_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.account_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.branch_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="erp-page">
      {/* Header */}
      <div className="filters-section" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-heading)' }}>
            <FontAwesomeIcon icon={faBuildingColumns} style={{ marginRight: '8px', color: 'var(--color-primary)' }} />
            Bank Details
          </h2>
          <p className="text-muted" style={{ marginTop: '4px' }}>Manage your bank accounts for expense tracking</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setEditingId(null); setBaseTransactions(0); setFormData(emptyForm); }}
        >
          <FontAwesomeIcon icon={faPlus} /> Add New Bank
        </button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>
              <FontAwesomeIcon icon={editingId ? faEdit : faPlus} style={{ marginRight: '8px', color: 'var(--color-text-secondary)' }} />
              {editingId ? ' Edit Bank' : ' Add New Bank'}
            </h3>
            <button className="btn-icon" onClick={resetForm}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <h4 style={{ margin: '0 0 16px 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Basic Information</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label>Bank Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  name="bank_name"
                  value={formData.bank_name}
                  onChange={handleChange}
                  placeholder="e.g. Commercial Bank of Ceylon"
                  required
                />
              </div>
              <div>
                <label>Account Number</label>
                <input
                  type="text"
                  name="account_number"
                  value={formData.account_number}
                  onChange={handleChange}
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div>
                <label>Branch Name</label>
                <input
                  type="text"
                  name="branch_name"
                  value={formData.branch_name}
                  onChange={handleChange}
                  placeholder="e.g. Colombo Main Branch"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <div>
                <label>Account Type</label>
                <select name="account_type" value={formData.account_type} onChange={handleChange}>
                  <option value="Current">Current</option>
                  <option value="Savings">Savings</option>
                  <option value="Fixed Deposit">Fixed Deposit</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label>Currency</label>
                <select name="currency" value={formData.currency} onChange={handleChange}>
                  <option value="LKR">LKR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label>Company <span className="text-danger">*</span></label>
                <select name="company" value={formData.company} onChange={handleChange}>
                  <option value="JH">JH</option>
                  <option value="RD">RD</option>
                  <option value="RR">RR</option>
                </select>
              </div>
              <div>
                <label>Status</label>
                <select name="status" value={formData.status} onChange={handleChange}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <h4 style={{ margin: '0 0 16px 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Balance Information</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label>Opening Balance (LKR)</label>
                <input
                  type="number"
                  name="opening_balance"
                  value={formData.opening_balance}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="2"
                placeholder="Additional notes (optional)"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
              <button type="button" onClick={resetForm} className="btn btn-secondary" disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                {isLoading ? ' Saving...' : (editingId ? ' Update Bank' : ' Add Bank')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="filters-section" style={{ border: 'none', borderRadius: 0, borderBottom: '1px solid var(--color-border)', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>
            <FontAwesomeIcon icon={faUniversity} className="text-muted" style={{ marginRight: '8px' }} />
            Registered Banks
            <span className="badge badge-neutral" style={{ marginLeft: '8px' }}>{filtered.length}</span>
          </h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="items-search" style={{ minWidth: '300px' }}>
              <FontAwesomeIcon icon={faSearch} className="text-muted" />
              <input
                type="text"
                placeholder="Search by bank name, account, branch..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="btn-icon" style={{ width: '24px', height: '24px', border: 'none' }} onClick={() => setSearchTerm('')}>×</button>
              )}
            </div>
            <button onClick={fetchBanks} className="btn btn-secondary" disabled={isFetching}>
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              {isFetching ? ' Loading...' : ' Refresh'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="erp-data-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                <th>Bank Name</th>
                <th>Account Number</th>
                <th>Branch</th>
                <th>Type</th>
                <th>Company</th>
                <th style={{ textAlign: 'right' }}>Current Balance</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr>
                  <td colSpan="9" className="text-center text-muted" style={{ padding: '32px' }}>
                    <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: '24px', marginBottom: '8px' }} />
                    <br />
                    Loading banks...
                  </td>
                </tr>
              ) : filtered.length > 0 ? (
                filtered.map((bank, idx) => (
                  <tr key={bank.id} style={bank.status === 'Inactive' ? { opacity: 0.6 } : {}}>
                    <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{idx + 1}</td>
                    <td>
                      <FontAwesomeIcon icon={faBuildingColumns} style={{ marginRight: '8px', color: 'var(--color-text-muted)' }} />
                      <strong>{bank.bank_name}</strong>
                    </td>
                    <td>{bank.account_number || '—'}</td>
                    <td>{bank.branch_name || '—'}</td>
                    <td>
                      <span className="badge badge-neutral">{bank.account_type || 'Current'}</span>
                    </td>
                    <td>
                      <span className="badge badge-primary">{bank.company || '—'}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: parseFloat(bank.current_balance) < 0 ? '#dc3545' : 'inherit' }}>
                      <span style={{ fontSize: '0.85em', color: 'var(--color-text-muted)', marginRight: '4px' }}>LKR</span>
                      {formatCurrency(bank.current_balance)}
                    </td>
                    <td>
                      <span className={`badge ${bank.status === 'Active' ? 'badge-success' : 'badge-neutral'}`}>
                        {bank.status || 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleToggleStatus(bank)}
                          className={`btn-icon ${bank.status === 'Active' ? 'delete' : 'edit'}`}
                          title={bank.status === 'Active' ? 'Deactivate' : 'Activate'}
                        >
                          <FontAwesomeIcon icon={bank.status === 'Active' ? faToggleOn : faToggleOff} />
                        </button>
                        <button onClick={() => handleEdit(bank)} className="btn-icon edit" title="Edit">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button onClick={() => handleDelete(bank.id)} className="btn-icon delete" title="Delete">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center text-muted" style={{ padding: '48px' }}>
                    <FontAwesomeIcon icon={faBuildingColumns} style={{ fontSize: '32px', opacity: 0.3, marginBottom: '16px' }} />
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
