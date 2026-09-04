// src/components/Expenses/Payees.jsx
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
  faSync,
  faSpinner,
  faSearch,
  faUserPlus,
  faBuilding,
  faPhone,
  faEnvelope,
  faMapMarkerAlt,
  faIdCard  
} from '@fortawesome/free-solid-svg-icons';
import './Payees.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const Payees = () => {
  const [payees, setPayees] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { showPopup } = usePopup();

  const [formData, setFormData] = useState({
    payee_name: '',
    vat_reg_number: '',
    address: '',
    contact_person: '',
    phone: '',
    email: '',
    notes: ''
  });

  useEffect(() => {
    fetchPayees();
  }, []);

  const fetchPayees = async () => {
    setIsFetching(true);
    try {
      const response = await api.get('/payees');
      setPayees(response.data || []);
    } catch (error) {
      console.error('Error fetching payees:', error);
      showPopup('error', 'Failed to load payees');
    } finally {
      setIsFetching(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.payee_name.trim()) {
      showPopup('error', 'Payee name is required');
      return;
    }

    setIsLoading(true);
    try {
      if (editingId) {
        await api.put(`/payees/${editingId}`, formData);
        showPopup('success', 'Payee updated successfully!');
      } else {
        await api.post('/payees', formData);
        showPopup('success', 'Payee added successfully!');
      }
      
      resetForm();
      await fetchPayees();
    } catch (error) {
      console.error('Error saving payee:', error);
      showPopup('error', error.response?.data?.error || 'Failed to save payee');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (payee) => {
    setEditingId(payee.id);
    setFormData({
      payee_name: payee.payee_name || '',
      vat_reg_number: payee.vat_reg_number || '',
      address: payee.address || '',
      contact_person: payee.contact_person || '',
      phone: payee.phone || '',
      email: payee.email || '',
      notes: payee.notes || ''
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    
    try {
      await api.delete(`/payees/${id}`);
      showPopup('success', 'Payee deleted successfully');
      await fetchPayees();
    } catch (error) {
      console.error('Error deleting payee:', error);
      showPopup('error', error.response?.data?.error || 'Failed to delete payee');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      payee_name: '',
      vat_reg_number: '',
      address: '',
      contact_person: '',
      phone: '',
      email: '',
      notes: ''
    });
    setShowForm(false);
  };

  const filteredPayees = payees.filter(p =>
    p.payee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.vat_reg_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone?.includes(searchTerm)
  );

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>
            <FontAwesomeIcon icon={faUsers} style={{ marginRight: '8px' }} />
            Payees Management
          </h2>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(true); setEditingId(null); setFormData({
            payee_name: '', vat_reg_number: '', address: '', contact_person: '', phone: '', email: '', notes: ''
          }); }}
        >
          <FontAwesomeIcon icon={faUserPlus} /> Add New Payee
        </button>
      </header>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
          <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
            <div>
              <FontAwesomeIcon icon={editingId ? faEdit : faPlus} style={{ marginRight: '8px' }} />
              {editingId ? 'Edit Payee' : 'Add New Payee'}
            </div>
            <button className="btn btn-secondary" onClick={resetForm} style={{ padding: '4px 8px' }}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <h4 style={{ margin: '0 0 var(--spacing-md) 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase' }}>Basic Information</h4>
            <div className="form-grid two-col">
              <div className="payees-form-group">
                <label>Payee Name <span className="required">*</span></label>
                <input
                  type="text"
                  name="payee_name"
                  value={formData.payee_name}
                  onChange={handleChange}
                  placeholder="e.g. Ceylon Electricity Board"
                  className="payees-input"
                  required
                />
              </div>
              <div className="payees-form-group">
                <label>VAT Registration Number</label>
                <input
                  type="text"
                  name="vat_reg_number"
                  value={formData.vat_reg_number}
                  onChange={handleChange}
                  placeholder="e.g. 123456789-1"
                  className="payees-input"
                />
              </div>
            </div>

            <h4 style={{ margin: 'var(--spacing-lg) 0 var(--spacing-md) 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase' }}>Contact Information</h4>
            <div className="form-grid three-col">
              <div className="payees-form-group">
                <label>Contact Person</label>
                <input
                  type="text"
                  name="contact_person"
                  value={formData.contact_person}
                  onChange={handleChange}
                  placeholder="e.g. Mr. Kamal Perera"
                  className="payees-input"
                />
              </div>
              <div className="payees-form-group">
                <label>Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="e.g. 0112345678"
                  className="payees-input"
                />
              </div>
              <div className="payees-form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="e.g. billing@ceb.lk"
                  className="payees-input"
                />
              </div>
            </div>

            <div className="form-grid two-col" style={{ marginTop: 'var(--spacing-lg)' }}>
              <div className="form-group">
                <label>Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows="2"
                  placeholder="Enter address (optional)"
                  className="form-textarea"
                />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows="2"
                  placeholder="Additional notes (optional)"
                  className="form-textarea"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" onClick={resetForm} className="btn btn-secondary" disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                {isLoading ? ' Saving...' : (editingId ? ' Update Payee' : ' Add Payee')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payees Table */}
      <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
        <div className="filters-section" style={{ border: 'none', borderRadius: 0, borderBottom: '1px solid var(--color-border)', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)', paddingBottom: 'var(--spacing-md)' }}>
          <div className="form-section-title" style={{ margin: 0, border: 'none', padding: 0 }}>
            <FontAwesomeIcon icon={faBuilding} style={{ marginRight: '8px' }} />
            Registered Payees
            <span className="badge badge-neutral" style={{ marginLeft: '8px' }}>{filteredPayees.length}</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="report-filter-group" style={{ minWidth: '300px' }}>
              <div style={{ position: 'relative' }}>
                <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  placeholder="Search by name, VAT, contact..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="report-filter-input"
                  style={{ paddingLeft: '32px', width: '100%' }}
                />
                {searchTerm && (
                  <button className="clear-search" style={{ position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSearchTerm('')}>×</button>
                )}
              </div>
            </div>
            <button onClick={fetchPayees} className="btn btn-secondary" disabled={isFetching}>
              <FontAwesomeIcon icon={isFetching ? faSpinner : faSync} spin={isFetching} />
              {isFetching ? ' Loading...' : ' Refresh'}
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Payee Name</th>
                <th>VAT Reg No</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr>
                  <td colSpan="7" className="payees-loading-row">
                    <FontAwesomeIcon icon={faSpinner} spin /> Loading payees...
                  </td>
                </tr>
              ) : filteredPayees.length > 0 ? (
                filteredPayees.map((payee, idx) => (
                  <tr key={payee.id}>
                    <td className="payees-num">{idx + 1}</td>
                    <td className="payees-name">
                      <FontAwesomeIcon icon={faBuilding} className="payees-row-icon" />
                      {payee.payee_name}
                    </td>
                    <td className="payees-vat">{payee.vat_reg_number || '—'}</td>
                    <td>{payee.contact_person || '—'}</td>
                    <td>{payee.phone || '—'}</td>
                    <td>{payee.email || '—'}</td>
                    <td className="payees-action-cell">
                      <button onClick={() => handleEdit(payee)} className="payees-edit-btn" title="Edit">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button onClick={() => handleDelete(payee.id, payee.payee_name)} className="payees-delete-btn" title="Delete">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="payees-empty-row">
                    <FontAwesomeIcon icon={faUsers} style={{ fontSize: '2rem', opacity: 0.3 }} />
                    <p>No payees found. Add your first payee to get started.</p>
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

export default Payees;