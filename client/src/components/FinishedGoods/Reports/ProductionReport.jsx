//client/src/components/FinishedGoods/Reports/ProductionReport.jsx

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFilter } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './Reports.css';

const ProductionReport = () => {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    category: 'All'
  });
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.category !== 'All') params.append('category', filters.category);

      const response = await api.get(`/finished-goods-reports/production?${params}`);
      setReportData(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch production report');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyFilters = () => {
    fetchReport();
  };

  const handleExport = () => {
    const csvContent = [
      ['Production Date', 'Prepared By', 'Status', 'Items Count', 'Total Quantity', 'Categories', 'Remarks'],
      ...reportData.map(item => [
        item.production_date,
        item.prepared_by,
        item.status,
        item.item_count,
        item.total_quantity,
        item.categories,
        item.remarks || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `production-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) return <div className="loading">Loading production report...</div>;

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>Production Report</h2>
        <div className="report-actions">
          <button className="btn-export" onClick={handleExport}>
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
        </div>
      </div>

      <div className="report-filters">
        <div className="filter-group">
          <label>Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Category</label>
          <select
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
          >
            <option value="All">All Categories</option>
            <option value="Cake">Cake</option>
            <option value="Bakery">Bakery</option>
            <option value="Pastry">Pastry</option>
            <option value="Chinese">Chinese</option>
            <option value="Savory">Savory</option>
            <option value="Beverage">Beverage</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <button className="btn-apply-filters" onClick={handleApplyFilters}>
          <FontAwesomeIcon icon={faFilter} /> Apply Filters
        </button>
      </div>

      <div className="report-content">
        {reportData.length === 0 ? (
          <p>No production data found</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Production Date</th>
                <th>Prepared By</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total Qty</th>
                <th>Categories</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map(item => (
                <tr key={item.id}>
                  <td>{new Date(item.production_date).toLocaleDateString()}</td>
                  <td>{item.prepared_by}</td>
                  <td>
                    <span className={`status-badge status-${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.item_count}</td>
                  <td>{item.total_quantity}</td>
                  <td>{item.categories}</td>
                  <td>{item.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ProductionReport;