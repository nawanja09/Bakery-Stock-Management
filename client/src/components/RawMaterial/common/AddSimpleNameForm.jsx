import React, { useState } from 'react';
import './ManagementForm.css';

/**
 * Generic add form/modal for simple single-field ("name") RM management
 * entities: RM Type, Department, Company.
 *
 * Props:
 *  - title: modal title, e.g. "Add New RM Type"
 *  - fieldLabel: label for the input, e.g. "RM Type Name *"
 *  - placeholder: input placeholder text
 *  - submitLabel: text on the submit button, e.g. "Add RM Type"
 *  - note: optional helper text shown under the input
 *  - onSubmit(value): async function called with the trimmed value
 *  - onCancel(): called to close the modal
 */
const AddSimpleNameForm = ({
  title,
  fieldLabel,
  placeholder,
  submitLabel,
  note,
  onSubmit,
  onCancel,
  initialValue = ''
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleChange = (e) => {
    setValue(e.target.value);
    if (error) setError('');
  };

  const validate = () => {
    if (!value.trim()) {
      setError('This field is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="rm-form-container">
        <div className="rm-form-header">
          <h3>{title}</h3>
          <button type="button" className="rm-close-btn" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rm-form-body" noValidate>
          <label htmlFor="rm-simple-name" className="rm-input-label">
            {fieldLabel}
          </label>
          <input
            type="text"
            id="rm-simple-name"
            name="rm-simple-name"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            autoFocus
            className={`rm-input-field ${error ? 'rm-input-error' : ''}`}
          />
          {error && <span className="rm-field-error">{error}</span>}
          {note && <small className="rm-input-note">{note}</small>}

          <div className="rm-form-actions">
            <button
              type="button"
              className="rm-btn rm-cancel"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rm-btn rm-submit"
              disabled={submitting || !value.trim()}
            >
              {submitting ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddSimpleNameForm;
