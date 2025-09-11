import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit } from '@fortawesome/free-solid-svg-icons';
import { usePopup } from '../context/PopupContext';
import './Issuance.css';
import api from '../../api';

// Modal version of IssuanceDetails for popup use
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

  if (loading) return <div className="loading">Loading...</div>;
  if (!issuance) return <div>No issuance data found</div>;

  return (
    <div className="issuance-details">
      <div className="header-with-actions">
        <h2>Issuance ID: {issuance.id}</h2>
        <button className="btn-close" onClick={onClose}>&#10005;</button>
      </div>
      <div className="details-row vertical">
        <ul className="details-list">
          <li>
            <strong>Date:</strong> {new Date(issuance.issuance_date).toLocaleDateString()}
          </li>
          <li>
            <strong>Check Number:</strong> {issuance.check_number}
          </li>
          <li>
            <strong>Received By:</strong> {issuance.received_by}
          </li>
          <li>
            <strong>Department:</strong> {issuance.department_name}
          </li>
          {issuance.approved_by && (
            <li>
              <strong>Approved By:</strong> {issuance.approved_by}
            </li>
          )}
          <li>
            <strong>Time of Day:</strong> <span>{issuance.remarks || 'N/A'}</span>
          </li>
        </ul>
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
                <td>{Number(item.quantity).toFixed(3)}</td>
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

  // Handle View button: open modal for selected issuance
  const handleView = (id) => {
    setSelectedIssuanceId(id);
  };

  // Handle Edit button: redirect to edit page
  const handleEdit = (id) => {
    window.location.href = `/issuance/edit/${id}`;
  };

  useEffect(() => {
    const fetchIssuances = async () => {
      try {
        const response = await api.get('/issuances');
        
        // Sort the issuances by ID in descending order (latest first)
        const sorted = response.data.sort((a, b) => b.id - a.id);
        
        setIssuances(sorted);
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
        <Link to="/issuance/issue" className="btn-primary">
          + New Issuance
        </Link>
      </div>
      <div className="table-responsive">
        <table className="issuance-table styled-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Time of Day</th>
              <th>Check Number</th>
              <th>Department</th>
              <th>Received By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(issuances) && issuances.length > 0 ? (
              issuances.map(issuance => (
                <tr key={issuance.id}>
                  <td>{issuance.id}</td>
                  <td>{new Date(issuance.issuance_date).toLocaleDateString()}</td>
                  <td>{issuance.remarks}</td>
                  <td>{issuance.check_number || 'N/A'}</td>
                  <td>{issuance.department_name}</td>
                  <td>{issuance.received_by}</td>
                    <td className="actions-column">
                      <button
                        className="btn-view"
                        onClick={() => handleView(issuance.id)}
                      >
                        View
                      </button>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(issuance.id)}
                      >
                        Edit
                      </button>
                    </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', color: '#888' }}>No issuance records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedIssuanceId && (
        <div className="modal-overlay" onClick={() => setSelectedIssuanceId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <IssuanceDetailsModal id={selectedIssuanceId} onClose={() => setSelectedIssuanceId(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuanceHistory;