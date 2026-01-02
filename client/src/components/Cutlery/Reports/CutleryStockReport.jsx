import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './CutleryStockReport.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faCalendarAlt, faSearch, faSync, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

const CutleryStockReport = () => {
  const [stockData, setStockData] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const { showPopup } = usePopup();
  const isMounted = useRef(true);
  const fetchCount = useRef(0);

  const fetchStockReport = useCallback(async (date = reportDate) => {
    // Prevent excessive fetching
    fetchCount.current++;
    if (fetchCount.current > 10) {
      console.warn('Excessive fetching detected, stopping');
      return;
    }

    if (!isMounted.current) return;

    try {
      setLoading(true);
      setError(null);
      console.log('Fetching stock report for date:', date, 'Fetch count:', fetchCount.current);
      
      const response = await api.get('/cutlery-reports/stock-report', {
        params: { report_date: date }
      });

      console.log('Stock report response:', response.data);
      
      if (!isMounted.current) return;

      // Check if response is successful
      if (response.data.success) {
        setStockData(response.data.data || []);
        setLocations(response.data.locations || []);
      } else {
        setError(response.data.error || 'Failed to load stock report');
        showPopup('error', response.data.error || 'Failed to load stock report');
        setStockData([]);
        setLocations([]);
      }
    } catch (err) {
      console.error('Error fetching stock report:', err);
      if (!isMounted.current) return;
      
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load stock report';
      setError(errorMessage);
      showPopup('error', errorMessage);
      setStockData([]);
      setLocations([]);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [reportDate, showPopup]);

  // Initial fetch only
  useEffect(() => {
    isMounted.current = true;
    fetchStockReport(reportDate);
    
    return () => {
      isMounted.current = false;
    };
  }, []); // Empty dependency array - fetch only once on mount

  const fetchDebugInfo = async () => {
    try {
      const response = await api.get('/cutlery-reports/stock-report/debug', {
        params: { report_date: reportDate }
      });
      console.log('Debug info:', response.data);
      showPopup('info', 'Debug info logged to console');
    } catch (err) {
      console.error('Debug error:', err);
    }
  };

  const handleDateChange = (e) => {
    setReportDate(e.target.value);
  };

  const handleGenerateReport = () => {
    fetchCount.current = 0; // Reset fetch counter
    fetchStockReport(reportDate);
  };

  const handleExportToExcel = () => {
    if (stockData.length === 0) {
      showPopup('error', 'No data to export');
      return;
    }

    try {
      // Prepare data for export
      const exportData = stockData.map(item => {
        const row = {
          'Item Code': item.item_code || '',
          'Item Name': item.item_name || '',
          'Description': item.description || '',
        };
        
        // Add each location as a column
        locations.forEach(location => {
          row[location] = item.locations?.[location] || 0;
        });
        
        // Add total
        const total = locations.reduce((sum, location) => sum + (item.locations?.[location] || 0), 0);
        row['Total'] = total;
        
        return row;
      });

      // Create CSV content
      const headers = ['Item Code', 'Item Name', 'Description', ...locations, 'Total'];
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
          }).join(',')
        )
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `cutlery_stock_report_${reportDate}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showPopup('success', 'Report exported successfully');
    } catch (err) {
      console.error('Export error:', err);
      showPopup('error', 'Failed to export report');
    }
  };

  // Filter data based on search term
  const filteredData = stockData.filter(item =>
    (item.item_code && item.item_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.item_name && item.item_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Calculate totals for each location
  const locationTotals = locations.reduce((acc, location) => {
    acc[location] = filteredData.reduce((sum, item) => sum + (item.locations?.[location] || 0), 0);
    return acc;
  }, {});

  // Calculate grand total
  const grandTotal = Object.values(locationTotals).reduce((sum, total) => sum + total, 0);

  if (loading && stockData.length === 0) {
    return (
      <div className="cutlery-stock-report-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading stock report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cutlery-stock-report-container">
      <header className="report-header">
        <div>
          <h1>Cutlery Stock Report</h1>
          <p>As of {new Date(reportDate).toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</p>
          {error && (
            <div className="error-banner">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span>{error}</span>
            </div>
          )}
        </div>
        
        <div className="header-actions">
          <button 
            className="btn-secondary"
            onClick={fetchDebugInfo}
            title="Debug Info"
          >
            <FontAwesomeIcon icon={faExclamationTriangle} /> Debug
          </button>
          <button 
            className="btn-export"
            onClick={handleExportToExcel}
            disabled={stockData.length === 0}
          >
            <FontAwesomeIcon icon={faDownload} /> Export to Excel
          </button>
        </div>
      </header>

      <div className="filters-container">
        <div className="filter-group">
          <label htmlFor="reportDate">
            <FontAwesomeIcon icon={faCalendarAlt} /> Report Date
          </label>
          <input
            type="date"
            id="reportDate"
            value={reportDate}
            onChange={handleDateChange}
            max={new Date().toISOString().split('T')[0]}
          />
          <button 
            className="btn-generate"
            onClick={handleGenerateReport}
            disabled={loading}
          >
            {loading ? (
              <>
                <FontAwesomeIcon icon={faSync} spin /> Generating...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSync} /> Generate Report
              </>
            )}
          </button>
        </div>

        <div className="filter-group">
          <label htmlFor="search">
            <FontAwesomeIcon icon={faSearch} /> Search Items
          </label>
          <input
            type="text"
            id="search"
            placeholder="Search by item code, name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {error ? (
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Unable to Load Stock Report</h3>
          <p>{error}</p>
          <button 
            className="btn-generate"
            onClick={handleGenerateReport}
            disabled={loading}
          >
            <FontAwesomeIcon icon={faSync} /> Try Again
          </button>
        </div>
      ) : stockData.length === 0 ? (
        <div className="no-data">
          <div className="no-data-icon">📊</div>
          <h3>No Stock Data Found</h3>
          <p>No stock data found for the selected date.</p>
          <p>Try selecting a different date or check if there are any transactions.</p>
          <button 
            className="btn-generate"
            onClick={handleGenerateReport}
            disabled={loading}
          >
            <FontAwesomeIcon icon={faSync} /> Refresh
          </button>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="stock-report-table">
              <thead>
                <tr>
                  <th rowSpan="2">#</th>
                  <th rowSpan="2">Item Name</th>
                  <th colSpan={locations.length}>Locations</th>
                </tr>
                <tr>
                  {locations.map((location, index) => (
                    <th key={index} className="location-header">
                      {location}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => {
                  const itemTotal = locations.reduce((sum, location) => sum + (item.locations?.[location] || 0), 0);
                  return (
                    <tr key={item.item_id || index} className="data-row">
                      <td className="serial">{index + 1}</td>
                      <td className="item-name">{item.item_name || 'N/A'}</td>                      
                      {locations.map((location, locIndex) => (
                        <td 
                          key={locIndex} 
                          className="stock-quantity"
                          data-location={location}
                        >
                          {item.locations?.[location] || 0}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="report-summary">
            <div className="summary-item">
              <span className="summary-label">Total Items:</span>
              <span className="summary-value">{filteredData.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total Locations:</span>
              <span className="summary-value">{locations.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Grand Total Items:</span>
              <span className="summary-value">{grandTotal}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Report Generated:</span>
              <span className="summary-value">{new Date().toLocaleString()}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CutleryStockReport;