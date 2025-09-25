import React, { useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileExcel, faCalendar } from '@fortawesome/free-solid-svg-icons';
import './StockReport.css';
import api from '../../api';

const StockReport = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchStockReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/reports/stock?date=${selectedDate}`);
      setStockData(response.data);
    } catch (error) {
      console.error('Error fetching stock report:', error.message);
      alert('Failed to fetch stock report');
    } finally {
      setLoading(false);
    }
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
      Number(item.opening_balance).toFixed(2),
      Number(item.total_purchased).toFixed(2),
      Number(item.total_issued).toFixed(2),
      Number(item.total_wasted).toFixed(2),
      Number(item.closing_balance).toFixed(2)
    ]);
    
    const headers = [
      'Item Code',
      'Item Name',
      'Unit',
      'Opening',
      'Purchased',
      'Issued',
      'Wasted',
      'Closing'
    ];
    
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 25,
      styles: { fontSize: 9 },
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
      'Purchased': Number(item.total_purchased),
      'Issued': Number(item.total_issued),
      'Wasted': Number(item.total_wasted),
      'Closing Balance': Number(item.closing_balance)
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Report');
    XLSX.writeFile(workbook, `stock-report-${selectedDate}.xlsx`);
  };

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>Daily Stock Report</h2>
        <p className="report-subtitle">View opening and closing balances for all items</p>
      </div>

      <div className="controls-grid">
        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faCalendar} /> Report Date
          </label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
          />
        </div>
      </div>

      <div className="action-buttons">
        <button 
          onClick={fetchStockReport}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
        
        {stockData.length > 0 && (
          <>
            <button onClick={downloadPDF} className="btn btn-secondary">
              <FontAwesomeIcon icon={faDownload} /> PDF
            </button>
            <button onClick={downloadExcel} className="btn btn-secondary">
              <FontAwesomeIcon icon={faFileExcel} /> Excel
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading stock data...</div>
      ) : stockData.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Unit</th>
                <th>Opening</th>
                <th>Purchased</th>
                <th>Issued</th>
                <th>Wasted</th>
                <th>Closing</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((item) => (
                <tr key={item.id}>
                  <td>{item.item_code}</td>
                  <td>{item.item_name}</td>
                  <td>{item.unit}</td>
                  <td>{Number(item.opening_balance).toFixed(2)}</td>
                  <td>{Number(item.total_purchased).toFixed(2)}</td>
                  <td>{Number(item.total_issued).toFixed(2)}</td>
                  <td>{Number(item.total_wasted).toFixed(2)}</td>
                  <td>{Number(item.closing_balance).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>Select a date and generate the report to view stock data.</p>
        </div>
      )}
    </div>
  );
};

export default StockReport;