import React, { useState, useEffect } from 'react';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';

// Modal version of IssuanceDetails for popup use
const IssuanceDetailsModal = ({ id }) => {
  const [issuance, setIssuance] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchIssuance = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/issuances/${id}`);
        const data = await response.json();
        setIssuance(data);
      } catch (err) {
        showPopup('error', 'Failed to fetch issuance details');
      } finally {
        setLoading(false);
      }
    };
    fetchIssuance();
  }, [id, showPopup]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!issuance) return <div>No issuance data found</div>;

  return (
    <div className="issuance-details">
      <div className="header-with-actions">
        <h2>Issuance ID: {issuance.id}</h2>
      </div>
      <div className="details-row">
        <div>
          <label>Date:</label>
          <div>{new Date(issuance.issuance_date).toLocaleDateString()}</div>
        </div>
        <div>
          <label>Department:</label>
          <div>{issuance.department_name}</div>
        </div>
        <div>
          <label>Issued By:</label>
          <div>{issuance.issued_by_email}</div>
        </div>
        <div>
          <label>Received By:</label>
          <div>{issuance.received_by}</div>
        </div>
        {issuance.approved_by && (
          <div>
            <label>Approved By</label>
            <div>{issuance.approved_by}</div>
          </div>
        )}
      </div>
      <div className="remarks-section">
        <strong>Remarks:</strong> <span>{issuance.remarks || 'N/A'}</span>
      </div>
      <div className="items-table">
        <h3>Issued Items</h3>
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Quantity</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {issuance.items.map((item, index) => (
              <tr key={index}>
                <td>{item.item_code}</td>
                <td>{item.item_name}</td>
                <td>{item.quantity}</td>
                <td>{item.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const IssuanceHistory = () => {
  const [issuances, setIssuances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssuanceId, setSelectedIssuanceId] = useState(null);

  useEffect(() => {
    const fetchIssuances = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/issuances');
        const data = await response.json();
        setIssuances(data);
      } catch (error) {
        console.error('Error fetching issuances:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchIssuances();
  }, []);


  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="issuance-container">
      <div className="header-with-actions">
        <h2 style={{ margin: 0 }}>Issuance History</h2>
      </div>
      <div className="table-responsive">
        <table className="issuance-table styled-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Issued By</th>
              <th>Department</th>
              <th>Received By</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(issuances) && issuances.length > 0 ? (
              issuances.map(issuance => (
                <tr
                  key={issuance.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedIssuanceId(issuance.id)}
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedIssuanceId(issuance.id); }}
                  aria-label={`View details for issuance ${issuance.id}`}
                >
                  <td>{issuance.id}</td>
                  <td>{new Date(issuance.issuance_date).toLocaleDateString()}</td>
                  <td>{issuance.issued_by_email}</td>
                  <td>{issuance.department_name}</td>
                  <td>{issuance.received_by}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No issuance records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedIssuanceId && (
        <div className="modal-overlay" onClick={() => setSelectedIssuanceId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="btn-back" style={{ float: 'right' }} onClick={() => setSelectedIssuanceId(null)}>&#10005;</button>
            <IssuanceDetailsModal id={selectedIssuanceId} />
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuanceHistory;