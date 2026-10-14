import React, { useState, useEffect, useId } from 'react';
import { Modal } from '../../common/ui';
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
  const formId = useId();

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
    <Modal
      title={title}
      size="sm"
      onClose={submitting ? undefined : onCancel}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={submitting || !payeeName.trim()}>
            {submitting ? 'Saving...' : submitLabel}
          </button>
        </>
      )}
    >
      <form id={formId} className="ui-form" onSubmit={handleSubmit} noValidate>
        <div className={`ui-field ${error ? 'has-error' : ''}`.trim()}>
          <label htmlFor="rm-payee-name">Payee Name *</label>
          <input
            type="text"
            id="rm-payee-name"
            name="rm-payee-name"
            value={payeeName}
            onChange={handleNameChange}
            placeholder="e.g. Ceylon Electricity Board"
            aria-invalid={Boolean(error)}
          />
          {error && <span className="ui-field-error">{error}</span>}
        </div>
        <div className="ui-field">
          <label htmlFor="rm-payee-vat">VAT Reg Number</label>
          <input
            type="text"
            id="rm-payee-vat"
            name="rm-payee-vat"
            value={vatRegNumber}
            onChange={(e) => setVatRegNumber(e.target.value)}
            placeholder="e.g. 123456789-1 (optional)"
          />
        </div>
      </form>
    </Modal>
  );
};

export default AddPayeeForm;
