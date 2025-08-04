//src/components/purchase/PurchaseHistory.jsx

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

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
            <tr key={purchase.id}>
              <td>{purchase.invoice_no}</td>
              <td>{new Date(purchase.purchase_date).toLocaleDateString()}</td>
              <td>{purchase.supplier_name}</td>
              <td>{Number(purchase.bill_amount).toFixed(2)}</td>
              <td>{Number(purchase.paid_amount).toFixed(2)}</td>
              <td>{(Number(purchase.bill_amount) - Number(purchase.paid_amount)).toFixed(2)}</td>
              <td>{purchase.payment_method}</td>
              <td>
                <Link to={`/purchase/${purchase.id}`} className="btn-view">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PurchaseHistory;