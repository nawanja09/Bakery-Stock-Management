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
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-content" style={{ width: '400px', maxWidth: '90%' }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            <label htmlFor="rm-simple-name">
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
              style={{ borderColor: error ? 'var(--color-danger)' : undefined }}
            />
            {error && <span className="text-danger" style={{ fontSize: 'var(--font-size-xs)', marginTop: '4px', display: 'block' }}>{error}</span>}
            {note && <small className="text-muted" style={{ display: 'block', marginTop: '4px' }}>{note}</small>}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
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
