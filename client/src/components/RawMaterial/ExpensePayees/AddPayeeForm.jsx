import React, { useState, useEffect } from 'react';
import '../common/ManagementForm.css';

/**
 * Add/edit form/modal for Expenses Payees. Same visual language as
 * AddSimpleNameForm (used by Companies / RM Item Types / Departments)
 * but with the two fields a payee needs: Payee Name and VAT Reg Number.
 *
 * Props:
 *  - title: modal title, e.g. "Add New Payee"
 *  - submitLabel: text on the submit button
 *  - onSubmit({ payee_name, vat_reg_number }): async function
 *  - onCancel(): called to close the modal
 *  - initialValue: { payee_name, vat_reg_number } for editing
 */
const AddPayeeForm = ({
  title,
  submitLabel,
  onSubmit,
  onCancel,
  initialValue = { payee_name: '', vat_reg_number: '' }
}) => {
  const [payeeName, setPayeeName] = useState(initialValue.payee_name || '');
  const [vatRegNumber, setVatRegNumber] = useState(initialValue.vat_reg_number || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPayeeName(initialValue.payee_name || '');
    setVatRegNumber(initialValue.vat_reg_number || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue.payee_name, initialValue.vat_reg_number]);

  const handleNameChange = (e) => {
    setPayeeName(e.target.value);
    if (error) setError('');
  };

  const validate = () => {
    if (!payeeName.trim()) {
      setError('Payee name is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        payee_name: payeeName.trim(),
        vat_reg_number: vatRegNumber.trim() || null
      });
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
          <label htmlFor="rm-payee-name" className="rm-input-label">
            Payee Name *
          </label>
          <input
            type="text"
            id="rm-payee-name"
            name="rm-payee-name"
            value={payeeName}
            onChange={handleNameChange}
            placeholder="e.g. Ceylon Electricity Board"
            autoFocus
            className={`rm-input-field ${error ? 'rm-input-error' : ''}`}
          />
          {error && <span className="rm-field-error">{error}</span>}

          <label htmlFor="rm-payee-vat" className="rm-input-label" style={{ marginTop: '14px' }}>
            VAT Reg Number
          </label>
          <input
            type="text"
            id="rm-payee-vat"
            name="rm-payee-vat"
            value={vatRegNumber}
            onChange={(e) => setVatRegNumber(e.target.value)}
            placeholder="e.g. 123456789-1 (optional)"
            className="rm-input-field"
          />

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
              disabled={submitting || !payeeName.trim()}
            >
              {submitting ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPayeeForm;
