import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import AddPurchaseForm from './AddPurchaseForm';
import ViewPurchase from './ViewPurchase';
import EditPurchase from './EditPurchase';
import './Purchases.css';

const Purchases = () => {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState(null);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const { showPopup } = usePopup();

  const fetchPurchases = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-purchases');
      setPurchases(response.data);
    } catch (err) {
      console.error('Error fetching purchases:', err);
      showPopup('error', 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleAddPurchase = async (purchaseData) => {
    try {
      const response = await api.post('/cutlery-purchases', purchaseData);
      showPopup('success', response.data.message);
      setShowAddForm(false);
      fetchPurchases();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to create purchase');
    }
  };

  const handleViewPurchase = (purchase) => {
    setViewingPurchase(purchase);
  };

  const handleEditPurchase = (purchase) => {
    setEditingPurchase(purchase);
  };

  const handleUpdatePurchase = async (purchaseData) => {
    try {
      const response = await api.put(`/cutlery-purchases/${editingPurchase.id}`, purchaseData);
      showPopup('success', response.data.message);
      setEditingPurchase(null);
      fetchPurchases();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to update purchase');
    }
  };

  const handleDeletePurchase = async (id, purchaseId) => {
    if (window.confirm(`Are you sure you want to delete purchase ${purchaseId}?`)) {
      try {
        await api.delete(`/cutlery-purchases/${id}`);
        showPopup('success', 'Purchase deleted successfully');
        fetchPurchases();
      } catch (err) {
        showPopup('error', err.response?.data?.error || 'Failed to delete purchase');
      }
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'PENDING': { class: 'status-pending', label: 'Pending' },
      'PAID': { class: 'status-paid', label: 'Paid' },
      'PARTIAL': { class: 'status-partial', label: 'Partial' }
    };
    
    const config = statusConfig[status] || { class: 'status-pending', label: status };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const getPaymentMethodBadge = (method) => {
    const methodConfig = {
      'CASH': { class: 'method-cash', label: 'Cash' },
      'BANK_TRANSFER': { class: 'method-bank', label: 'Bank Transfer' },
      'CREDIT': { class: 'method-credit', label: 'Credit' }
    };
    
    const config = methodConfig[method] || { class: 'method-cash', label: method };
    return <span className={`method-badge ${config.class}`}>{config.label}</span>;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return <div className="loading">Loading purchases...</div>;
  }

  return (
    <div className="purchases-container">
      <div className="purchases-header">
        <h2>Cutlery Purchases</h2>
        <button 
          className="btn-add-purchase"
          onClick={() => setShowAddForm(true)}
        >
          + Add New Purchase
        </button>
      </div>

      {showAddForm && (
        <AddPurchaseForm
          onSubmit={handleAddPurchase}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {viewingPurchase && (
        <ViewPurchase
          purchase={viewingPurchase}
          onClose={() => setViewingPurchase(null)}
          onEdit={() => {
            setEditingPurchase(viewingPurchase);
            setViewingPurchase(null);
          }}
        />
      )}

      {editingPurchase && (
        <EditPurchase
          purchase={editingPurchase}
          onSubmit={handleUpdatePurchase}
          onCancel={() => setEditingPurchase(null)}
        />
      )}

      <div className="purchases-table-container">
        {purchases.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">🛒</div>
            <p>No purchases found. Create your first purchase to get started.</p>
          </div>
        ) : (
          <table className="purchases-table">
            <thead>
              <tr>
                <th>Purchase ID</th>
                <th>Date</th>
                <th>Invoice No</th>
                <th>Supplier</th>
                <th>Total Amount</th>
                <th>Payment Method</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map(purchase => (
                <tr key={purchase.id}>
                  <td className="purchase-id">{purchase.purchase_id}</td>
                  <td className="purchase-date">
                    {new Date(purchase.purchase_date).toLocaleDateString()}
                  </td>
                  <td className="invoice-number">{purchase.invoice_number}</td>
                  <td className="supplier">{purchase.supplier_name}</td>
                  <td className="total-amount">
                    {formatCurrency(purchase.calculated_total || purchase.total_amount)}
                  </td>
                  <td className="payment-method">
                    {getPaymentMethodBadge(purchase.payment_method)}
                  </td>
                  <td className="status">
                    {getStatusBadge(purchase.payment_status)}
                  </td>
                  <td className="actions">
                    <button
                      className="btn-view"
                      onClick={() => handleViewPurchase(purchase)}
                      title="View Purchase"
                    >
                      View
                    </button>
                    <button
                      className="btn-edit"
                      onClick={() => handleEditPurchase(purchase)}
                      title="Edit Purchase"
                    >
                      Edit
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeletePurchase(purchase.id, purchase.purchase_id)}
                      title="Delete Purchase"
                    >
                      Delete
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

export default Purchases;