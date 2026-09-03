// src/components/common/Popup.jsx
import React, { useEffect } from 'react';
import './Popup.css';

const Popup = ({
  type = 'success',
  title,
  message,
  onClose,
  confirmText = 'Continue',
  duration = 4500
}) => {
  useEffect(() => {
    if (!onClose || duration <= 0) return undefined;

    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const resolvedTitle = title || (type === 'success' ? 'Success' : type === 'error' ? 'Something went wrong' : type === 'warning' ? 'Warning' : 'Notice');
  const resolvedIcon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '!' : 'i';

  return (
    <div
      className="notification-overlay"
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
      onClick={onClose}
    >
      <div className={`notification-popup ${type}`} onClick={(e) => e.stopPropagation()}>
        <div className="notification-icon-wrap">
          <span className="notification-icon">{resolvedIcon}</span>
        </div>

        <div className="notification-body">
          <h3 className="notification-title">{resolvedTitle}</h3>
          <p className="notification-message">{message}</p>
        </div>

        <div className="notification-actions">
          <button type="button" className="notification-ok-btn" onClick={onClose}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Popup;