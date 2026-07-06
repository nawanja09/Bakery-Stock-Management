import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faEdit, 
  faCalendarAlt, 
  faUser, 
  faMapMarkerAlt, 
  faArrowRight, 
  faStickyNote, 
  faInfoCircle,
  faClock,
  faBoxes
} from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './ViewTransfer.css';

const ViewTransfer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchTransferDetails = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/cutlery-transfers/${id}`);
        if (res.data.success) {
          setTransfer(res.data.data);
        } else {
          showPopup('error', res.data.error || 'Failed to load transfer details');
          navigate('/cutlery/transfer');
        }
      } catch (err) {
        console.error('Error fetching transfer details:', err);
        showPopup('error', err.response?.data?.error || 'Failed to load transfer details');
        navigate('/cutlery/transfer');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchTransferDetails();
    }
  }, [id, navigate, showPopup]);

  const handleBack = () => {
    navigate('/cutlery/transfer');
  };

  const handleEdit = () => {
    navigate('/cutlery/transfer', { state: { editTransferId: transfer.id } });
  };

  const getStatusClass = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'completed') return 'status-completed';
    if (statusLower === 'pending') return 'status-pending';
    if (statusLower === 'cancelled') return 'status-failed';
    return 'status-pending';
  };

  if (loading) {
    return (
      <div className="view-transfer-loading">
        <div className="spinner"></div>
        <p>Loading transfer details...</p>
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="view-transfer-error">
        <h3>Transfer Not Found</h3>
        <p>The cutlery transfer record you are looking for does not exist.</p>
        <button className="btn btn-secondary" onClick={handleBack}>
          <FontAwesomeIcon icon={faArrowLeft} /> Back to Transfers
        </button>
      </div>
    );
  }

  return (
    <div className="view-transfer-page">
      <header className="page-header-details">
        <div className="header-left">
          <button className="btn btn-back-details" onClick={handleBack} title="Back to Transfers">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <div className="header-title-text">
            <h2>Transfer Details</h2>
            <p className="subtitle">ID: {transfer.transfer_id}</p>
          </div>
        </div>
        <div className="header-actions-details">
          <button className="btn-edit-details" onClick={handleEdit}>
            <FontAwesomeIcon icon={faEdit} /> Edit Transfer
          </button>
        </div>
      </header>

      <div className="view-transfer-grid">
        {/* Basic Information Card */}
        <div className="detail-card-item">
          <div className="card-header-icon">
            <FontAwesomeIcon icon={faInfoCircle} className="icon-header" />
            <h3>Basic Information</h3>
          </div>
          <div className="card-body-content">
            <div className="info-row-item">
              <span className="info-label">Transfer ID:</span>
              <span className="info-value highlight">{transfer.transfer_id}</span>
            </div>
            <div className="info-row-item">
              <span className="info-label">
                <FontAwesomeIcon icon={faCalendarAlt} className="icon-small" /> Date:
              </span>
              <span className="info-value">
                {new Date(transfer.transfer_date).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
            <div className="info-row-item">
              <span className="info-label">
                <FontAwesomeIcon icon={faUser} className="icon-small" /> Transferred By:
              </span>
              <span className="info-value">{transfer.transferred_by}</span>
            </div>
            <div className="info-row-item">
              <span className="info-label">Status:</span>
              <span className={`status-badge ${getStatusClass(transfer.status)}`}>
                {transfer.status || 'Pending'}
              </span>
            </div>
          </div>
        </div>

        {/* Location Flow Card */}
        <div className="detail-card-item">
          <div className="card-header-icon">
            <FontAwesomeIcon icon={faMapMarkerAlt} className="icon-header" />
            <h3>Location Movement</h3>
          </div>
          <div className="card-body-content">
            <div className="location-visual-flow">
              <div className="location-node from">
                <span className="node-label">Source</span>
                <span className="node-name">{transfer.from_location_name || `Location ${transfer.location_from_id}`}</span>
              </div>
              <div className="flow-arrow-indicator">
                <FontAwesomeIcon icon={faArrowRight} />
              </div>
              <div className="location-node to">
                <span className="node-label">Destination</span>
                <span className="node-name">{transfer.to_location_name || `Location ${transfer.location_to_id}`}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes Card - Conditionally Rendered */}
        {transfer.notes && (
          <div className="detail-card-item full-width-grid">
            <div className="card-header-icon">
              <FontAwesomeIcon icon={faStickyNote} className="icon-header" />
              <h3>Notes / Remarks</h3>
            </div>
            <div className="card-body-content notes-container-content">
              <p>{transfer.notes}</p>
            </div>
          </div>
        )}

        {/* System Information Card */}
        <div className="detail-card-item full-width-grid">
          <div className="card-header-icon">
            <FontAwesomeIcon icon={faClock} className="icon-header" />
            <h3>System Information</h3>
          </div>
          <div className="card-body-content system-info-grid">
            <div className="info-row-item">
              <span className="info-label">Created By:</span>
              <span className="info-value">{transfer.created_by_name || 'N/A'}</span>
            </div>
            <div className="info-row-item">
              <span className="info-label">Created At:</span>
              <span className="info-value">{new Date(transfer.created_at).toLocaleString()}</span>
            </div>
            <div className="info-row-item">
              <span className="info-label">Last Updated:</span>
              <span className="info-value">{new Date(transfer.updated_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Asset Details Table Section */}
      <section className="assets-table-section">
        <div className="assets-table-header">
          <div className="title-left">
            <FontAwesomeIcon icon={faBoxes} className="icon-header" />
            <h3>Asset Details</h3>
          </div>
          <span className="assets-count-badge">
            {transfer.items?.length || 0} Unique Asset(s)
          </span>
        </div>

        <div className="table-responsive">
          <table className="asset-details-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Asset Code</th>
                <th>Asset Name</th>
                <th className="text-right">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items && transfer.items.length > 0 ? (
                transfer.items.map((item, index) => (
                  <tr key={item.id || index}>
                    <td data-label="#">{index + 1}</td>
                    <td data-label="Asset Code" className="asset-code-highlight">
                      <strong>{item.asset_code}</strong>
                    </td>
                    <td data-label="Asset Name">{item.asset_name}</td>
                    <td data-label="Quantity" className="text-right quantity-cell">
                      {item.quantity}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-assets-cell">
                    No assets associated with this transfer.
                  </td>
                </tr>
              )}
            </tbody>
            {transfer.items && transfer.items.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan="3" className="text-right text-bold">Total Quantity:</td>
                  <td className="text-right text-bold quantity-total-cell">
                    {transfer.items.reduce((acc, curr) => acc + (curr.quantity || 0), 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
};

export default ViewTransfer;