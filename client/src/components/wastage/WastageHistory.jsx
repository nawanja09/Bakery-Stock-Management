import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Wastage.css';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faEye, 
  faEdit, 
  faTrash, 
  faPlus,
  faTimes,
  faCheckCircle,
  faMoneyBillWave,
  faClock,
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';

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

  // Edit Wastage - Navigate to edit page
  const handleEdit = (id) => {
    navigate(`/wastage/edit/${id}`);
  };

  // Delete Wastage
  const handleDelete = async (id, noteNumber) => {
    if (!window.confirm(`Are you sure you want to delete wastage note #${noteNumber}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/wastages/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      showPopup('success', `Wastage #${noteNumber} deleted successfully`);
      fetchWastages();
    } catch (error) {
      console.error('Error deleting wastage:', error);
      showPopup('error', 'Failed to delete wastage');
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
          <button onClick={() => navigate('/wastage/add')} className="btn-add">
            <FontAwesomeIcon icon={faPlus} /> Record New Wastage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wastage-container">
      <div className="header-section">
        <div className="header-left">
          <h2>Wastage History</h2>
          <span className="record-count">{wastages.length} records</span>
        </div>
        <button onClick={() => navigate('/wastage/add')} className="btn-add">
          <FontAwesomeIcon icon={faPlus} /> Record New Wastage
        </button>
      </div>
      
      {wastages.length === 0 ? (
        <div className="no-records">
          <div className="no-records-icon">📋</div>
          <p>No wastage records found</p>
          <button onClick={() => navigate('/wastage/add')} className="btn-add">
            <FontAwesomeIcon icon={faPlus} /> Record New Wastage
          </button>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="wastage-table">
            <thead>
              <tr>
                <th>Note #</th>
                <th>Date</th>
                <th>Approved By</th>
                <th>Reason</th>
                <th>Remarks</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wastages.map(wastage => {
                const statusInfo = getStatusInfo(wastage.reason);
                return (
                  <tr key={wastage.id} className="wastage-row">
                    <td>
                      <span className="note-number">{wastage.wastage_note_number}</span>
                    </td>
                    <td>{new Date(wastage.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}</td>
                    <td>{wastage.approved_by}</td>
                    <td>
                      <span className="reason-badge" style={{ 
                        backgroundColor: statusInfo.bg,
                        color: statusInfo.color,
                        borderColor: statusInfo.color
                      }}>
                        <FontAwesomeIcon icon={statusInfo.icon} className="reason-icon" />
                        {wastage.reason}
                      </span>
                    </td>
                    <td className="remarks-cell">
                      {wastage.remarks || <span className="no-remarks">—</span>}
                    </td>
                    <td className="actions-cell">
                      <button
                        className="action-btn view-btn"
                        onClick={() => handleView(wastage.id)}
                        title="View Details"
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      <button
                        className="action-btn edit-btn"
                        onClick={() => handleEdit(wastage.id)}
                        title="Edit Wastage"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => handleDelete(wastage.id, wastage.wastage_note_number)}
                        title="Delete Wastage"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for wastage details */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <FontAwesomeIcon icon={faEye} /> Wastage Details
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
                    <table className="items-details-table">
                      <thead>
                        <tr>
                          <th>Item Code</th>
                          <th>Item Name</th>
                          <th className="text-right">Quantity</th>
                          <th>Unit</th>
                          <th className="text-right">Estimated Loss (Rs.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedWastage.items && selectedWastage.items.map((item, idx) => (
                          <tr key={idx}>
                            <td><span className="item-code">{item.item_code}</span></td>
                            <td>{item.item_name}</td>
                            <td className="text-right">{item.quantity}</td>
                            <td>{item.unit}</td>
                            <td className="text-right loss-amount">
                              Rs. {isNaN(Number(item.estimated_loss)) ? '0.00' : Number(item.estimated_loss).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="4" className="text-right">
                            <strong>Total Estimated Loss:</strong>
                          </td>
                          <td className="text-right total-loss-amount">
                            <strong>
                              Rs. {selectedWastage.items ? 
                                selectedWastage.items.reduce((total, item) => 
                                  total + (parseFloat(item.estimated_loss) || 0), 0
                                ).toFixed(2) : '0.00'}
                            </strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
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