import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faTimes, faSave } from '@fortawesome/free-solid-svg-icons';
import './Suppliers.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [formErrors, setFormErrors] = useState({});
  
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    address: '',
    city: '',
    vat_registered: false,
    vat_number: '',
    contact_name: '',
    contact_phone: '',
    contact_email: ''
  });
  
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/suppliers');
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      showPopup('error', 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  // VAT Number validation function
  const validateVATNumber = (vatNumber, isVatRegistered) => {
    // If not registered, VAT number is not required and should be empty
    if (!isVatRegistered) {
      return { isValid: true, message: '' };
    }
    
    // Check if VAT number is provided
    if (!vatNumber || vatNumber.trim() === '') {
      return { 
        isValid: false, 
        message: 'VAT Number is required for registered suppliers' 
      };
    }
    
    const cleanVatNumber = vatNumber.trim();
    
    // Check if it contains only digits
    const digitsOnlyRegex = /^\d+$/;
    if (!digitsOnlyRegex.test(cleanVatNumber)) {
      return { 
        isValid: false, 
        message: 'VAT Number must contain only digits (0-9)' 
      };
    }
    
    // Check if it's exactly 9 digits
    if (cleanVatNumber.length !== 9) {
      return { 
        isValid: false, 
        message: 'VAT Number must be exactly 9 digits long' 
      };
    }
    
    return { isValid: true, message: '' };
  };

  // Validate entire form
  const validateForm = () => {
    const errors = {};
    
    // Required fields validation
    if (!newSupplier.name.trim()) errors.name = 'Supplier name is required';
    if (!newSupplier.address.trim()) errors.address = 'Address is required';
    if (!newSupplier.city.trim()) errors.city = 'City is required';
    if (!newSupplier.contact_name.trim()) errors.contact_name = 'Contact name is required';
    if (!newSupplier.contact_phone.trim()) errors.contact_phone = 'Contact phone is required';
    
    // Phone number validation (10 digits)
    if (newSupplier.contact_phone && !/^\d{10}$/.test(newSupplier.contact_phone.trim())) {
      errors.contact_phone = 'Contact phone must be exactly 10 digits';
    }
    
    // Email validation (if provided)
    if (newSupplier.contact_email && 
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newSupplier.contact_email.trim())) {
      errors.contact_email = 'Please enter a valid email address';
    }
    
    // VAT validation
    const vatValidation = validateVATNumber(newSupplier.vat_number, newSupplier.vat_registered);
    if (!vatValidation.isValid) {
      errors.vat_number = vatValidation.message;
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      setNewSupplier(prev => ({ 
        ...prev, 
        [name]: checked,
        vat_number: checked ? prev.vat_number : '' // Clear VAT number if not registered
      }));
      
      // Clear VAT error when toggling off
      if (!checked) {
        setFormErrors(prev => ({ ...prev, vat_number: '' }));
      }
    } else {
      // Special handling for VAT number input
      if (name === 'vat_number') {
        // Only allow digits
        const digitsOnly = value.replace(/\D/g, '');
        // Limit to 9 digits
        const limitedValue = digitsOnly.slice(0, 9);
        
        setNewSupplier(prev => ({ ...prev, [name]: limitedValue }));
        
        // Real-time validation
        if (newSupplier.vat_registered) {
          const validation = validateVATNumber(limitedValue, true);
          setFormErrors(prev => ({ 
            ...prev, 
            vat_number: validation.isValid ? '' : validation.message 
          }));
        }
      } 
      // Special handling for phone number
      else if (name === 'contact_phone') {
        const digitsOnly = value.replace(/\D/g, '');
        const limitedValue = digitsOnly.slice(0, 10);
        setNewSupplier(prev => ({ ...prev, [name]: limitedValue }));
      }
      else {
        setNewSupplier(prev => ({ ...prev, [name]: value }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) {
      showPopup('error', 'Please fix the errors in the form');
      return;
    }

    try {
      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, newSupplier);
        showPopup('success', 'Supplier updated successfully!');
      } else {
        await api.post('/suppliers', newSupplier);
        showPopup('success', 'Supplier added successfully!');
      }

      await fetchSuppliers();
      resetForm();
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      showPopup('error', `Error: ${errorMessage}`);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingSupplier(null);
    setFormErrors({});
    setNewSupplier({
      name: '',
      address: '',
      city: '',
      vat_registered: false,
      vat_number: '',
      contact_name: '',
      contact_phone: '',
      contact_email: ''
    });
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setNewSupplier(supplier);
    setShowForm(true);
    setFormErrors({});
  };

  const handleDelete = async (id, supplierName) => {
    if (!window.confirm(`Are you sure you want to delete supplier "${supplierName}"?`)) {
      return;
    }

    try {
      await api.delete(`/suppliers/${id}`);
      showPopup('success', 'Supplier deleted successfully!');
      fetchSuppliers();
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      showPopup('error', `Error deleting supplier: ${errorMessage}`);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="suppliers-container">
        <div className="loading-spinner">Loading suppliers...</div>
      </div>
    );
  }

  return (
    <div className="suppliers-container">
      <div className="header-section">
        <h1>Supplier Management</h1>
        <div className="header-actions">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by name, contact, or city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
          <button 
            onClick={() => {
              resetForm();
              setShowForm(true);
            }} 
            className="btn-add"
          >
            <FontAwesomeIcon icon={faPlus} /> Add New Supplier
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="supplier-form">
          <div className="form-header">
            <h2>{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h2>
            <button onClick={resetForm} className="btn-close">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              {/* Basic Information */}
              <div className="form-section">
                <h3>Basic Information</h3>
                
                <div className="form-group">
                  <label>Supplier Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={newSupplier.name}
                    onChange={handleInputChange}
                    className={formErrors.name ? 'error' : ''}
                    placeholder="Enter supplier name"
                  />
                  {formErrors.name && <span className="error-message">{formErrors.name}</span>}
                </div>

                <div className="form-group">
                  <label>Address *</label>
                  <input
                    type="text"
                    name="address"
                    value={newSupplier.address}
                    onChange={handleInputChange}
                    className={formErrors.address ? 'error' : ''}
                    placeholder="Enter street address"
                  />
                  {formErrors.address && <span className="error-message">{formErrors.address}</span>}
                </div>

                <div className="form-group">
                  <label>City *</label>
                  <input
                    type="text"
                    name="city"
                    value={newSupplier.city}
                    onChange={handleInputChange}
                    className={formErrors.city ? 'error' : ''}
                    placeholder="Enter city"
                  />
                  {formErrors.city && <span className="error-message">{formErrors.city}</span>}
                </div>
              </div>

              {/* VAT Information */}
              <div className="form-section">
                <h3>Tax Information</h3>
                
                <div className="form-group toggle-group">
                  <label className="toggle-label">
                    <span>VAT Registered</span>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        name="vat_registered"
                        checked={newSupplier.vat_registered}
                        onChange={handleInputChange}
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </label>
                </div>

                {newSupplier.vat_registered && (
                  <div className="form-group">
                    <label>VAT Number *</label>
                    <input
                      type="text"
                      name="vat_number"
                      value={newSupplier.vat_number}
                      onChange={handleInputChange}
                      className={formErrors.vat_number ? 'error' : ''}
                      placeholder="Enter 9-digit VAT number"
                      maxLength="9"
                    />
                    <small className="input-hint">Must be exactly 9 digits (numbers only)</small>
                    {formErrors.vat_number && (
                      <span className="error-message">{formErrors.vat_number}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Contact Information */}
              <div className="form-section full-width">
                <h3>Contact Information</h3>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Contact Name *</label>
                    <input
                      type="text"
                      name="contact_name"
                      value={newSupplier.contact_name}
                      onChange={handleInputChange}
                      className={formErrors.contact_name ? 'error' : ''}
                      placeholder="Enter contact person name"
                    />
                    {formErrors.contact_name && (
                      <span className="error-message">{formErrors.contact_name}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Contact Phone *</label>
                    <input
                      type="tel"
                      name="contact_phone"
                      value={newSupplier.contact_phone}
                      onChange={handleInputChange}
                      className={formErrors.contact_phone ? 'error' : ''}
                      placeholder="Enter 10-digit phone number"
                      maxLength="10"
                    />
                    <small className="input-hint">Must be exactly 10 digits</small>
                    {formErrors.contact_phone && (
                      <span className="error-message">{formErrors.contact_phone}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Contact Email</label>
                    <input
                      type="email"
                      name="contact_email"
                      value={newSupplier.contact_email}
                      onChange={handleInputChange}
                      className={formErrors.contact_email ? 'error' : ''}
                      placeholder="Enter email address"
                    />
                    {formErrors.contact_email && (
                      <span className="error-message">{formErrors.contact_email}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" onClick={resetForm} className="btn-cancel">
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button type="submit" className="btn-save">
                <FontAwesomeIcon icon={faSave} /> {editingSupplier ? 'Update' : 'Save'} Supplier
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <div className="suppliers-list">
            {filteredSuppliers.length === 0 ? (
              <div className="no-results">
                <p>No suppliers found</p>
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="btn-clear">
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="supplier-table">
                  <thead>
                    <tr>
                      <th>Supplier Name</th>
                      <th>Address</th>
                      <th>City</th>
                      <th>VAT Status</th>
                      <th>VAT Number</th>
                      <th>Contact Person</th>
                      <th>Contact Phone</th>
                      <th>Contact Email</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.map(supplier => (
                      <tr key={supplier.id} className="supplier-row">
                        <td className="supplier-name">{supplier.name}</td>
                        <td>{supplier.address}</td>
                        <td>{supplier.city}</td>
                        <td>
                          <span className={`vat-badge ${supplier.vat_registered ? 'yes' : 'no'}`}>
                            {supplier.vat_registered ? 'Registered' : 'Not Registered'}
                          </span>
                        </td>
                        <td>
                          {supplier.vat_registered ? (
                            <span className="vat-number">{supplier.vat_number}</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>{supplier.contact_name}</td>
                        <td>{supplier.contact_phone}</td>
                        <td>{supplier.contact_email || '-'}</td>
                        <td className="actions">
                          <button 
                            className="btn-edit" 
                            onClick={() => handleEdit(supplier)}
                            title="Edit supplier"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button 
                            className="btn-delete" 
                            onClick={() => handleDelete(supplier.id, supplier.name)}
                            title="Delete supplier"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className="table-footer">
            <span>Total: {filteredSuppliers.length} supplier(s)</span>
          </div>
        </>
      )}
    </div>
  );
};

export default Suppliers;