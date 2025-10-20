import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faEdit } from '@fortawesome/free-solid-svg-icons';
import './Purchase.css';
import api from '../../api';

const PurchaseHistory = () => {
  const [purchases, setPurchases] = useState([]);
  const [filteredPurchases, setFilteredPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  // Items bullet list format - safe handling
  const formatItemsList = (items) => {
    if (!items || items.length === 0) {
      return <span style={{ color: '#888' }}>No items</span>;
    }

    return (
      <ul className="bullet-items">
        {items.map((item, index) => {
          const qty = parseFloat(item.quantity); // convert to number safely
          const displayQty = isNaN(qty) ? '-' : qty.toFixed(3); // fallback if not a number
          return (
            <li key={index}>
              {item.item_name} – {displayQty} {item.unit || ''}
            </li>
          );
        })}
      </ul>
    );
  };

  // Unified filter function
  const applyFilters = (query = searchQuery, companyId = companyFilter, start = startDate, end = endDate) => {
    let filtered = purchases;

    if (query) {
      filtered = filtered.filter(purchase =>
        purchase.check_number?.toLowerCase().includes(query.toLowerCase()) ||
        purchase.supplier_name?.toLowerCase().includes(query.toLowerCase()) ||
        purchase.payment_method?.toLowerCase().includes(query.toLowerCase()) ||
        purchase.company_name?.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (companyId) {
      filtered = filtered.filter(purchase =>
        purchase.company_id.toString() === companyId
      );
    }

    // Normalize start to the start of the day (00:00:00) to include whole day
    if (start) {
      const startDateObj = new Date(start);
      startDateObj.setHours(0, 0, 0, 0);
      filtered = filtered.filter(purchase =>
        new Date(purchase.purchase_date) >= startDateObj
      );
    }

    // Normalize end to the end of the day (23:59:59.999) to make it inclusive
    if (end) {
      const endDateObj = new Date(end);
      endDateObj.setHours(23, 59, 59, 999);
      filtered = filtered.filter(purchase =>
        new Date(purchase.purchase_date) <= endDateObj
      );
    }

    setFilteredPurchases(filtered);
  };

  // Handlers
  const handleSearch = (event) => {
    const query = event.target.value;
    setSearchQuery(query);
    applyFilters(query, companyFilter, startDate, endDate);
  };

  const handleCompanyFilter = (e) => {
    const companyId = e.target.value;
    setCompanyFilter(companyId);
    applyFilters(searchQuery, companyId, startDate, endDate);
  };

  const handleStartDateChange = (e) => {
    const value = e.target.value;
    setStartDate(value);
    applyFilters(searchQuery, companyFilter, value, endDate);
  };

  const handleEndDateChange = (e) => {
    const value = e.target.value;
    setEndDate(value);
    applyFilters(searchQuery, companyFilter, startDate, value);
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

      <div className="filters-row">
        <div className="search-input">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            placeholder="Search by invoice, supplier, company..."
            onChange={handleSearch}
            value={searchQuery}
          />
        </div>

        <select value={companyFilter} onChange={handleCompanyFilter}>
          <option value="">All Companies</option>
          <option value="1">JH</option>
          <option value="2">RR</option>
        </select>

        <div className="date-range">
          <label>Date Range:</label>
          <input type="date" value={startDate} onChange={handleStartDateChange} />
          <span className="date-separator">→</span>
          <input type="date" value={endDate} onChange={handleEndDateChange} />
        </div>
      </div>

      <div className="table-wrapper">
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Company</th>
              <th>Bill Amount (Rs.)</th>
              <th>Paid (Rs.)</th>
              <th>Due (Rs.)</th>
              <th>Payment Method</th>
              <th>Invoice No.</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases.map(purchase => (
              <tr key={purchase.id}>
                <td>{new Date(purchase.purchase_date).toLocaleDateString('en-GB')}</td>
                <td>{purchase.supplier_name}</td>
                <td>{purchase.company_name}</td>
                <td>{Number(purchase.bill_amount).toFixed(2)}</td>
                <td>{Number(purchase.paid_amount).toFixed(2)}</td>
                <td className="due-amount">
                  {(Number(purchase.bill_amount) - Number(purchase.paid_amount)).toFixed(2)}
                </td>
                <td>{purchase.payment_method}</td>
                <td>{purchase.check_number}</td>
                <td className="text-center actions-column">
                  <Link to={`/purchase/${purchase.id}`} className="btn-secondary">View</Link>
                  <Link to={`/purchase/edit/${purchase.id}`} className="btn-edit">
                    <FontAwesomeIcon icon={faEdit} /> Edit
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
