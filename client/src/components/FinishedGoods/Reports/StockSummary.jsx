import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFilter, faBox } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import './StockSummary.css';

const StockReport = () => {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    location: 'Supervisor stock'
  });

  const { showPopup } = usePopup();

  const locations = [
    'Supervisor stock',
    'Cafe',
    'MAS Ayathi',
    'MAS Brew Bar',
    'MAS Kreedy'
  ];

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (filters.date) params.append('date', filters.date);
      if (filters.location) params.append('location', filters.location);

      const response = await api.get(`/finished-goods-reports/stock?${params}`);
      setReportData(response.data);
    } catch (error) {
      showPopup('error', 'Failed to fetch stock report');
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
      ['Item Code', 'Item Name', 'Opening Balance', 'Production', 'Transfer', 'Wastage', 'Closing Balance'],
      ...reportData.map(item => [
        item.item_code,
        item.item_name,
        item.opening_balance,
        item.production,
        item.transfer,
        item.wastage,
        item.closing_balance
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-report-${filters.location}-${filters.date}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const calculateTotals = () => {
    return {
      opening_balance: reportData.reduce((sum, item) => sum + item.opening_balance, 0),
      production: reportData.reduce((sum, item) => sum + item.production, 0),
      transfer: reportData.reduce((sum, item) => sum + item.transfer, 0),
      wastage: reportData.reduce((sum, item) => sum + item.wastage, 0),
      closing_balance: reportData.reduce((sum, item) => sum + item.closing_balance, 0)
    };
  };

  const totals = calculateTotals();

  const isFutureDate = () => {
    const today = new Date().toISOString().split('T')[0];
    return filters.date > today;
  };

  return (
    <div className="stock-report-container">
      <div className="report-header">
        <h2>
          <FontAwesomeIcon icon={faBox} style={{ marginRight: '0.5rem' }} />
          Finished Goods Stock Report
        </h2>
        <div className="report-actions">
          <button className="btn-export" onClick={handleExport}>
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
        </div>
      </div>

      <div className="report-filters">
        <div className="filter-group">
          <label>Date</label>
          <input
            type="date"
            value={filters.date}
            onChange={(e) => handleFilterChange('date', e.target.value)}
          />
        </div>
        
        <div className="filter-group">
          <label>Location</label>
          <select
            value={filters.location}
            onChange={(e) => handleFilterChange('location', e.target.value)}
          >
            {locations.map(location => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
        
        <button className="btn-apply-filters" onClick={handleApplyFilters}>
          <FontAwesomeIcon icon={faFilter} /> Apply Filters
        </button>
      </div>

      <div className="location-info">
        <h3>Current Location: {filters.location}</h3>
        <p>Date: {new Date(filters.date).toLocaleDateString()}</p>
        {isFutureDate() && (
          <div className="future-date-warning">
            <strong>Note:</strong> Future date selected. All values are set to 0.
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading stock report...</div>
      ) : reportData.length === 0 ? (
        <div className="empty-state">
          <FontAwesomeIcon icon={faBox} size="2x" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <div>No stock data found</div>
          <p style={{ color: 'var(--text-muted)' }}>
            No stock movements found for the selected date and location
          </p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="stock-report-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Opening Balance</th>
                  <th>Production</th>
                  <th>
                    {filters.location === 'Supervisor stock' ? 'Transfer Out (-)' : 'Transfer In (+)'}
                  </th>
                  <th>Wastage (-)</th>
                  <th>Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        {item.item_code}
                      </div>
                    </td>
                    <td>{item.item_name}</td>
                    <td className="number-cell">{item.opening_balance}</td>
                    <td className="number-cell">
                      {item.production > 0 ? `+${item.production}` : item.production}
                    </td>
                    <td className="number-cell">
                      {filters.location === 'Supervisor stock' ? 
                        (item.transfer > 0 ? `-${item.transfer}` : item.transfer) :
                        (item.transfer > 0 ? `+${item.transfer}` : item.transfer)
                      }
                    </td>
                    <td className="number-cell wastage-cell">
                      {item.wastage > 0 ? `-${item.wastage}` : item.wastage}
                    </td>
                    <td className="number-cell closing-balance">
                      {item.closing_balance}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td colSpan="2"><strong>Totals</strong></td>
                  <td className="number-cell"><strong>{totals.opening_balance}</strong></td>
                  <td className="number-cell">
                    <strong>{totals.production > 0 ? `+${totals.production}` : totals.production}</strong>
                  </td>
                  <td className="number-cell">
                    <strong>
                      {filters.location === 'Supervisor stock' ? 
                        (totals.transfer > 0 ? `-${totals.transfer}` : totals.transfer) :
                        (totals.transfer > 0 ? `+${totals.transfer}` : totals.transfer)
                      }
                    </strong>
                  </td>
                  <td className="number-cell wastage-cell">
                    <strong>{totals.wastage > 0 ? `-${totals.wastage}` : totals.wastage}</strong>
                  </td>
                  <td className="number-cell closing-balance">
                    <strong>{totals.closing_balance}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="report-summary">
            <div className="summary-item">
              <span>Total Items:</span>
              <strong>{reportData.length}</strong>
            </div>
            <div className="summary-item">
              <span>Total Closing Balance:</span>
              <strong>{totals.closing_balance} units</strong>
            </div>
            {isFutureDate() && (
              <div className="summary-item future-note">
                <span>Note:</span>
                <strong>Future date - All values are projected as 0</strong>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default StockReport;