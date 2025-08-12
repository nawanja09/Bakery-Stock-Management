// src/components/common/Popup.jsx
import React from 'react';
import './Popup.css';

const Popup = ({ type, message, onClose }) => {
  return (
    <div className="popup-overlay">
      <div className={`popup-container ${type}`}>
        <div className="popup-header">
          <h3>{type === 'success' ? '✓ Success!' : '✗ Error'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="popup-content">
          <p>{message}</p>
        </div>
        <div className="popup-footer">
          <button className="btn-ok" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
};

export default Popup;