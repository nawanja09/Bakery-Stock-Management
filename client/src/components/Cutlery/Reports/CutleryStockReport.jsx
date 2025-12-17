import React, { useState, useEffect, useCallback } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './CutleryStockReport.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faCalendarAlt, faSearch, faSync } from '@fortawesome/free-solid-svg-icons';

const CutleryStockReport = () => {
  const [stockData, setStockData] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const { showPopup } = usePopup();

  const fetchStockReport = useCallback(async (date = reportDate) => {
    try {
      setLoading(true);
      const response = await api.get('/cutlery-reports/stock-report', {
        params: { report_date: date }
      });

      setStockData(response.data.data);
      setLocations(response.data.locations);
    } catch (err) {
      console.error('Error fetching stock report:', err);
      showPopup('error', 'Failed to load stock report');
    } finally {
      setLoading(false);
    }
  }, [reportDate, showPopup]);

  useEffect(() => {
    fetchStockReport();
  }, [fetchStockReport]);

  const handleDateChange = (e) => {
    setReportDate(e.target.value);
  };

  const handleGenerateReport = () => {
    fetchStockReport(reportDate);
  };

  const handleExportToExcel = () => {
    // Prepare data for export
    const exportData = stockData.map(item => {
      const row = {
        'Item Code': item.item_code,
        'Item Name': item.item_name,
        'Description': item.description || '',
      };
      
      // Add each location as a column
      locations.forEach(location => {
        row[location] = item.locations[location] || 0;
      });
      
      return row;
    });

    // Create CSV content
    const headers = ['Item Code', 'Item Name', 'Description', ...locations];
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => 
        headers.map(header => `"${row[header] || 0}"`).join(',')
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
  };

  // Filter data based on search term
  const filteredData = stockData.filter(item =>
    item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading stock report...</p>
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
        </div>
        
        <div className="header-actions">
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
          >
            <FontAwesomeIcon icon={faSync} /> Generate Report
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

      {stockData.length === 0 ? (
        <div className="no-data">
          <div className="no-data-icon">📊</div>
          <p>No stock data found for the selected date.</p>
          <p>Try selecting a different date or check your data.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="stock-report-table">
            <thead>
              <tr>
                <th rowSpan="2">#</th>
                <th rowSpan="2">Item Code</th>
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
              {filteredData.map((item, index) => (
                <tr key={item.item_id} className="data-row">
                  <td className="serial">{index + 1}</td>
                  <td className="item-code">
                    <strong>{item.item_code}</strong>
                  </td>
                  <td className="item-name">{item.item_name}</td>
                  
                  {locations.map((location, locIndex) => (
                    <td 
                      key={locIndex} 
                      className="stock-quantity"
                      data-location={location}
                    >
                      {item.locations[location] || 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="total-label">
                  <strong>TOTAL</strong>
                </td>
                {locations.map((location, index) => {
                  const total = filteredData.reduce((sum, item) => 
                    sum + (item.locations[location] || 0), 0
                  );
                  return (
                    <td key={index} className="total-amount">
                      <strong>{total}</strong>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

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
          <span className="summary-label">Report Generated:</span>
          <span className="summary-value">{new Date().toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default CutleryStockReport;