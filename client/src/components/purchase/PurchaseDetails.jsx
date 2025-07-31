//src/components/purchase/PurchaseDetails.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const PurchaseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPurchase = async () => {
      try {
         const response = await fetch(`http://localhost:5000/api/purchases/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('Purchase not found');
          } else {
            throw new Error('Failed to fetch purchase details');
          }
          return;
        }
        
        const data = await response.json();
        setPurchase(data);
      } catch (error) {
        console.error('Error fetching purchase:', error);
        setError('Failed to load purchase details');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPurchase();
  }, [id]);

  if (loading) return <div className="container">Loading...</div>;
  if (error) return <div className="container">{error}</div>;
  if (!purchase) return <div className="container">Purchase not found</div>;

  return (
    <div className="container">
      <button onClick={() => navigate(-1)} className="btn-back">
        &larr; Back to History
      </button>
      
      <h2>Purchase Invoice: {purchase.invoice_no}</h2>
      
      <div className="invoice-header">
        <div>
          <strong>Date:</strong> {new Date(purchase.purchase_date).toLocaleDateString()}
        </div>
        <div>
          <strong>Supplier:</strong> {purchase.supplier_name}
        </div>
        <div>
          <strong>Contact:</strong> {purchase.contact_info || 'N/A'}
        </div>
      </div>
      
      <table className="item-table">
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Unit Price (Rs.)</th>
            <th>Total (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          {purchase.items && purchase.items.map((item, index) => (
            <tr key={index}>
              <td>{item.item_name}</td>
              <td>{item.quantity}</td>
              <td>{item.unit_price.toFixed(2)}</td>
              <td>{(item.quantity * item.unit_price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div className="invoice-summary">
        <div>
          <strong>Bill Amount:</strong> Rs. {purchase.bill_amount.toFixed(2)}
        </div>
        <div>
          <strong>Paid Amount:</strong> Rs. {purchase.paid_amount.toFixed(2)}
        </div>
        <div>
          <strong>Balance/Due:</strong> Rs. {(purchase.bill_amount - purchase.paid_amount).toFixed(2)}
        </div>
        <div>
          <strong>Payment Method:</strong> {purchase.payment_method}
        </div>
        <div>
          <strong>Remarks:</strong> {purchase.remarks || 'None'}
        </div>
      </div>
      
      {purchase.attachment_path && (
        <div className="attachment">
          <h3>Attachment</h3>
          <a 
            href={`http://localhost:5000/${purchase.attachment_path}`} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            View Invoice Document
          </a>
        </div>
      )}
    </div>
  );
};

export default PurchaseDetail;