import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationTriangle, faTrashAlt, faInfoCircle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import Modal from './Modal';

const TONE_ICON = {
  danger: faTrashAlt,
  warning: faExclamationTriangle,
  info: faInfoCircle,
  success: faCheckCircle,
};

/**
 * Yes / no question before an action that changes data
 * (delete, approve, settle, release...).
 */
const ConfirmDialog = ({
  open = true,
  title = 'Are you sure?',
  message,
  tone = 'danger',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) => (
  <Modal
    open={open}
    onClose={busy ? undefined : onCancel}
    size="sm"
    ariaLabel={title}
    className={`ui-confirm ui-confirm-${tone}`}
    footer={(
      <>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          {cancelText}
        </button>
        <button
          type="button"
          className={`btn ${tone === 'danger' ? 'btn-danger' : tone === 'warning' ? 'btn-warning' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Please wait…' : confirmText}
        </button>
      </>
    )}
  >
    <div className="ui-confirm-content">
      <span className="ui-confirm-icon" aria-hidden="true">
        <FontAwesomeIcon icon={TONE_ICON[tone] || faInfoCircle} />
      </span>
      <div>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
      </div>
    </div>
  </Modal>
);

export default ConfirmDialog;
