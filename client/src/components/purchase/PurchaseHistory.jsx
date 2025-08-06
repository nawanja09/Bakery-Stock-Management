import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import './Purchase.css';

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

  //  Search function
  const handleSearch = (event) => {
    const query = event.target.value.toLowerCase();
    const filteredPurchases = purchases.filter(purchase =>  
      purchase.invoice_no.toLowerCase().includes(query) ||
      purchase.supplier_name.toLowerCase().includes(query) ||     
      purchase.payment_method.toLowerCase().includes(query)
    );
    setPurchases(filteredPurchases);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="new-purchase-container">
  <div className="header-with-actions">
    <h2>📜 Purchase History</h2>
  </div>

  <div className="search-bar">
    <div className="search-input">
      <FontAwesomeIcon icon={faSearch} className="search-icon" />
      <input
        type="text"
        placeholder="Search by invoice, supplier, etc..."
        onChange={handleSearch}
      />
    </div>
  </div>

  {/* ✅ Wrap the entire table inside .table-wrapper */}
  <div className="table-wrapper">
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
          <th className="text-center">Actions</th>
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
            <td className="due-amount">
              {(Number(purchase.bill_amount) - Number(purchase.paid_amount)).toFixed(2)}
            </td>
            <td>{purchase.payment_method}</td>
            <td className="text-center">
              <Link to={`/purchase/${purchase.id}`} className="btn-secondary">
                View
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>

  );
};

export default PurchaseHistory;
