//src/components/purchase/PurchaseDetails.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Purchase.css';

const PurchaseDetails = () => {
  const { id } = useParams();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPurchase = async () => {
      try {
        // CORRECTED: Properly interpolate the id in the URL
        const response = await fetch(`http://localhost:5000/api/purchases/${id}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Process data to ensure numeric values
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
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!purchase) return <div>No purchase data found</div>;

  return (
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
      
      <div className="actions">
        <button onClick={() => navigate('/purchase/history')} className="btn-back">
          Back to History
        </button>
      </div>
    </div>
  );
};

export default PurchaseDetails;