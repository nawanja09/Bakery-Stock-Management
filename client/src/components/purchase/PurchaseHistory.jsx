//src/components/purchase/PurchaseHistory.jsx

import React, { useState, useEffect } from 'react';
// import { Link } from 'react-router-dom';
import './Purchase.css';

// Modal component for displaying purchase details
const PurchaseDetailsModal = ({ purchaseId, onClose }) => {
  const [purchase, setPurchase] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!purchaseId) return;
    const fetchPurchase = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/purchases/${purchaseId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        const processedData = {
          ...data,
          bill_amount: Number(data.bill_amount),
          paid_amount: Number(data.paid_amount),
          items: data.items.map(item => ({
            ...item,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price)
          }))
        };
        setPurchase(processedData);
      } catch (err) {
        setError(err.message || 'Failed to fetch purchase details');
      } finally {
        setLoading(false);
      }
    };
    fetchPurchase();
  }, [purchaseId]);

  if (!purchaseId) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>&times;</button>
        {loading && <div>Loading...</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !error && purchase && (
          <div className="purchase-details-container">
            <h2>Purchase Invoice: {purchase.invoice_no}</h2>
            <div className="purchase-header">
              <div className="header-info">
                <p><strong>Date:</strong> {new Date(purchase.purchase_date).toLocaleDateString()}</p>
                <p><strong>Supplier:</strong> {purchase.supplier_name}</p>
                <p><strong>Contact:</strong> {purchase.contact_name} | {purchase.contact_phone}</p>
              </div>
              <div className="header-info">
                <p><strong>Bill Amount:</strong> Rs. {purchase.bill_amount.toFixed(2)}</p>
                <p><strong>Paid Amount:</strong> Rs. {purchase.paid_amount.toFixed(2)}</p>
                <p><strong>Due:</strong> Rs. {(purchase.bill_amount - purchase.paid_amount).toFixed(2)}</p>
                <p><strong>Payment Method:</strong> {purchase.payment_method}</p>
                <p><strong>Prepared By:</strong> User ID {purchase.prepared_by}</p>
              </div>
            </div>
            <div className="remarks">
              <strong>Remarks:</strong> {purchase.remarks || 'N/A'}
            </div>
            <h3>Purchased Items</h3>
            <table className="items-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Unit Price (Rs.)</th>
                  <th>Total (Rs.)</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.item_name}</td>
                    <td>{item.quantity.toFixed(2)}</td>
                    <td>{item.unit_price.toFixed(2)}</td>
                    <td>{(item.quantity * item.unit_price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const PurchaseHistory = () => {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPurchases = async () => {
      try {
         const response = await fetch('http://localhost:5000/api/purchases');
        if (!response.ok) {
          throw new Error('Failed to fetch purchases');
        }
        const data = await response.json();
        setPurchases(data);
      } catch (error) {
        console.error('Error fetching purchases:', error);
        alert('Failed to load purchase history');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPurchases();
  }, []);


  const [selectedId, setSelectedId] = useState(null);
  if (loading) return <div>Loading...</div>;

  return (
    <div className="container">
      <h2>Purchase History</h2>
      <table className="purchase-table">
        <thead>
          <tr>
            <th>Invoice No.</th>
            <th>Date</th>
            <th>Supplier</th>
            <th>Bill Amount (Rs.)</th>
            <th>Paid (Rs.)</th>
            <th>Due (Rs.)</th>
            <th>Payment Method</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map(purchase => (
            <tr key={purchase.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(purchase.id)}>
              <td>{purchase.invoice_no}</td>
              <td>{new Date(purchase.purchase_date).toLocaleDateString()}</td>
              <td>{purchase.supplier_name}</td>
              <td>{Number(purchase.bill_amount).toFixed(2)}</td>
              <td>{Number(purchase.paid_amount).toFixed(2)}</td>
              <td>{(Number(purchase.bill_amount) - Number(purchase.paid_amount)).toFixed(2)}</td>
              <td>{purchase.payment_method}</td>
              <td>
                <button className="btn-view" onClick={e => { e.stopPropagation(); setSelectedId(purchase.id); }}>View</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedId && (
        <PurchaseDetailsModal purchaseId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
};

export default PurchaseHistory;