//client/src/components/FinishedGoods/Reports/TransferReport.jsx

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFilter } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './Reports.css';

const TransferReport = () => {
  const [reportData, setReportData] = useState([]);
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    destinationId: 'All'
  });
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchDestinations();
    fetchReport();
  }, []);

  const fetchDestinations = async () => {
    try {
      const response = await api.get('/finished-goods-transfers/destinations');
      setDestinations(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch destinations');
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.destinationId !== 'All') params.append('destinationId', filters.destinationId);

      const response = await api.get(`/finished-goods-reports/transfer?${params}`);
      setReportData(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch transfer report');
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
      ['Transfer Date', 'Transfer #', 'Transferred By', 'Destination', 'Status', 'Items Count', 'Total Qty', 'Remarks'],
      ...reportData.map(item => [
        item.transfer_date,
        item.transfer_number,
        item.transferred_by,
        item.destination_name,
        item.status,
        item.item_count,
        item.total_quantity,
        item.remarks || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transfer-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) return <div className="loading">Loading transfer report...</div>;

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>Transfer Report</h2>
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
          <label>Destination</label>
          <select
            value={filters.destinationId}
            onChange={(e) => handleFilterChange('destinationId', e.target.value)}
          >
            <option value="All">All Destinations</option>
            {destinations.map(dest => (
              <option key={dest.id} value={dest.id}>{dest.name}</option>
            ))}
          </select>
        </div>
        <button className="btn-apply-filters" onClick={handleApplyFilters}>
          <FontAwesomeIcon icon={faFilter} /> Apply Filters
        </button>
      </div>

      <div className="report-content">
        {reportData.length === 0 ? (
          <p>No transfer data found</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Transfer Date</th>
                <th>Transfer #</th>
                <th>Transferred By</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total Qty</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map(item => (
                <tr key={item.id}>
                  <td>{new Date(item.transfer_date).toLocaleDateString()}</td>
                  <td>{item.transfer_number}</td>
                  <td>{item.transferred_by}</td>
                  <td>{item.destination_name}</td>
                  <td>
                    <span className={`status-badge status-${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.item_count}</td>
                  <td>{item.total_quantity}</td>
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

export default TransferReport;