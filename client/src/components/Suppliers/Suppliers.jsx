import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import './Suppliers.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import { useNavigate } from "react-router-dom";

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showVatNumber, setShowVatNumber] = useState(false);
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
  const [loading, setLoading] = useState(true);
  const { showPopup } = usePopup();
  const navigate = useNavigate();

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/suppliers');
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      setNewSupplier(prev => ({ 
        ...prev, 
        [name]: checked,
        vat_number: checked ? prev.vat_number : '' // Clear VAT number if not registered
      }));
      setShowVatNumber(checked);
    } else {
      setNewSupplier(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate VAT number if registered
    if (newSupplier.vat_registered && !newSupplier.vat_number.trim()) {
      showPopup('error', 'VAT Number is required for registered suppliers');
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
      setShowForm(false);
      setEditingSupplier(null);
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
      setShowVatNumber(false);

      navigate("/suppliers");
    } catch (error) {
      showPopup('error', `Error saving supplier: ${error.message}`);
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setNewSupplier(supplier);
    setShowVatNumber(supplier.vat_registered);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this supplier?')) return;

    try {
      await api.delete(`/suppliers/${id}`);
      showPopup('success', 'Supplier deleted successfully!');
      fetchSuppliers();
    } catch (error) {
      showPopup('error', `Error deleting supplier: ${error.message}`);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="loading">Loading suppliers...</div>;

  return (
    <div className="suppliers-container">
      <div className="header-buttons">
        <button onClick={() => { 
          setShowForm(true); 
          setEditingSupplier(null); 
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
          setShowVatNumber(false);
        }} className="btn-add">
          <FontAwesomeIcon icon={faPlus} /> Add New Supplier
        </button>

        <div className="search-bar">
          <input
            type="text"
            placeholder="Search by supplier name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {showForm ? (
        <div className="supplier-form">
          <h2>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h2>
          <form onSubmit={handleSubmit} className="form-layout">
            <div className="form-group">
              <label>Supplier Name *</label>
              <input type="text" name="name" value={newSupplier.name} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Address *</label>
              <input type="text" name="address" value={newSupplier.address} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>City *</label>
              <input type="text" name="city" value={newSupplier.city} onChange={handleInputChange} required />
            </div>

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

            {showVatNumber && (
              <div className="form-group">
                <label>VAT Number *</label>
                <input 
                  type="text" 
                  name="vat_number" 
                  value={newSupplier.vat_number} 
                  onChange={handleInputChange} 
                  required={newSupplier.vat_registered}
                />
              </div>
            )}

            <div className="form-group">
              <label>Contact Name *</label>
              <input type="text" name="contact_name" value={newSupplier.contact_name} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Contact Phone *</label>
              <input type="text" name="contact_phone" value={newSupplier.contact_phone} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Contact Email</label>
              <input type="email" name="contact_email" value={newSupplier.contact_email} onChange={handleInputChange} />
            </div>

            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={() => { 
                setShowForm(false); 
                setEditingSupplier(null);
                setShowVatNumber(false);
              }}>
                Cancel
              </button>
              <button type="submit" className="btn-save">
                {editingSupplier ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <h2>Suppliers</h2>

          <div className="table-wrapper">
            <table className="supplier-table">
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>VAT Registered</th>
                  <th>VAT Number</th>
                  <th>Contact Name</th>
                  <th>Contact Phone</th>
                  <th>Contact Email</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map(supplier => (
                  <tr key={supplier.id} className="supplier-row">
                    <td>{supplier.name}</td>
                    <td>{supplier.address}</td>
                    <td>{supplier.city}</td>
                    <td>
                      <span className={`vat-badge ${supplier.vat_registered ? 'yes' : 'no'}`}>
                        {supplier.vat_registered ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{supplier.vat_number || '-'}</td>
                    <td>{supplier.contact_name}</td>
                    <td>{supplier.contact_phone}</td>
                    <td>{supplier.contact_email}</td>
                    <td>
                      <button className="btn-edit" onClick={() => handleEdit(supplier)}>
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button className="btn-delete" onClick={() => handleDelete(supplier.id)}>
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default Suppliers;