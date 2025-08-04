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
    <div className="purchase-details">
      <div className="header-with-actions">
        <h2 style={{ color: '#6722e6', marginBottom: 0 }}>
          <span style={{ fontWeight: 700 }}>Purchase Invoice:</span> {purchase.invoice_no}
        </h2>
        <button onClick={() => navigate('/purchase/history')} className="btn-secondary">
          &#8592; Back to History
        </button>
      </div>

      <div className="details-row">
        <div>
          <label>Date</label>
          <div>{new Date(purchase.purchase_date).toLocaleDateString()}</div>
        </div>
        <div>
          <label>Supplier</label>
          <div>{purchase.supplier_name}</div>
        </div>
        <div>
          <label>Contact</label>
          <div>{purchase.contact_name} | {purchase.contact_phone}</div>
        </div>
        <div>
          <label>Payment Method</label>
          <div>{purchase.payment_method}</div>
        </div>
        <div>
          <label>Prepared By</label>
          <div>User ID {purchase.prepared_by}</div>
        </div>
      </div>

      <div className="totals-section">
        <div className="totals-row">
          <span>Bill Amount</span>
          <span>Rs. {purchase.bill_amount.toFixed(2)}</span>
        </div>
        <div className="totals-row">
          <span>Paid Amount</span>
          <span>Rs. {purchase.paid_amount.toFixed(2)}</span>
        </div>
        <div className="totals-row due">
          <span>Due</span>
          <span style={{ color: '#dc3545' }}>Rs. {(purchase.bill_amount - purchase.paid_amount).toFixed(2)}</span>
        </div>
      </div>

      <div className="remarks-section">
        <strong>Remarks:</strong> <span style={{ color: '#555' }}>{purchase.remarks || 'N/A'}</span>
      </div>

      <div className="items-table">
        <h3>Purchased Items</h3>
        <table>
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
    </div>
  );
};

export default PurchaseDetails;