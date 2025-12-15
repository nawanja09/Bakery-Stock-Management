import React, { useState, useEffect } from 'react';
import { usePopup } from '../../context/PopupContext';
import api from '../../../api';
import './CutleryStockReport.css';

const CutleryStockReport = () => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    if (!filters.start_date || !filters.end_date) {
      showPopup('error', 'Please select both start and end dates');
      return;
    }

    try {
      setLoading(true);
      const response = await api.get('/cutlery-reports/inventory', {
        params: filters
      });
      
      setReportData(response.data);
      
    } catch (err) {
      console.error('Error fetching inventory report:', err);
      showPopup('error', err.response?.data?.error || 'Failed to load inventory report');
    } finally {
      setLoading(false);
    }
  };

  // Safely convert any value to a number
  const safeNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : num;
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchReport();
  };

  const handleExport = () => {
    if (!reportData) return;
    
    // Create CSV content
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Headers
    const headers = [
      'Item ID',
      'Item Name',
      'Opening Balance',
      'Purchase (+)',
      ...(reportData.locations?.map(loc => `${loc.name} (In)`)),
      ...(reportData.locations?.map(loc => `${loc.name} (Out)`)),
      'Total Transfer In',
      'Total Transfer Out',
      'Damage (-)',
      'Closing Balance'
    ];
    csvContent += headers.join(',') + '\n';
    
    // Data rows
    reportData.data.forEach(item => {
      const row = [
        item.item_id,
        `"${item.item_name}"`,
        safeNumber(item.opening_balance),
        safeNumber(item.purchase),
        ...reportData.locations?.map(loc => safeNumber(item.transfers[loc.id]?.transfer_in || 0)),
        ...reportData.locations?.map(loc => safeNumber(item.transfers[loc.id]?.transfer_out || 0)),
        safeNumber(item.transfer_in_total),
        safeNumber(item.transfer_out_total),
        safeNumber(item.damage),
        safeNumber(item.closing_balance)
      ];
      csvContent += row.join(',') + '\n';
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `cutlery-inventory-report_${filters.start_date}_to_${filters.end_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Safe format number function - FIXED to remove trailing zeros
  const formatNumber = (num) => {
    const safeNum = safeNumber(num);
    // Return integer without decimal if it's a whole number
    return Number.isInteger(safeNum) ? safeNum.toString() : safeNum.toFixed(2).replace(/\.?0+$/, '');
  };

  // Calculate totals for display
  const calculateTotals = () => {
    if (!reportData) return {};
    
    return {
      opening: reportData.data.reduce((sum, item) => sum + safeNumber(item.opening_balance), 0),
      purchase: reportData.data.reduce((sum, item) => sum + safeNumber(item.purchase), 0),
      damage: reportData.data.reduce((sum, item) => sum + safeNumber(item.damage), 0),
      closing: reportData.data.reduce((sum, item) => sum + safeNumber(item.closing_balance), 0),
      transferIn: reportData.data.reduce((sum, item) => sum + safeNumber(item.transfer_in_total), 0),
      transferOut: reportData.data.reduce((sum, item) => sum + safeNumber(item.transfer_out_total), 0),
    };
  };

  // Render function
  // ... (keep your existing render function, but update the validation message)

  if (loading) {
    return <div className="loading">Loading inventory report...</div>;
  }

  const totals = calculateTotals();

  return (
    <div className="cutlery-stock-report-container">
      <div className="report-header">
        <h2>Cutlery Inventory Report</h2>
        <div className="report-actions">
          <button 
            className="btn-export"
            onClick={handleExport}
            disabled={!reportData}
          >
            Export to CSV
          </button>
        </div>
      </div>

      <div className="filter-section">
        <form onSubmit={handleSubmit} className="filter-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="start_date">Start Date *</label>
              <input
                type="date"
                id="start_date"
                name="start_date"
                value={filters.start_date}
                onChange={handleFilterChange}
                required
                max={filters.end_date}
              />
            </div>

            <div className="form-group">
              <label htmlFor="end_date">End Date *</label>
              <input
                type="date"
                id="end_date"
                name="end_date"
                value={filters.end_date}
                onChange={handleFilterChange}
                required
                min={filters.start_date}
              />
            </div>

            <div className="form-group">
              <label>&nbsp;</label>
              <button type="submit" className="btn-generate">
                Generate Report
              </button>
            </div>
          </div>
        </form>
      </div>

      {reportData && (
        <div className="report-content">
          <div className="report-info">
            <div className="info-row">
              <span className="info-label">Report Period:</span>
              <span className="info-value">
                {new Date(reportData.start_date).toLocaleDateString()} 
                {' to '}
                {new Date(reportData.end_date).toLocaleDateString()}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Total Items:</span>
              <span className="info-value">{reportData.data.length}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Opening Balance Total:</span>
              <span className="info-value">{formatNumber(totals.opening)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Closing Balance Total:</span>
              <span className="info-value">{formatNumber(totals.closing)}</span>
            </div>
          </div>

          <div className="table-container">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th rowSpan="2">Item ID</th>
                  <th rowSpan="2">Item Name</th>
                  <th rowSpan="2">Opening Balance</th>
                  <th rowSpan="2">Purchase (+)</th>
                  
                  {/* Transfer In headers */}
                  {reportData.locations && reportData.locations.length > 0 && (
                    <th colSpan={reportData.locations.length}>
                      Transfer In (+)
                    </th>
                  )}
                  
                  {/* Transfer Out headers */}
                  {reportData.locations && reportData.locations.length > 0 && (
                    <th colSpan={reportData.locations.length}>
                      Transfer Out (-)
                    </th>
                  )}
                  
                  <th rowSpan="2">Total Transfer In</th>
                  <th rowSpan="2">Total Transfer Out</th>
                  <th rowSpan="2">Damage (-)</th>
                  <th rowSpan="2">Closing Balance</th>
                </tr>
                
                <tr>
                  {/* Location names for Transfer In */}
                  {reportData.locations?.map(location => (
                    <th key={`in-${location.id}`}>{location.name}</th>
                  ))}
                  
                  {/* Location names for Transfer Out */}
                  {reportData.locations?.map(location => (
                    <th key={`out-${location.id}`}>{location.name}</th>
                  ))}
                </tr>
              </thead>
              
              <tbody>
                {reportData.data.length === 0 ? (
                  <tr>
                    <td colSpan={
                      10 + (reportData.locations?.length * 2 || 0)
                    } className="no-data">
                      No data available for the selected period
                    </td>
                  </tr>
                ) : (
                  reportData.data.map((item, index) => (
                    <tr key={index}>
                      <td className="item-id">{item.item_id || 'N/A'}</td>
                      <td className="item-name">{item.item_name || 'N/A'}</td>
                      <td className="opening-balance">{formatNumber(item.opening_balance)}</td>
                      <td className="purchase positive">{formatNumber(item.purchase)}</td>
                      
                      {/* Transfer In values (+) */}
                      {reportData.locations?.map(location => (
                        <td key={`in-val-${location.id}`} className="transfer-in positive">
                          {formatNumber(item.transfers[location.id]?.transfer_in || 0)}
                        </td>
                      ))}
                      
                      {/* Transfer Out values (-) */}
                      {reportData.locations?.map(location => (
                        <td key={`out-val-${location.id}`} className="transfer-out negative">
                          {formatNumber(item.transfers[location.id]?.transfer_out || 0)}
                        </td>
                      ))}
                      
                      <td className="total-transfer-in positive">{formatNumber(item.transfer_in_total)}</td>
                      <td className="total-transfer-out negative">{formatNumber(item.transfer_out_total)}</td>
                      <td className="damage negative">{formatNumber(item.damage)}</td>
                      <td className="closing-balance">{formatNumber(item.closing_balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              
              <tfoot>
                <tr>
                  <th colSpan="3">Total</th>
                  <th className="positive">
                    {formatNumber(totals.purchase)}
                  </th>
                  
                  {/* Transfer In totals */}
                  {reportData.locations?.map(location => (
                    <th key={`total-in-${location.id}`} className="positive">
                      {formatNumber(
                        reportData.data.reduce((sum, item) => 
                          sum + safeNumber(item.transfers[location.id]?.transfer_in || 0), 0
                        )
                      )}
                    </th>
                  ))}
                  
                  {/* Transfer Out totals */}
                  {reportData.locations?.map(location => (
                    <th key={`total-out-${location.id}`} className="negative">
                      {formatNumber(
                        reportData.data.reduce((sum, item) => 
                          sum + safeNumber(item.transfers[location.id]?.transfer_out || 0), 0
                        )
                      )}
                    </th>
                  ))}
                  
                  <th className="positive">
                    {formatNumber(totals.transferIn)}
                  </th>
                  <th className="negative">
                    {formatNumber(totals.transferOut)}
                  </th>
                  <th className="negative">
                    {formatNumber(totals.damage)}
                  </th>
                  <th>
                    {formatNumber(totals.closing)}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* Validation message */}
          <div className="validation-message">
            <p>
              <strong>Formula Validation:</strong><br />
              Opening Balance + Purchase + Total Transfer In - Total Transfer Out - Damage = Closing Balance
            </p>
            <p>
              {formatNumber(totals.opening)} + {formatNumber(totals.purchase)} + 
              {formatNumber(totals.transferIn)} - {formatNumber(totals.transferOut)} - 
              {formatNumber(totals.damage)} = {formatNumber(
                totals.opening + totals.purchase + totals.transferIn - totals.transferOut - totals.damage
              )}
            </p>
            <p className={Math.abs((totals.opening + totals.purchase + totals.transferIn - totals.transferOut - totals.damage) - totals.closing) < 0.01 ? 'valid' : 'invalid'}>
              {Math.abs((totals.opening + totals.purchase + totals.transferIn - totals.transferOut - totals.damage) - totals.closing) < 0.01 
                ? '✓ Calculation is correct' 
                : `✗ Calculation mismatch: Expected ${formatNumber(totals.opening + totals.purchase + totals.transferIn - totals.transferOut - totals.damage)} but got ${formatNumber(totals.closing)}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CutleryStockReport;