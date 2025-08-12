import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Wastage.css';
import api from '../../api';

const WastageHistory = () => {
  const [wastages, setWastages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWastage, setSelectedWastage] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchWastages = async () => {
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

        const data = response.data;
        setWastages(data);
      } catch (error) {
        console.error('Error fetching wastages:', error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchWastages();
  }, [navigate]);

  const handleRowClick = async (id) => {
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

      const data = response.data;
      setSelectedWastage(data);

    } catch (err) {
      console.error('Error fetching wastage details:', err);
      setModalError(err.message || 'Something went wrong');
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedWastage(null);
    setModalError('');
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="wastage-container">
      <div className="header-buttons">
        <button onClick={() => navigate('/wastage/add')} className="btn-add">
          + Record New Wastage
        </button>
      </div>

      <h2>Wastage History</h2>
      <table className="wastage-table">
        <thead>
          <tr>
            <th>Note #</th>
            <th>Date</th>
            <th>Approved By</th>
            <th>Reason</th>
            <th>Entered By</th>
          </tr>
        </thead>
        <tbody>
          {wastages.map(wastage => (
            <tr key={wastage.id} style={{ cursor: 'pointer' }} onClick={() => handleRowClick(wastage.id)}>
              <td>{wastage.wastage_note_number}</td>
              <td>{new Date(wastage.date).toLocaleDateString()}</td>
              <td>{wastage.approved_by}</td>
              <td>{wastage.reason}</td>
              <td>{wastage.entered_by}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal for wastage details */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>&times;</button>
            {modalLoading && <div>Loading...</div>}
            {modalError && <div className="error">{modalError}</div>}
            {selectedWastage && (
              <div className="wastage-details-modal">
                <h2>Wastage Note: {selectedWastage.wastage_note_number}</h2>
                <div className="details-row vertical">
                  <ul className="details-list">
                    <li><strong>Date:</strong> {new Date(selectedWastage.date).toLocaleDateString()}</li>
                    <li><strong>Approved By:</strong> {selectedWastage.approved_by}</li>
                    <li><strong>Reason:</strong> {selectedWastage.reason}</li>
                    <li><strong>Entered By:</strong> {selectedWastage.entered_by}</li>
                  </ul>
                </div>
                <div className="remarks-section">
                  <strong>Remarks:</strong> <span>{selectedWastage.remarks || 'N/A'}</span>
                </div>
                <div className="items-table">
                  <h3>Wasted Items</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Item Code</th>
                        <th>Item Name</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                        <th>Estimated Loss (Rs.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWastage.items && selectedWastage.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.item_code}</td>
                          <td>{item.item_name}</td>
                          <td>{item.quantity}</td>
                          <td>{item.unit}</td>
                          <td>{isNaN(Number(item.estimated_loss)?.toFixed(2)) ? '0.00' : Number(item.estimated_loss)?.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="total-loss-section">
                  <strong>Total Estimated Loss:</strong>
                  <span> Rs. {selectedWastage.items ? selectedWastage.items.reduce((total, item) => total + (parseFloat(item.estimated_loss) || 0), 0).toFixed(2) : '0.00'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WastageHistory;