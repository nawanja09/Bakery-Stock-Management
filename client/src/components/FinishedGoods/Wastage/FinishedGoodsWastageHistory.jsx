import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEye, faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './FinishedGoodsWastage.css';

const FinishedGoodsWastageHistory = () => {
  const [wastages, setWastages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWastage, setSelectedWastage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchWastages();
  }, []);

  const fetchWastages = async () => {
    try {
      const response = await api.get('/finished-goods-wastages');
      setWastages(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch finished goods wastages');
    } finally {
      setLoading(false);
    }
  };

  const handleViewWastage = async (id) => {
    try {
      const response = await api.get(`/finished-goods-wastages/${id}`);
      setSelectedWastage(response.data);
      setShowModal(true);
    } catch (error) {
      showPopup('error', 'Failed to fetch wastage details');
    }
  };

  const handleDeleteWastage = async (id) => {
    if (window.confirm('Are you sure you want to delete this wastage record?')) {
      try {
        await api.delete(`/finished-goods-wastages/${id}`);
        showPopup('success', 'Wastage record deleted successfully');
        fetchWastages();
      } catch (error) {
        showPopup('error', 'Failed to delete wastage record');
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedWastage(null);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="fg-wastage-container">
      <div className="fg-wastage-header">
        <h2>Finished Goods Wastage History</h2>
      </div>

      {wastages.length === 0 ? (
        <p>No finished goods wastage records found</p>
      ) : (
        <table className="fg-wastage-table">
          <thead>
            <tr>
              <th>Wastage #</th>
              <th>Date</th>
              <th>Approved By</th>
              <th>Reason</th>
              <th>Items Count</th>
              <th>Total Loss (LKR)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {wastages.map(wastage => (
              <tr key={wastage.id}>
                <td>{wastage.wastage_number}</td>
                <td>{new Date(wastage.date).toLocaleDateString()}</td>
                <td>{wastage.approved_by}</td>
                <td>{wastage.reason}</td>
                <td>{wastage.item_count}</td>
                <td style={{ color: 'red', fontWeight: 'bold' }}>
                  {parseFloat(wastage.total_loss || 0).toFixed(2)}
                </td>
                <td className="actions">
                  <button 
                    className="btn-view" 
                    onClick={() => handleViewWastage(wastage.id)}
                    title="View Details"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  <button 
                    className="btn-delete" 
                    onClick={() => handleDeleteWastage(wastage.id)}
                    title="Delete"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && selectedWastage && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Wastage Details: {selectedWastage.wastage_number}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="wastage-details">
                <div className="detail-row">
                  <span className="label">Date:</span>
                  <span>{new Date(selectedWastage.date).toLocaleDateString()}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Approved By:</span>
                  <span>{selectedWastage.approved_by}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Reason:</span>
                  <span>{selectedWastage.reason}</span>
                </div>
                <div className="detail-row">
                  <span className="label">Remarks:</span>
                  <span>{selectedWastage.remarks || 'N/A'}</span>
                </div>
              </div>

              <h4>Wasted Items</h4>
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Estimated Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWastage.items && selectedWastage.items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.item_code}</td>
                      <td>{item.item_name}</td>
                      <td>{item.category}</td>
                      <td>{item.quantity}</td>
                      <td>LKR {parseFloat(item.unit_price).toFixed(2)}</td>
                      <td style={{ color: 'red', fontWeight: 'bold' }}>
                        LKR {parseFloat(item.estimated_loss).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="total-section">
                <strong>Total Estimated Loss:</strong>
                <span style={{ color: 'red', fontWeight: 'bold' }}>
                  LKR {selectedWastage.items ? selectedWastage.items.reduce((total, item) => total + parseFloat(item.estimated_loss), 0).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinishedGoodsWastageHistory;