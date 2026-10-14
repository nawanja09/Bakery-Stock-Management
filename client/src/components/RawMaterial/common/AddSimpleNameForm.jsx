import React, { useId, useState } from 'react';
import { Modal } from '../../common/ui';
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
  const formId = useId();

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
    <Modal
      title={title}
      size="sm"
      onClose={submitting ? undefined : onCancel}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={submitting || !value.trim()}>
            {submitting ? 'Saving...' : submitLabel}
          </button>
        </>
      )}
    >
      <form id={formId} className="ui-form" onSubmit={handleSubmit} noValidate>
        <div className={`ui-field ${error ? 'has-error' : ''}`.trim()}>
          <label htmlFor="rm-simple-name">{fieldLabel}</label>
          <input
            type="text"
            id="rm-simple-name"
            name="rm-simple-name"
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
          />
          {error && <span className="ui-field-error">{error}</span>}
          {note && <small className="ui-field-hint">{note}</small>}
        </div>
      </form>
    </Modal>
  );
};

export default AddSimpleNameForm;
