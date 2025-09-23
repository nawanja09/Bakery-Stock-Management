//client/src/components/FinishedGoods/Reports/TransferReport.jsx

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFilter } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './Reports.css';

const WastageReport = () => {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    reason: 'All',
    wastageType: 'All'
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
      if (filters.reason !== 'All') params.append('reason', filters.reason);
      if (filters.wastageType !== 'All') params.append('wastageType', filters.wastageType);

      const response = await api.get(`/finished-goods-reports/wastage?${params}`);
      setReportData(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch wastage report');
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
      ['Date', 'Wastage #', 'Approved By', 'Reason', 'Type', 'Items Count', 'Total Qty', 'Total Loss (LKR)', 'Remarks'],
      ...reportData.map(item => [
        item.date,
        item.wastage_number,
        item.approved_by,
        item.reason,
        item.wastage_type,
        item.item_count,
        item.total_quantity,
        parseFloat(item.total_loss || 0).toFixed(2),
        item.remarks || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wastage-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) return <div className="loading">Loading wastage report...</div>;

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>Wastage Report</h2>
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
          <label>Reason</label>
          <select
            value={filters.reason}
            onChange={(e) => handleFilterChange('reason', e.target.value)}
          >
            <option value="All">All Reasons</option>
            <option value="Expired">Expired</option>
            <option value="Damaged">Damaged</option>
            <option value="Overproduction">Overproduction</option>
            <option value="Poor Storage">Poor Storage</option>
            <option value="Forecasting errors">Forecasting errors</option>
            <option value="Human error">Human error</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Wastage Type</label>
          <select
            value={filters.wastageType}
            onChange={(e) => handleFilterChange('wastageType', e.target.value)}
          >
            <option value="All">All Types</option>
            <option value="General">General</option>
            <option value="Production">Production</option>
          </select>
        </div>
        <button className="btn-apply-filters" onClick={handleApplyFilters}>
          <FontAwesomeIcon icon={faFilter} /> Apply Filters
        </button>
      </div>

      <div className="report-content">
        {reportData.length === 0 ? (
          <p>No wastage data found</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Wastage #</th>
                <th>Approved By</th>
                <th>Reason</th>
                <th>Type</th>
                <th>Items</th>
                <th>Total Qty</th>
                <th>Total Loss (LKR)</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map(item => (
                <tr key={item.id}>
                  <td>{new Date(item.date).toLocaleDateString()}</td>
                  <td>{item.wastage_number}</td>
                  <td>{item.approved_by}</td>
                  <td>{item.reason}</td>
                  <td>{item.wastage_type}</td>
                  <td>{item.item_count}</td>
                  <td>{item.total_quantity}</td>
                  <td style={{ color: 'red', fontWeight: 'bold' }}>
                    {parseFloat(item.total_loss || 0).toFixed(2)}
                  </td>
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

export default WastageReport;