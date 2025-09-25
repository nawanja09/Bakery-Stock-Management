import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faEye } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import AddTransferPopup from './AddTransferPopup';
import ViewTransferPopup from './ViewTransferPopup';
import EditTransferPopup from './EditTransferPopup';
import './Transfers.css';

const TransfersManagement = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showViewPopup, setShowViewPopup] = useState(false);
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchDepartments();
    fetchTransfers();
  }, [selectedDepartment]);

  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      setDepartments(response.data);
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const fetchTransfers = async () => {
    try {
      const url = selectedDepartment 
        ? `/finished-goods-transfers?department_id=${selectedDepartment}`
        : '/finished-goods-transfers';
      
      const response = await api.get(url);
      setTransfers(response.data);
    } catch (err) {
      showPopup('error', 'Failed to fetch transfers');
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentChange = (e) => {
    setSelectedDepartment(e.target.value);
  };

  const handleViewTransfer = async (id) => {
    try {
      const response = await api.get(`/finished-goods-transfers/${id}`);
      setSelectedTransfer(response.data);
      setShowViewPopup(true);
    } catch (err) {
      showPopup('error', 'Failed to fetch transfer details');
    }
  };

  const handleEditTransfer = async (id) => {
    try {
      const response = await api.get(`/finished-goods-transfers/${id}`);
      setSelectedTransfer(response.data);
      setShowEditPopup(true);
    } catch (err) {
      showPopup('error', 'Failed to fetch transfer details');
    }
  };

  const handleAddTransfer = () => {
    setShowAddPopup(true);
  };

  const handleClosePopup = () => {
    setShowAddPopup(false);
    setShowViewPopup(false);
    setShowEditPopup(false);
    setSelectedTransfer(null);
  };

  const handleTransferSaved = () => {
    fetchTransfers();
    handleClosePopup();
    showPopup('success', 'Transfer saved successfully!');
  };

  const handleDeleteTransfer = async (id) => {
    if (window.confirm('Are you sure you want to delete this transfer?')) {
      try {
        await api.delete(`/finished-goods-transfers/${id}`);
        showPopup('success', 'Transfer deleted successfully!');
        fetchTransfers();
      } catch (err) {
        showPopup('error', 'Failed to delete transfer');
      }
    }
  };

  return (
    <div className="transfers-management-container">
      <div className="transfers-header">
        <h2>Finished Goods Transfers</h2>
      </div>
        <div className="header-buttons">    
            <button onClick={handleAddTransfer} className="btn-add">
              <FontAwesomeIcon icon={faPlus} /> Add New Transfer
            </button>
        </div>

      {loading ? (
        <p>Loading transfers...</p>
      ) : transfers.length === 0 ? (
        <p>No transfers found</p>
      ) : (
        <table className="transfers-table">
          <thead>
            <tr>
              <th>Transfer #</th>
              <th>Date</th>
              <th>Transferred By</th>
              <th>Department From</th>
              <th>Transferred To</th>
              <th>Items</th>
              <th>Total Qty</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map(transfer => (
              <tr key={transfer.id}>
                <td>{transfer.transfer_number}</td>
                <td>{new Date(transfer.transfer_date).toLocaleDateString()}</td>
                <td>{transfer.transferred_by}</td>
                <td>{transfer.department_name || 'No department'}</td>
                <td>{transfer.destination_name}</td>
                <td>{transfer.item_count}</td>
                <td>{transfer.total_quantity}</td>
                <td className="actions">
                  <button 
                    className="btn-view" 
                    title="View Details"
                    onClick={() => handleViewTransfer(transfer.id)}
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                  <button 
                    className="btn-edit" 
                    title="Edit"
                    onClick={() => handleEditTransfer(transfer.id)}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </button>
                  <button 
                    className="btn-delete" 
                    title="Delete"
                    onClick={() => handleDeleteTransfer(transfer.id)}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddPopup && (
        <AddTransferPopup 
          onClose={handleClosePopup}
          onSave={handleTransferSaved}
        />
      )}

    {showViewPopup && selectedTransfer && (
    <ViewTransferPopup 
        transfer={selectedTransfer}
        onClose={handleClosePopup}
    />
    )}

    {showEditPopup && selectedTransfer && (
    <EditTransferPopup 
        transfer={selectedTransfer}
        onClose={handleClosePopup}
        onSave={handleTransferSaved}
    />
    )}
    </div>
  );
};

export default TransfersManagement;