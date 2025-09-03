import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import './Purchase.css';
import api from '../../api';

const PurchaseHistory = () => {
  const [purchases, setPurchases] = useState([]);
  const [filteredPurchases, setFilteredPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState(''); // ✅ Added company filter state

  useEffect(() => {
    const fetchPurchases = async () => {
      try {
        const response = await api.get('/purchases');
        setPurchases(response.data);
        setFilteredPurchases(response.data);
      } catch (error) {
        console.error('Error fetching purchases:', error);
        alert('Failed to load purchase history');
      } finally {
        setLoading(false);
      }
    };
    fetchPurchases();
  }, []);

  // Search function
  const handleSearch = (event) => {
    const query = event.target.value.toLowerCase();
    const filtered = purchases.filter(purchase =>  
      purchase.invoice_no.toLowerCase().includes(query) ||
      purchase.supplier_name.toLowerCase().includes(query) ||     
      purchase.payment_method.toLowerCase().includes(query) ||
      purchase.company_name.toLowerCase().includes(query) // ✅ Added company to search
    );
    
    // Apply company filter if selected
    if (companyFilter) {
      const companyFiltered = filtered.filter(purchase => 
        purchase.company_id.toString() === companyFilter
      );
      setFilteredPurchases(companyFiltered);
    } else {
      setFilteredPurchases(filtered);
    }
  };

  // ✅ Added company filter handler
  const handleCompanyFilter = (e) => {
    const companyId = e.target.value;
    setCompanyFilter(companyId);
    
    if (companyId) {
      const filtered = purchases.filter(purchase => 
        purchase.company_id.toString() === companyId
      );
      setFilteredPurchases(filtered);
    } else {
      setFilteredPurchases(purchases);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="new-purchase-container">
      <div className="header-with-actions">
        <h2>📜 Purchase History</h2>
        <Link to="/purchase/new" className="btn-primary">
          + New Purchase
        </Link>
      </div>

      <div className="search-bar">
        <div className="search-input">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            placeholder="Search by invoice, supplier, company..."
            onChange={handleSearch}
          />
        </div>
        <div>
          <select
            value={companyFilter}
            onChange={handleCompanyFilter}
          >
            <option value="">All Companies</option>
            <option value="1">JH</option>
            <option value="2">RR</option>
          </select>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Invoice No.</th><th>Date</th><th>Supplier</th><th>Company</th><th>Bill Amount (Rs.)</th><th>Paid (Rs.)</th><th>Due (Rs.)</th><th>Payment Method</th><th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases.map(purchase => (
              <tr key={purchase.id}>
                <td>{purchase.invoice_no}</td><td>{new Date(purchase.purchase_date).toLocaleDateString()}</td><td>{purchase.supplier_name}</td><td>{purchase.company_name}</td><td>{Number(purchase.bill_amount).toFixed(2)}</td><td>{Number(purchase.paid_amount).toFixed(2)}</td><td className="due-amount">{(Number(purchase.bill_amount) - Number(purchase.paid_amount)).toFixed(2)}</td><td>{purchase.payment_method}</td><td className="text-center"><Link to={`/purchase/${purchase.id}`} className="btn-secondary">View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseHistory;