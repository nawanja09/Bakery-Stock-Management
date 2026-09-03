import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';
import api from '../../api';
import { formatNumber, formatQuantity } from '../../utils/formatters';

const ModalPortal = ({ children, onClose }) => {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div className="issuance-modal-overlay" onClick={onClose}>
      <div className="issuance-modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
};

// Modal version of IssuanceDetails for popup use - FIXED UI
const IssuanceDetailsModal = ({ id, onClose }) => {
  const [issuance, setIssuance] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchIssuance = async () => {
      try {
        const response = await api.get(`/issuances/${id}`);
        setIssuance(response.data);
      } catch (err) {
        showPopup('error', 'Failed to fetch issuance details');
      } finally {
        setLoading(false);
      }
    };
    fetchIssuance();
  }, [id, showPopup]);

  if (loading) return (
    <div className="modal-loading">
      <div className="loading-spinner"></div>
      <p>Loading issuance details...</p>
    </div>
  );
  
  if (!issuance) return (
    <div className="modal-error">
      <p>No issuance data found</p>
      <button onClick={onClose} className="btn-secondary">Close</button>
    </div>
  );

  return (
    <div className="issuance-detail-modal">
      {/* Header */}
      <div className="detail-modal-header">
        <div className="detail-modal-title">
          <h2>Issuance Details</h2>
          <span className="detail-id">#{issuance.id}</span>
        </div>
        <button className="btn-close-modal" onClick={onClose}>&#10005;</button>
      </div>

      {/* Information Cards */}
      <div className="detail-info-grid">
        <div className="detail-info-card">
          <span className="detail-label">Date & Time</span>
          <span className="detail-value">{new Date(issuance.issuance_date).toLocaleString()}</span>
        </div>
        <div className="detail-info-card">
          <span className="detail-label">Department</span>
          <span className="detail-value">{issuance.department_name || 'N/A'}</span>
        </div>
        <div className="detail-info-card">
          <span className="detail-label">Received By</span>
          <span className="detail-value">{issuance.received_by || 'N/A'}</span>
        </div>
        <div className="detail-info-card">
          <span className="detail-label">Time of Day</span>
          <span className="detail-value">{issuance.remarks || 'N/A'}</span>
        </div>
        {issuance.approved_by && (
          <div className="detail-info-card">
            <span className="detail-label">Approved By</span>
            <span className="detail-value">{issuance.approved_by}</span>
          </div>
        )}
        {issuance.check_number && (
          <div className="detail-info-card">
            <span className="detail-label">Check Number</span>
            <span className="detail-value">{issuance.check_number}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="detail-items-section">
        <h3>Issued Items</h3>
        <div className="detail-table-responsive">
          <table className="detail-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {issuance.items && issuance.items.length > 0 ? (
                issuance.items.map((item, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td><span className="item-code-badge">{item.item_code || 'N/A'}</span></td>
                    <td>{item.item_name}</td>
                    <td className="quantity-cell">{formatQuantity(item.quantity)}</td>
                    <td>{item.unit || 'N/A'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-items-message">No items found in this issuance</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="detail-modal-footer">
        <button onClick={onClose} className="btn-secondary">Close</button>
      </div>
    </div>
  );
};

const IssuanceHistory = () => {
  const [issuances, setIssuances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssuanceId, setSelectedIssuanceId] = useState(null);

  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleView = (id) => setSelectedIssuanceId(id);
  const handleEdit = (id) => { window.location.href = `/issuance/edit/${id}`; };

  useEffect(() => {
    const fetchIssuances = async () => {
      try {
        const response = await api.get('/issuances');
        const sorted = response.data.sort((a, b) => new Date(b.issuance_date) - new Date(a.issuance_date));
        setIssuances(sorted);
      } catch (error) {
        console.error('Error fetching issuances:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchIssuances();
  }, []);

  // Apply filters
  const filteredIssuances = issuances.filter((issuance) => {
    const issuanceDate = new Date(issuance.issuance_date);
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;

    const matchesDate =
      (!from || issuanceDate >= from) &&
      (!to || issuanceDate <= to);

    return matchesDate;
  });

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="issuance-container">
      <div className="header-with-actions">
        <h2 style={{ margin: 0 }}>RM Issue Summary</h2>
      </div>

      {/* Filter Section - Single Line */}
      <div className="filters-bar single-line" style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "20px" }}>
        <label style={{ margin: 0 }}>
          From:
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="filter-input"
            style={{ marginLeft: "8px" }}
          />
        </label>
        <label style={{ margin: 0 }}>
          To:
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="filter-input"
            style={{ marginLeft: "8px" }}
          />
        </label>
      </div>

      {/* Table */}
      <div className="table-responsive" style={{ width: "100%" }}>
        <table className="issuance-table styled-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date & Time</th>
              <th>Department</th>
              <th>Received By</th>
              <th>Time of Day</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredIssuances.length > 0 ? (
              filteredIssuances.map(issuance => (
                <tr key={issuance.id}>
                  <td data-label="ID">{formatNumber(issuance.id)}</td>
                  <td data-label="Date & Time">{new Date(issuance.issuance_date).toLocaleString()}</td>
                  <td data-label="Department">{issuance.department_name}</td>
                  <td data-label="Received By">{issuance.received_by}</td>
                  <td data-label="Time of Day">{issuance.remarks}</td>
                  <td data-label="Actions" className="actions-column">
                    <button className="btn-view" onClick={() => handleView(issuance.id)}>View</button>
                    <button className="btn-edit" onClick={() => handleEdit(issuance.id)}>Edit</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>
                  No issuance records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedIssuanceId && (
        <ModalPortal onClose={() => setSelectedIssuanceId(null)}>
          <IssuanceDetailsModal id={selectedIssuanceId} onClose={() => setSelectedIssuanceId(null)} />
        </ModalPortal>
      )}
    </div>
  );
};

export default IssuanceHistory;