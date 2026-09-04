import React, { useState, useEffect, useCallback } from 'react';
import { FiEye, FiEdit, FiTrash2, FiPlus } from 'react-icons/fi';
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
      const res = await api.get('/cutlery-purchases');
      setPurchases(res.data);
    } catch (err) {
      showPopup('error', 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleAddPurchase = async (data) => {
    try {
      const res = await api.post('/cutlery-purchases', data);
      showPopup('success', res.data.message);
      setShowAddForm(false);
      fetchPurchases();
    } catch (err) {
      showPopup('error', err.response?.data?.error || 'Failed to create purchase');
    }
  };

  const handleViewPurchase = async (purchase) => {
    try {
      setLoading(true);
      const res = await api.get(`/cutlery-purchases/${purchase.id}`);
      setViewingPurchase(res.data);
    } catch {
      showPopup('error', 'Failed to load purchase details');
    } finally {
      setLoading(false);
    }
  };

  const handleEditPurchase = async (purchase) => {
    try {
      setLoading(true);
      const res = await api.get(`/cutlery-purchases/${purchase.id}`);
      setEditingPurchase(res.data);
    } catch {
      showPopup('error', 'Failed to load purchase');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePurchase = async (data) => {
    try {
      const res = await api.put(
        `/cutlery-purchases/${editingPurchase.id}`,
        data
      );
      showPopup('success', res.data.message);
      setEditingPurchase(null);
      fetchPurchases();
    } catch {
      showPopup('error', 'Failed to update purchase');
    }
  };

  const handleDeletePurchase = async (id, purchaseId) => {
    if (!window.confirm(`Delete purchase ${purchaseId}?`)) return;

    try {
      await api.delete(`/cutlery-purchases/${id}`);
      showPopup('success', 'Purchase deleted');
      fetchPurchases();
    } catch {
      showPopup('error', 'Failed to delete purchase');
    }
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR'
    }).format(amount);

  const statusBadge = (status) => (
    <span className={`badge status ${status.toLowerCase()}`}>
      {status}
    </span>
  );

  const methodBadge = (method) => (
    <span className={`badge method`}>
      {method.replace('_', ' ')}
    </span>
  );

  if (loading) return <div style={{ padding: 'var(--spacing-2xl)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Loading purchases…</div>;

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>Cutlery Purchases</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
          <FiPlus /> New Purchase
        </button>
      </header>

      <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
        {purchases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
            <div style={{ fontSize: '48px', marginBottom: 'var(--spacing-md)', opacity: 0.5 }}>🛒</div>
            <p>No purchases yet. Add your first purchase record to get started.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th>Total</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.purchase_id}</td>
                  <td>{new Date(p.purchase_date).toLocaleDateString()}</td>
                  <td>{p.invoice_number}</td>
                  <td>{p.supplier_name}</td>
                  <td>{formatCurrency(p.calculated_total || p.total_amount)}</td>
                  <td>{methodBadge(p.payment_method)}</td>
                  <td>{statusBadge(p.payment_status)}</td>
                  <td className="actions-cell">
                    <div className="actions">
                      <button
                        className="icon-btn"
                        onClick={() => handleViewPurchase(p)}
                        title="View"
                      >
                        <FiEye />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => handleEditPurchase(p)}
                        title="Edit"
                      >
                        <FiEdit />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => handleDeletePurchase(p.id, p.purchase_id)}
                        title="Delete"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
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
    </div>
  );
};

export default Purchases;
