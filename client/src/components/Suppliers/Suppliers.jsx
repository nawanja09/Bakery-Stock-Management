//client/src/components/Suppliers/Supplier.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import './Suppliers.css';

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    address: '',
    city: '',
    contact_name: '',
    contact_phone: '',
    contact_email: ''
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/suppliers');
      const data = await response.json();
      setSuppliers(data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewSupplier(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5000/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier)
      });

      if (response.ok) {
        await fetchSuppliers();
        setShowForm(false);
        setNewSupplier({
          name: '',
          address: '',
          city: '',
          contact_name: '',
          contact_phone: '',
          contact_email: ''
        });
      } else {
        console.error('Failed to add supplier');
      }
    } catch (error) {
      console.error('Error adding supplier:', error);
    }
  };

  if (loading) return <div className="loading">Loading suppliers...</div>;

  return (
    <div className="suppliers-container">
      <div className="header-buttons">
        <button onClick={() => setShowForm(true)} className="btn-add">
          <FontAwesomeIcon icon={faPlus} /> Add New Supplier
        </button>
      </div>

      {showForm ? (
        <div className="supplier-form">
          <h2>Add Supplier</h2>
          <form onSubmit={handleSubmit} className="form-layout">
            <div className="form-group">
              <label>Supplier Name</label>
              <input type="text" name="name" value={newSupplier.name} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Address</label>
              <input type="text" name="address" value={newSupplier.address} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>City</label>
              <input type="text" name="city" value={newSupplier.city} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Contact Name</label>
              <input type="text" name="contact_name" value={newSupplier.contact_name} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Contact Phone</label>
              <input type="text" name="contact_phone" value={newSupplier.contact_phone} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Contact Email</label>
              <input type="email" name="contact_email" value={newSupplier.contact_email} onChange={handleInputChange} />
            </div>

            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-save">Save</button>
            </div>
          </form>
        </div>
      ) : (
        <>
          <h2>Suppliers</h2>
          <table className="supplier-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>City</th>
                <th>Contact Name</th>
                <th>Phone</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(supplier => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.address}</td>
                  <td>{supplier.city}</td>
                  <td>{supplier.contact_name}</td>
                  <td>{supplier.contact_phone}</td>
                  <td>{supplier.contact_email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default Suppliers;
