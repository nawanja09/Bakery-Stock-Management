import React, { useState } from 'react';
import './AddLocationForm.css';

const AddLocationForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    location_name: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.location_name.trim()) {
      alert('Please enter a location name');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-location-form-overlay">
      <div className="add-location-form-container">
        <div className="add-location-form-header">
          <h3>Add New Location</h3>
          <button 
            type="button" 
            className="btn-close"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-location-form">
          <div className="form-group">
            <label htmlFor="location_name">Location Name *</label>
            <input
              type="text"
              id="location_name"
              name="location_name"
              value={formData.location_name}
              onChange={handleChange}
              placeholder="Enter location name"
              required
              autoFocus
            />
            <small>Location ID will be automatically generated (L001, L002, etc.)</small>
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn-submit"
              disabled={submitting || !formData.location_name.trim()}
            >
              {submitting ? 'Adding...' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLocationForm;