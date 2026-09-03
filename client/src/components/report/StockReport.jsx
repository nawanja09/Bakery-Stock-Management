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
  faSync
} from '@fortawesome/free-solid-svg-icons';
import './StockReport.css';
import api from '../../api';
import { formatCurrency, formatNumber } from '../../utils/formatters';

const StockReport = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [itemPrices, setItemPrices] = useState({});

  const fetchStockReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/stock`, { params: { date: selectedDate } });
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
      formatCurrency(calculateValue(item))
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
      'Value (Rs.)'
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
      'Value (Rs.)': Number(calculateValue(item))
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Report');
    XLSX.writeFile(workbook, `stock-report-${selectedDate}.xlsx`);
  };

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>Daily Stock Report</h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>View current stock balances and valuations</p>
        </div>
      </header>

      <div className="filters-section">
        <div className="report-filter-group">
          <label className="report-filter-label">
            <FontAwesomeIcon icon={faCalendar} /> Report Date
          </label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
            className="report-filter-input"
          />
        </div>

        <div className="report-filter-actions">
            <button 
              onClick={fetchStockReport}
              disabled={loading}
              className="btn btn-primary"
            >
              <FontAwesomeIcon icon={faSync} className={loading ? 'fa-spin' : ''} />
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            
            {stockData.length > 0 && (
                <button onClick={downloadExcel} className="btn btn-success">
                  <FontAwesomeIcon icon={faFileExcel} /> Excel
                </button>
            )}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">Loading stock data...</div>
      ) : stockData.length > 0 ? (
        <>
          <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
            <div style={{ overflowX: 'auto' }}>
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
                </tr>
              </thead>
              <tbody>
                {stockData.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="badge badge-neutral">{item.item_code}</span>
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
                    <td className="report-table-value-numeric">
                      {formatNumber(item.closing_balance, 2, 2)}
                    </td>
                    <td className="report-table-value-numeric text-primary">
                      {formatCurrency(calculateValue(item))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="11" style={{ fontWeight: 'bold' }}>Total Value (Rs.)</td>
                  <td colSpan="2" style={{ fontWeight: 'bold', color: '#2e7d32' }}>
                    {formatCurrency(calculateTotal())}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>Select a date and generate the report to view stock data.</p>
        </div>
      )}
    </div>
  );
};

export default StockReport;
