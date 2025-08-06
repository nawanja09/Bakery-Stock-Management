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
        const response = await fetch(`http://localhost:5000/api/purchases/${id}`);
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
  }, [id]);

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!purchase) return <div>No purchase data found</div>;

  return (
    <div className="new-purchase-container">
      <div className="header-with-actions">
        <h2>🧾 Purchase Details</h2>
        <button onClick={() => navigate('/purchase/history')} className="btn-secondary">
          ← Back to History
        </button>
      </div>

      <div className="purchase-details">
        <div className="details-row">
          <div>
            <label>Invoice No.</label>
            <p>{purchase.invoice_no}</p>
          </div>
          <div>
            <label>Date</label>
            <p>{new Date(purchase.purchase_date).toLocaleDateString()}</p>
          </div>
          <div>
            <label>Payment Method</label>
            <p>{purchase.payment_method}</p>
          </div>
        </div>

        <div className="details-row">
          <div>
            <label>Supplier</label>
            <p>{purchase.supplier_name}</p>
          </div>
          <div>
            <label>Contact</label>
            <p>{purchase.contact_name} | {purchase.contact_phone}</p>
          </div>
          <div>
            <label>Prepared By</label>
            <p>User ID {purchase.prepared_by}</p>
          </div>
        </div>

        <div className="totals-section">
          <div className="totals-row">
            <span>Bill Amount</span>
            <span>Rs. {purchase.bill_amount.toFixed(2)}</span>
          </div>
          <div className="totals-row">
            <span>Paid</span>
            <span>Rs. {purchase.paid_amount.toFixed(2)}</span>
          </div>
          <div className="totals-row due">
            <span>Due</span>
            <span>Rs. {(purchase.bill_amount - purchase.paid_amount).toFixed(2)}</span>
          </div>
        </div>

        <div className="remarks-section">
          <strong>Remarks:</strong>
          <p>{purchase.remarks || 'N/A'}</p>
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
    </div>
  );
};

export default PurchaseDetails;
