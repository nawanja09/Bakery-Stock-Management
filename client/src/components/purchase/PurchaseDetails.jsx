import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './Purchase.css';
import api from '../../api';

const PurchaseDetails = () => {
  const { id } = useParams();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPurchase = async () => {
      try {
        const response = await api.get(`/purchases/${id}`);
        const data = response.data;
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
        <div className="details-row vertical">
          <ul>
            <li>
              <strong>Invoice No.:</strong> {purchase.invoice_no}
            </li>
            <li>
              <strong> Date:</strong> {purchase.purchase_date}
            </li>
            <li>
              <strong>Payment Method:</strong> {purchase.payment_method}
            </li>
            <li>
              <strong>Supplier:</strong> {purchase.supplier_name}
            </li>
            <li>
              <strong>Contact:</strong> {purchase.contact_name} | {purchase.contact_phone}
            </li>
          </ul>
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
                  <td>{Number(item.quantity).toFixed(3)}</td>
                  <td>{Number(item.unit_price).toFixed(2)}</td>
                  <td>{(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
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
