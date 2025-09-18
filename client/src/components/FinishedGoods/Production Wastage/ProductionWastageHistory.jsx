
import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faTrash, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './ProductionWastage.css';

const ProductionWastageHistory = () => {
  const [wastages, setWastages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWastage, setSelectedWastage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const { showPopup } = usePopup();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProductionWastages();
  }, []);

  const fetchProductionWastages = async () => {
    try {
      const response = await api.get('/finished-goods-wastages/production');
      setWastages(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch production wastages');
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
    if (window.confirm('Are you sure you want to delete this production wastage record?')) {
      try {
        await api.delete(`/finished-goods-wastages/${id}`);
        showPopup('success', 'Production wastage record deleted successfully');
        fetchProductionWastages();
      } catch (error) {
        showPopup('error', 'Failed to delete production wastage record');
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedWastage(null);
  };


  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh', fontSize: 18, color: '#888' }}>
      Loading...
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h2 style={{ fontWeight: 600, fontSize: 28, margin: 0, color: '#222' }}>Production Wastage</h2>
        <button
          style={{
            background: '#222', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 20px', fontWeight: 500,
            fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'background 0.2s',
          }}
          onClick={() => navigate('/finished-goods/wastage/production/add')}
        >
          <FontAwesomeIcon icon={faPlus} /> Add
        </button>
      </div>

      {wastages.length === 0 ? (
        <div style={{ color: '#888', fontSize: 18, textAlign: 'center', marginTop: 60 }}>No production wastage records found.</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ background: '#f6f6f6', color: '#444', borderBottom: '1px solid #eee' }}>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'left' }}>#</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'left' }}>Date</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'left' }}>Prod. Date</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'left' }}>Prepared By</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'left' }}>Approved By</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'left' }}>Reason</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'center' }}>Items</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'right' }}>Loss (LKR)</th>
                <th style={{ fontWeight: 600, padding: '14px 8px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {wastages.map(wastage => (
                <tr key={wastage.id} style={{ borderBottom: '1px solid #f0f0f0', transition: 'background 0.2s' }}>
                  <td style={{ padding: '12px 8px', color: '#555' }}>{wastage.wastage_number}</td>
                  <td style={{ padding: '12px 8px', color: '#555' }}>{new Date(wastage.date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px 8px', color: '#555' }}>{wastage.production_date ? new Date(wastage.production_date).toLocaleDateString() : <span style={{ color: '#bbb' }}>N/A</span>}</td>
                  <td style={{ padding: '12px 8px', color: '#555' }}>{wastage.production_prepared_by || <span style={{ color: '#bbb' }}>N/A</span>}</td>
                  <td style={{ padding: '12px 8px', color: '#555' }}>{wastage.approved_by}</td>
                  <td style={{ padding: '12px 8px', color: '#555', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wastage.reason}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: '#555' }}>{wastage.item_count}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', color: '#e74c3c', fontWeight: 600 }}>{parseFloat(wastage.total_loss || 0).toFixed(2)}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                    <button
                      style={{ background: 'none', border: 'none', color: '#3498db', fontSize: 18, marginRight: 8, cursor: 'pointer', padding: 4, borderRadius: 4, transition: 'background 0.15s' }}
                      onClick={() => handleViewWastage(wastage.id)}
                      title="View Details"
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    <button
                      style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: 18, cursor: 'pointer', padding: 4, borderRadius: 4, transition: 'background 0.15s' }}
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
        </div>
      )}

      {showModal && selectedWastage && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: 0 }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #eee', padding: '24px 28px', background: '#fafbfc', borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
              <h3 style={{ margin: 0, fontWeight: 600, fontSize: 22, color: '#222' }}>Wastage #{selectedWastage.wastage_number}</h3>
              <button className="modal-close" onClick={closeModal} style={{ fontSize: 28, color: '#bbb', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '28px 28px 18px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                <div style={{ color: '#666', fontSize: 15 }}><span style={{ fontWeight: 500, color: '#222' }}>Date:</span> {new Date(selectedWastage.date).toLocaleDateString()}</div>
                <div style={{ color: '#666', fontSize: 15 }}><span style={{ fontWeight: 500, color: '#222' }}>Approved By:</span> {selectedWastage.approved_by}</div>
                <div style={{ color: '#666', fontSize: 15 }}><span style={{ fontWeight: 500, color: '#222' }}>Reason:</span> {selectedWastage.reason}</div>
                {selectedWastage.production_date && (
                  <div style={{ color: '#666', fontSize: 15 }}><span style={{ fontWeight: 500, color: '#222' }}>Production Date:</span> {new Date(selectedWastage.production_date).toLocaleDateString()}</div>
                )}
                {selectedWastage.production_prepared_by && (
                  <div style={{ color: '#666', fontSize: 15 }}><span style={{ fontWeight: 500, color: '#222' }}>Prepared By:</span> {selectedWastage.production_prepared_by}</div>
                )}
                <div style={{ color: '#666', fontSize: 15 }}><span style={{ fontWeight: 500, color: '#222' }}>Remarks:</span> {selectedWastage.remarks || <span style={{ color: '#bbb' }}>N/A</span>}</div>
              </div>

              <div style={{ margin: '18px 0 0 0' }}>
                <h4 style={{ fontWeight: 600, fontSize: 17, margin: '0 0 10px 0', color: '#222' }}>Wasted Items</h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, background: '#fafbfc', borderRadius: 8 }}>
                    <thead>
                      <tr style={{ background: '#f6f6f6', color: '#444', borderBottom: '1px solid #eee' }}>
                        <th style={{ fontWeight: 600, padding: '10px 6px', textAlign: 'left' }}>Item Code</th>
                        <th style={{ fontWeight: 600, padding: '10px 6px', textAlign: 'left' }}>Name</th>
                        <th style={{ fontWeight: 600, padding: '10px 6px', textAlign: 'left' }}>Category</th>
                        <th style={{ fontWeight: 600, padding: '10px 6px', textAlign: 'center' }}>Qty</th>
                        <th style={{ fontWeight: 600, padding: '10px 6px', textAlign: 'right' }}>Unit Price</th>
                        <th style={{ fontWeight: 600, padding: '10px 6px', textAlign: 'right' }}>Loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWastage.items && selectedWastage.items.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '8px 6px', color: '#555' }}>{item.item_code}</td>
                          <td style={{ padding: '8px 6px', color: '#555' }}>{item.item_name}</td>
                          <td style={{ padding: '8px 6px', color: '#555' }}>{item.category}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', color: '#555' }}>{item.quantity}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#555' }}>LKR {parseFloat(item.unit_price).toFixed(2)}</td>
                          <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e74c3c', fontWeight: 600 }}>LKR {parseFloat(item.estimated_loss).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 18 }}>
                  <span style={{ fontWeight: 500, fontSize: 16, color: '#222', marginRight: 12 }}>Total Estimated Loss:</span>
                  <span style={{ color: '#e74c3c', fontWeight: 700, fontSize: 18 }}>
                    LKR {selectedWastage.items ? selectedWastage.items.reduce((total, item) => total + parseFloat(item.estimated_loss), 0).toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionWastageHistory;