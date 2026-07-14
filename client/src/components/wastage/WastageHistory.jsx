import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Wastage.css';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEye, 
  faClock,
  faExclamationTriangle,
  faMoneyBillWave,
  faTimes,
  faFileAlt
} from '@fortawesome/free-solid-svg-icons';
import { formatCurrency } from '../../utils/formatters';

const WastageHistory = () => {
  const [wastages, setWastages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWastage, setSelectedWastage] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchWastages();
  }, []);

  const fetchWastages = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await api.get('/wastages', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setWastages(response.data);
    } catch (error) {
      console.error('Error fetching wastages:', error);
      
      if (error.response) {
        if (error.response.status === 500) {
          setError('Server error. Please check if the database table has the "deleted" column.');
          showPopup('error', 'Database error: Missing "deleted" column in wastages table');
        } else {
          setError(error.response.data?.error || 'Failed to fetch wastages');
        }
      } else if (error.request) {
        setError('No response from server. Please check your connection.');
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate total loss for a wastage
  const calculateTotalLoss = (wastageId) => {
    // This would be calculated from the items, but we need to fetch items or store total in DB
    // For now, we'll use a placeholder - ideally you'd fetch this from the API
    return 0;
  };

  // View Wastage Details
  const handleView = async (id) => {
    setModalOpen(true);
    setModalLoading(true);
    setModalError('');
    setSelectedWastage(null);

    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/wastages/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      setSelectedWastage(response.data);
    } catch (err) {
      console.error('Error fetching wastage details:', err);
      setModalError(err.message || 'Something went wrong');
      showPopup('error', 'Failed to load wastage details');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedWastage(null);
    setModalError('');
  };

  // Get status icon and color for the note
  const getStatusInfo = (reason) => {
    const statusMap = {
      'Expired': { icon: faClock, color: '#dc3545', bg: '#f8d7da' },
      'Damaged': { icon: faExclamationTriangle, color: '#fd7e14', bg: '#fff3cd' },
      'Overproduction': { icon: faMoneyBillWave, color: '#28a745', bg: '#d4edda' },
      'Poor Storage': { icon: faExclamationTriangle, color: '#856404', bg: '#fff3cd' },
      'Forecasting errors': { icon: faClock, color: '#6c757d', bg: '#e9ecef' },
      'Human error': { icon: faExclamationTriangle, color: '#6c757d', bg: '#e9ecef' },
      'Other': { icon: faTimes, color: '#6c757d', bg: '#e9ecef' }
    };
    return statusMap[reason] || statusMap['Other'];
  };

  if (loading) return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p>Loading wastage records...</p>
    </div>
  );
  
  if (error) {
    return (
      <div className="wastage-container">
        <div className="error-container">
          <h3>⚠️ Error Loading Wastages</h3>
          <p>{error}</p>
          <button onClick={fetchWastages} className="btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wastage-container">
      <div className="header-section">
          <h2>RM Wastage Summary</h2>
      </div>
      
      {wastages.length === 0 ? (
        <div className="no-records">
          <div className="no-records-icon">📋</div>
          <p>No wastage records found</p>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="wastage-table">
            <thead>
              <tr>
                <th className="center-align">Date</th>
                <th className="center-align">Approved By</th>
                <th className="center-align">Reason</th>
                <th className="center-align">Remarks</th>
                <th className="center-align">Total Loss</th>
                <th className="center-align actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wastages.map(wastage => {
                const statusInfo = getStatusInfo(wastage.reason);
                // Calculate total loss from items - this would need to be fetched
                // For now, we'll use a placeholder or calculate from the data
                const totalLoss = wastage.items 
                  ? wastage.items.reduce((sum, item) => sum + (Number(item.estimated_loss) || 0), 0)
                  : 0;
                return (
                  <tr key={wastage.id} className="wastage-row">
                    <td className="center-align">{new Date(wastage.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}</td>
                    <td className="center-align">{wastage.approved_by}</td>
                    <td className="center-align">
                      <span className="reason-badge" style={{ 
                        backgroundColor: statusInfo.bg,
                        color: statusInfo.color,
                        borderColor: statusInfo.color
                      }}>
                        <FontAwesomeIcon icon={statusInfo.icon} className="reason-icon" />
                        {wastage.reason}
                      </span>
                    </td>
                    <td className="center-align remarks-cell">
                      {wastage.remarks || <span className="no-remarks">—</span>}
                    </td>
                    <td className="center-align loss-amount">
                      {formatCurrency(totalLoss)}
                    </td>
                    <td className="center-align actions-cell">
                      <button
                        className="action-btn view-btn"
                        onClick={() => handleView(wastage.id)}
                        title="View Details"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      {/* Removed Edit and Delete buttons */}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for wastage details - Enhanced with larger size */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={faFileAlt} /> Wastage Details
              </h2>
              <button className="modal-close" onClick={closeModal}>
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="modal-body">
              {modalLoading && (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Loading details...</p>
                </div>
              )}
              {modalError && <div className="error-message">{modalError}</div>}
              {selectedWastage && (
                <div className="wastage-details-modal">
                  <div className="detail-header">
                    <h3>{selectedWastage.wastage_note_number}</h3>
                    <span className="detail-status">
                      <FontAwesomeIcon icon={getStatusInfo(selectedWastage.reason).icon} />
                      {selectedWastage.reason}
                    </span>
                  </div>
                  
                  <div className="details-grid">
                    <div className="detail-item">
                      <label>Date</label>
                      <span>{new Date(selectedWastage.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}</span>
                    </div>
                    <div className="detail-item">
                      <label>Approved By</label>
                      <span>{selectedWastage.approved_by}</span>
                    </div>
                    <div className="detail-item">
                      <label>Entered By</label>
                      <span>{selectedWastage.entered_by}</span>
                    </div>
                  </div>

                  {selectedWastage.remarks && (
                    <div className="remarks-section">
                      <label>Remarks</label>
                      <p>{selectedWastage.remarks}</p>
                    </div>
                  )}

                  <div className="items-table-wrapper">
                    <h4>Wasted Items</h4>
                    <div className="items-table-scroll">
                      <table className="items-details-table">
                        <thead>
                          <tr>
                            <th className="center-align">Item Code</th>
                            <th className="center-align">Item Name</th>
                            <th className="center-align">Quantity</th>
                            <th className="center-align">Unit</th>
                            <th className="center-align">Estimated Loss (Rs.)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedWastage.items && selectedWastage.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="center-align"><span className="item-code">{item.item_code}</span></td>
                              <td className="center-align">{item.item_name}</td>
                              <td className="center-align">{Number(item.quantity).toFixed(3)}</td>
                              <td className="center-align">{item.unit}</td>
                              <td className="center-align loss-amount">
                                {formatCurrency(item.estimated_loss)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="4" className="center-align">
                              <strong>Total Estimated Loss:</strong>
                            </td>
                            <td className="center-align total-loss-amount">
                              <strong>
                                {selectedWastage.items ? 
                                  formatCurrency(
                                  selectedWastage.items.reduce((total, item) => 
                                    total + (parseFloat(item.estimated_loss) || 0), 0
                                  )
                                ) : formatCurrency(0)}
                              </strong>
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WastageHistory;