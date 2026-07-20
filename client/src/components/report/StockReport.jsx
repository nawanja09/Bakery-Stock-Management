// src/components/report/StockReport.jsx
import React, { useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDownload, 
  faFileExcel, 
  faCalendar, 
  faFilter,
  faSync,
  faCircle
} from '@fortawesome/free-solid-svg-icons';
import './StockReport.css';
import api from '../../api';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const StockReport = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [itemPrices, setItemPrices] = useState({});
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'inactive'

  const fetchStockReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/stock`, {
        params: { 
          date: selectedDate,
          status: statusFilter 
        }
      });
      const stockData = response.data;
      setStockData(stockData);

      // Fetch latest unit prices for all items
      await fetchLatestUnitPrices(stockData);
    } catch (error) {
      console.error('Error fetching stock report:', error.message);
      alert('Failed to fetch stock report');
    } finally {
      setLoading(false);
    }
  };

  const fetchLatestUnitPrices = async (stockData) => {
    try {
      const pricePromises = stockData.map(async (item) => {
        try {
          const response = await api.get(`/reports/latest-price?itemId=${item.id}&date=${selectedDate}`);
          return {
            itemId: item.id,
            unitPrice: response.data.unitPrice || 0
          };
        } catch (error) {
          console.error(`Error fetching price for item ${item.id}:`, error);
          return {
            itemId: item.id,
            unitPrice: 0
          };
        }
      });

      const prices = await Promise.all(pricePromises);
      const priceMap = {};
      prices.forEach(price => {
        priceMap[price.itemId] = price.unitPrice;
      });
      setItemPrices(priceMap);
    } catch (error) {
      console.error('Error fetching latest unit prices:', error);
    }
  };

  const calculateValue = (item) => {
    if (!item) return '0.00';
    const closingBalance = Number(item.closing_balance) || 0;
    const unitPrice = itemPrices[item.id] || item.unit_price || 0;
    return closingBalance * unitPrice;
  };

  const calculateTotal = () => {
    const total = stockData.reduce((acc, item) => {
      return acc + Number(calculateValue(item));
    }, 0);
    return total;
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const dateStr = new Date(selectedDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    doc.setFontSize(16);
    doc.text(`Stock Report - ${dateStr}`, 15, 15);
    
    const statusLabel = statusFilter === 'all' ? 'All Statuses' : statusFilter === 'active' ? 'Active Only' : 'Inactive Only';
    doc.setFontSize(10);
    doc.text(`Filter: ${statusLabel}`, 15, 22);
    
    const tableData = stockData.map(item => [
      item.item_code,
      item.item_name,
      item.unit,
      formatNumber(item.opening_balance, 2, 2),
      formatNumber(item.total_purchased, 2, 2),
      formatNumber(item.total_issued, 2, 2),
      formatNumber(item.total_wasted, 2, 2),
      formatNumber(item.total_returned, 2, 2),
      formatNumber(item.total_purchase_returned || 0, 2, 2),
      formatNumber(item.total_adjusted || 0, 2, 2),
      formatNumber(item.closing_balance, 2, 2),
      formatCurrency(calculateValue(item)),
      item.status === 1 ? 'Active' : 'Inactive'
    ]);
    
    const headers = [
      'Item Code',
      'Item Name',
      'Unit',
      'Opening',
      'Purchase',
      'Issue',
      'Wastage',
      'Dept Return',
      'Purchase Return',
      'Stock Adjustments',
      'Closing',
      'Value (Rs.)',
      'Status'
    ];
    
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 160, 133] }
    });
    
    doc.save(`stock-report-${selectedDate}.pdf`);
  };

  const downloadExcel = () => {
    const worksheetData = stockData.map(item => ({
      'Item Code': item.item_code,
      'Item Name': item.item_name,
      'Unit': item.unit,
      'Opening Balance': Number(item.opening_balance),
      'Purchase': Number(item.total_purchased),
      'Issue': Number(item.total_issued),
      'Wastage': Number(item.total_wasted),
      'Dept Return': Number(item.total_returned),
      'Purchase Return': Number(item.total_purchase_returned || 0),
      'Stock Adjustments': Number(item.total_adjusted || 0),
      'Closing Balance': Number(item.closing_balance),
      'Value (Rs.)': Number(calculateValue(item)),
      'Status': item.status === 1 ? 'Active' : 'Inactive'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Report');
    XLSX.writeFile(workbook, `stock-report-${selectedDate}.xlsx`);
  };

  // Get status badge class
  const getStatusBadge = (status) => {
    return status === 1 ? 'status-badge active' : 'status-badge inactive';
  };

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>Daily Stock Report</h2>
      </div>

      <div className="controls-row">
        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faCalendar} /> Report Date
          </label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="date-input"
          />
        </div>

        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faFilter} /> Item Status
          </label>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        <div className="form-group action-buttons-container">
          <label style={{ opacity: 0 }}>Actions</label>
          <div className="action-buttons-row">
            <button 
              onClick={fetchStockReport}
              disabled={loading}
              className="btn btn-generate"
            >
              <FontAwesomeIcon icon={faSync} className={loading ? 'spin' : ''} />
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            
            {stockData.length > 0 && (
                <button onClick={downloadExcel} className="btn btn-excel">
                  <FontAwesomeIcon icon={faFileExcel} /> Excel
                </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading stock data...</div>
      ) : stockData.length > 0 ? (
        <>
          <div className="table-container">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Opening</th>
                  <th>Purchase</th>
                  <th>Issue</th>
                  <th>Wastage</th>
                  <th>Dept Return</th>
                  <th>Purchase Return</th>
                  <th>Stock Adjustments</th>
                  <th>Closing</th>
                  <th>Value (Rs.)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stockData.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="item-code-badge">{item.item_code}</span>
                    </td>
                    <td>{item.item_name}</td>
                    <td>{item.unit}</td>
                    <td>{formatNumber(item.opening_balance, 2, 2)}</td>
                    <td>{formatNumber(item.total_purchased, 2, 2)}</td>
                    <td>{formatNumber(item.total_issued, 2, 2)}</td>
                    <td>{formatNumber(item.total_wasted, 2, 2)}</td>
                    <td>{formatNumber(item.total_returned, 2, 2)}</td>
                    <td>{formatNumber(item.total_purchase_returned || 0, 2, 2)}</td>
                    <td>{formatNumber(item.total_adjusted || 0, 2, 2)}</td>
                    <td style={{ fontWeight: '600' }}>
                      {formatNumber(item.closing_balance, 2, 2)}
                    </td>
                    <td style={{ fontWeight: 'bold', color: '#2e7d32' }}>
                      {formatCurrency(calculateValue(item))}
                    </td>
                    <td>
                      <span className={getStatusBadge(item.status)}>
                        <FontAwesomeIcon 
                          icon={faCircle} 
                          style={{ 
                            fontSize: '0.6rem', 
                            marginRight: '4px',
                            color: item.status === 1 ? '#28a745' : '#dc3545'
                          }} 
                        />
                        {item.status === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="11" style={{ fontWeight: 'bold' }}>Total Value (Rs.)</td>
                  <td style={{ fontWeight: 'bold', color: '#2e7d32' }}>
                    {formatCurrency(calculateTotal())}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <p>Select a date and generate the report to view stock data.</p>
          <p style={{ fontSize: '0.9em', color: '#6c757d' }}>
            {statusFilter !== 'all' && 'Note: Filtering by status may show fewer results.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default StockReport;