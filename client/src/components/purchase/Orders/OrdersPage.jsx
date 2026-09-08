// src/components/purchase/Orders/OrdersPage.jsx
//
// RM -> Orders. Reuses the existing RM stock calculation, suppliers, and
// Purchasing Invoice workflow instead of building a parallel system (see
// server/controllers/orderController.js for the backend side of this).
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faExclamationTriangle,
  faBoxes,
  faClock,
  faCheckCircle,
  faFileInvoice,
  faBan,
  faSearch,
  faTimes,
  faSpinner
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import { formatNumber } from '../../../utils/formatters';
import CreateOrderModal from './CreateOrderModal';
import ConfirmOrderModal from './ConfirmOrderModal';
import './OrdersPage.css';

const TABS = [
  { key: 'low-stock', label: 'Low Stock', icon: faExclamationTriangle },
  { key: 'pending', label: 'Pending Orders', icon: faClock },
  { key: 'completed', label: 'Completed Orders', icon: faCheckCircle }
];

const todayISO = () => new Date().toLocaleDateString('en-CA');

const OrdersPage = () => {
  const navigate = useNavigate();
  const { showPopup } = usePopup();

  const [activeTab, setActiveTab] = useState('low-stock');
  const [suppliers, setSuppliers] = useState([]);

  // Low Stock
  const [lowStock, setLowStock] = useState([]);
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [lowStockError, setLowStockError] = useState('');
  const [orderModalItem, setOrderModalItem] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Pending Orders
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'cancel'|'complete', order }
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // Completed Orders
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(todayISO());
  const [completedOrders, setCompletedOrders] = useState([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState('');
  const [hasSearchedCompleted, setHasSearchedCompleted] = useState(false);

  useEffect(() => {
    api.get('/suppliers').then(res => setSuppliers(res.data)).catch(() => setSuppliers([]));
  }, []);

  const fetchLowStock = useCallback(async () => {
    setLowStockLoading(true);
    setLowStockError('');
    try {
      const { data } = await api.get('/orders/low-stock');
      setLowStock(data);
    } catch (error) {
      setLowStockError(error.response?.data?.error || 'Failed to load low stock items.');
    } finally {
      setLowStockLoading(false);
    }
  }, []);

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError('');
    try {
      const { data } = await api.get('/orders/pending');
      setPendingOrders(data);
    } catch (error) {
      setPendingError(error.response?.data?.error || 'Failed to load pending orders.');
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLowStock();
    fetchPending();
  }, [fetchLowStock, fetchPending]);

  useEffect(() => {
    if (activeTab === 'low-stock') {
      fetchLowStock();
    } else if (activeTab === 'pending') {
      fetchPending();
    }
  }, [activeTab, fetchLowStock, fetchPending]);

  const searchCompleted = async (e) => {
    e?.preventDefault();
    if (!fromDate || !toDate) {
      showPopup('warning', 'Please select both From Date and To Date.');
      return;
    }
    setCompletedLoading(true);
    setCompletedError('');
    setHasSearchedCompleted(true);
    try {
      const { data } = await api.get('/orders/completed', { params: { startDate: fromDate, endDate: toDate } });
      setCompletedOrders(data);
    } catch (error) {
      setCompletedError(error.response?.data?.error || 'Failed to load completed orders.');
    } finally {
      setCompletedLoading(false);
    }
  };

  const clearCompletedFilter = () => {
    setFromDate('');
    setToDate(todayISO());
    setCompletedOrders([]);
    setHasSearchedCompleted(false);
    setCompletedError('');
  };

  const handlePlaceOrder = async (payload) => {
    setPlacingOrder(true);
    try {
      const { data } = await api.post('/orders', payload);
      showPopup('success', `Order ${data.order_no} placed successfully.`);
      setOrderModalItem(null);
      fetchPending();
      fetchLowStock();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to place order.');
    } finally {
      setPlacingOrder(false);
    }
  };

  const goToInvoice = (order) => {
    navigate(`/purchase/new?order_id=${order.id}`);
  };

  const openCancelConfirm = (order) => setConfirmAction({ type: 'cancel', order });
  const openCompleteConfirm = (order) => setConfirmAction({ type: 'complete', order });

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, order } = confirmAction;

    if (type === 'complete') {
      // "Order Complete" only opens the existing Purchasing Invoice workflow -
      // the Order itself only becomes COMPLETED once that invoice is actually
      // saved (spec section 28).
      setConfirmAction(null);
      goToInvoice(order);
      return;
    }

    setConfirmSubmitting(true);
    try {
      await api.patch(`/orders/${order.id}/cancel`);
      showPopup('success', `Order ${order.order_no} cancelled.`);
      setConfirmAction(null);
      fetchPending();
      fetchLowStock();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to cancel order.');
    } finally {
      setConfirmSubmitting(false);
    }
  };

  return (
    <div className="orders-page">
      <div className="orders-page-header">
        <h1><FontAwesomeIcon icon={faBoxes} /> Orders</h1>
      </div>

      <div className="orders-tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`orders-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            <FontAwesomeIcon icon={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── LOW STOCK ─────────────────────────────────────────────────── */}
      {activeTab === 'low-stock' && (
        <div className="orders-tab-panel">
          {lowStockLoading ? (
            <div className="orders-state"><FontAwesomeIcon icon={faSpinner} spin /> Loading low stock items...</div>
          ) : lowStockError ? (
            <div className="orders-state orders-state-error">{lowStockError}</div>
          ) : lowStock.length === 0 ? (
            <div className="orders-state">No low-stock items found.</div>
          ) : (
            <div className="orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>RM Item Name</th>
                    <th>Current Stock</th>
                    <th>Unit</th>
                    <th>Minimum Buffer Stock</th>
                    <th>Required Qty</th>
                    <th>Ordered</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map(item => {
                    const isOrdered = Boolean(item.is_ordered || item.ordered === 'Yes');
                    return (
                      <tr key={item.item_id}>
                        <td>{item.item_name}</td>
                        <td>{formatNumber(item.current_stock)}</td>
                        <td>{item.unit}</td>
                        <td>{formatNumber(item.buffer_stock)}</td>
                        <td className="orders-required-qty">{formatNumber(item.required_qty)}</td>
                        <td>
                          <span
                            className={`orders-badge ${isOrdered ? 'orders-badge-yes' : 'orders-badge-no'}`}
                            title={isOrdered && item.pending_order_no ? `Pending order: ${item.pending_order_no}` : undefined}
                          >
                            {isOrdered ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>
                          <button className="btn-primary btn-sm" onClick={() => setOrderModalItem(item)}>
                            Order
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PENDING ORDERS ────────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <div className="orders-tab-panel">
          {pendingLoading ? (
            <div className="orders-state"><FontAwesomeIcon icon={faSpinner} spin /> Loading pending orders...</div>
          ) : pendingError ? (
            <div className="orders-state orders-state-error">{pendingError}</div>
          ) : pendingOrders.length === 0 ? (
            <div className="orders-state">No pending orders found.</div>
          ) : (
            <div className="orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order No</th>
                    <th>RM Item Name</th>
                    <th>Order Qty</th>
                    <th>Unit</th>
                    <th>Supplier</th>
                    <th>Ordered Date</th>
                    <th>Expected Receive Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.map(order => (
                    <tr key={order.id}>
                      <td>{order.order_no}</td>
                      <td>{order.items.map(i => i.item_name).join(', ')}</td>
                      <td>{order.items.map(i => formatNumber(i.quantity)).join(', ')}</td>
                      <td>{order.items.map(i => i.unit).join(', ')}</td>
                      <td>{order.supplier_name || '-'}</td>
                      <td>{order.ordered_date}</td>
                      <td>{order.expected_receive_date}</td>
                      <td><span className="orders-badge orders-badge-pending">Pending</span></td>
                      <td className="orders-actions">
                        <button className="btn-link" onClick={() => goToInvoice(order)}>
                          <FontAwesomeIcon icon={faFileInvoice} /> Go to Invoice
                        </button>
                        <button className="btn-link orders-link-success" onClick={() => openCompleteConfirm(order)}>
                          <FontAwesomeIcon icon={faCheckCircle} /> Order Complete
                        </button>
                        <button className="btn-link orders-link-danger" onClick={() => openCancelConfirm(order)}>
                          <FontAwesomeIcon icon={faBan} /> Cancel Order
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── COMPLETED ORDERS ──────────────────────────────────────────── */}
      {activeTab === 'completed' && (
        <div className="orders-tab-panel">
          <form className="orders-date-filter" onSubmit={searchCompleted}>
            <div className="orders-date-field">
              <label>From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="orders-date-field">
              <label>To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary btn-sm">
              <FontAwesomeIcon icon={faSearch} /> Search
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={clearCompletedFilter}>
              <FontAwesomeIcon icon={faTimes} /> Clear
            </button>
          </form>

          {completedLoading ? (
            <div className="orders-state"><FontAwesomeIcon icon={faSpinner} spin /> Loading completed orders...</div>
          ) : completedError ? (
            <div className="orders-state orders-state-error">{completedError}</div>
          ) : !hasSearchedCompleted ? (
            <div className="orders-state">Select a date range to view completed orders.</div>
          ) : completedOrders.length === 0 ? (
            <div className="orders-state">No completed orders found for the selected date range.</div>
          ) : (
            <div className="orders-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order No</th>
                    <th>RM Item Name</th>
                    <th>Order Qty</th>
                    <th>Unit</th>
                    <th>Supplier</th>
                    <th>Ordered Date</th>
                    <th>Expected Receive Date</th>
                    <th>Completed Date</th>
                    <th>Status</th>
                    <th>Invoice No</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {completedOrders.map(order => (
                    <tr key={order.id}>
                      <td>{order.order_no}</td>
                      <td>{order.items.map(i => i.item_name).join(', ')}</td>
                      <td>{order.items.map(i => formatNumber(i.quantity)).join(', ')}</td>
                      <td>{order.items.map(i => i.unit).join(', ')}</td>
                      <td>{order.supplier_name || '-'}</td>
                      <td>{order.ordered_date}</td>
                      <td>{order.expected_receive_date}</td>
                      <td>{order.completed_date}</td>
                      <td><span className="orders-badge orders-badge-completed">Completed</span></td>
                      <td>{order.invoice_no || '-'}</td>
                      <td>
                        {order.invoice_id && (
                          <button className="btn-link" onClick={() => navigate(`/purchase/${order.invoice_id}`)}>
                            <FontAwesomeIcon icon={faFileInvoice} /> View Invoice
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {orderModalItem && (
        <CreateOrderModal
          item={orderModalItem}
          suppliers={suppliers}
          submitting={placingOrder}
          onClose={() => (placingOrder ? null : setOrderModalItem(null))}
          onSubmit={handlePlaceOrder}
        />
      )}

      {confirmAction && (
        <ConfirmOrderModal
          order={confirmAction.order}
          submitting={confirmSubmitting}
          confirmLabel={confirmAction.type === 'cancel' ? 'Confirm Cancellation' : 'Continue'}
          message={
            confirmAction.type === 'cancel'
              ? 'Are you sure you want to cancel this order?'
              : 'Are you sure you want to complete this order and proceed to the Purchasing Invoice?'
          }
          onCancel={() => (confirmSubmitting ? null : setConfirmAction(null))}
          onConfirm={runConfirmAction}
        />
      )}
    </div>
  );
};

export default OrdersPage;
