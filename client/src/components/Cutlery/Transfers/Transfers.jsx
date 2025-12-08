import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddTransferForm from './AddTransferForm';
import ViewTransfer from './ViewTransfer';
import EditTransfer from './EditTransfer';
import './Transfers.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faPen, faTrash } from '@fortawesome/free-solid-svg-icons';

const Transfers = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState(null);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchTransfers();
  }, []);

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-transfers');
      setTransfers(response.data);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      showPopup('error', 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransfer = async (transferData) => {
    try {
      const response = await api.post('/cutlery-transfers', transferData);
      showPopup('success', response.data.message);
      setShowAddForm(false);
      fetchTransfers();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to create transfer');
    }
  };

  const handleViewTransfer = (transfer) => {
    setViewingTransfer(transfer);
  };

  const handleEditTransfer = (transfer) => {
    setEditingTransfer(transfer);
  };

  const handleUpdateTransfer = async (transferData) => {
    try {
      const response = await api.put(`/cutlery-transfers/${editingTransfer.id}`, transferData);
      showPopup('success', response.data.message);
      setEditingTransfer(null);
      fetchTransfers();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update transfer');
    }
  };

  const handleDeleteTransfer = async (id, transferId) => {
    if (window.confirm(`Are you sure you want to delete transfer ${transferId}?`)) {
      try {
        await api.delete(`/cutlery-transfers/${id}`);
        showPopup('success', 'Transfer deleted successfully');
        fetchTransfers();
      } catch (err) {
        showPopup('error', err.response?.data?.error || 'Failed to delete transfer');
      }
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'Pending': { class: 'status-pending', label: 'Pending' },
      'Completed': { class: 'status-completed', label: 'Completed' },
      'Cancelled': { class: 'status-cancelled', label: 'Cancelled' }
    };
    
    const config = statusConfig[status] || { class: 'status-pending', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  if (loading) {
    return <div className="loading">Loading transfers...</div>;
  }

  return (
    <div className="transfers-container">
      <div className="transfers-header">
        <h2>Cutlery Transfers</h2>
        <button 
          className="btn-add-transfer"
          onClick={() => setShowAddForm(true)}
        >
          + Add New Transfer
        </button>
      </div>

      {showAddForm && (
        <AddTransferForm
          onSubmit={handleAddTransfer}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {viewingTransfer && (
        <ViewTransfer
          transfer={viewingTransfer}
          onClose={() => setViewingTransfer(null)}
          onEdit={() => {
            setEditingTransfer(viewingTransfer);
            setViewingTransfer(null);
          }}
        />
      )}

      {editingTransfer && (
        <EditTransfer
          transfer={editingTransfer}
          onSubmit={handleUpdateTransfer}
          onCancel={() => setEditingTransfer(null)}
        />
      )}

      <div className="transfers-table-container">
        {transfers.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">🔄</div>
            <p>No transfers found. Create your first transfer to get started.</p>
          </div>
        ) : (
          <table className="transfers-table">
            <thead>
              <tr>
                <th>Transfer ID</th>
                <th>Date</th>
                <th>From Location</th>
                <th>To Location</th>
                <th>Asset</th>
                <th>Quantity</th>
                <th>Transferred By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(transfer => (
                <tr key={transfer.id}>
                  <td className="transfer-id">{transfer.transfer_id}</td>
                  <td className="transfer-date">
                    {new Date(transfer.transfer_date).toLocaleDateString()}
                  </td>
                  <td className="from-location">{transfer.from_location_name}</td>
                  <td className="to-location">{transfer.to_location_name}</td>
                  <td className="asset-info">
                    <div className="asset-name">{transfer.asset_name}</div>
                    <div className="asset-code">{transfer.asset_code}</div>
                  </td>
                  <td className="quantity">{transfer.quantity}</td>
                  <td className="transferred-by">{transfer.transferred_by}</td>
                  <td className="status">
                    {getStatusBadge(transfer.status)}
                  </td>
                  <td className="actions">
                    <button
                      className="btn-view"
                      onClick={() => handleViewTransfer(transfer)}
                      title="View Transfer"
                    >
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    <button
                      className="btn-edit"
                      onClick={() => handleEditTransfer(transfer)}
                      title="Edit Transfer"
                    >
                      <FontAwesomeIcon icon={faPen} />
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteTransfer(transfer.id, transfer.transfer_id)}
                      title="Delete Transfer"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Transfers;