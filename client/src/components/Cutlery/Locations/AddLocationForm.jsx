import React, { useId, useState } from 'react';
import { Modal } from '../../common/ui';
import './AddLocationForm.css';

const AddLocationForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({ location_name: '' });
  const [submitting, setSubmitting] = useState(false);
  const formId = useId();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
    <Modal
      title="Add New Location"
      size="sm"
      onClose={submitting ? undefined : onCancel}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            className="btn btn-primary"
            disabled={submitting || !formData.location_name.trim()}
          >
            {submitting ? 'Adding...' : 'Add Location'}
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={handleSubmit} className="ui-form">
        <div className="ui-field">
          <label htmlFor="location_name">Location Name *</label>
          <input
            type="text"
            id="location_name"
            name="location_name"
            value={formData.location_name}
            onChange={handleChange}
            placeholder="Enter location name"
            required
          />
          <small className="ui-field-hint">
            Location ID will be automatically generated (L001, L002, etc.)
          </small>
        </div>
      </form>
    </Modal>
  );
};

export default AddLocationForm;
