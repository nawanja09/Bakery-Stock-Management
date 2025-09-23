import React, { useState } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../../../api';
import './Reports.css';

const StockReport = () => {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchStockReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/finished-goods-reports/stock?date=${selectedDate}`);
      setStockData(response.data);
    } catch (error) {
      console.error('Error fetching finished goods stock report:', error.message);
      alert('Failed to fetch finished goods stock report');
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
    
    // Title
    doc.setFontSize(16);
    doc.text(`Finished Goods Stock Report - ${dateStr}`, 15, 15);
    
    // Table data
    const tableData = stockData.map(item => [
      item.item_code,
      item.item_name,
      item.category,
      Number(item.opening_balance).toFixed(0),
      Number(item.total_produced).toFixed(0),
      Number(item.total_production_wasted).toFixed(0),
      Number(item.total_transferred).toFixed(0),
      Number(item.total_wasted).toFixed(0),
      Number(item.closing_balance).toFixed(0)
    ]);
    
    // Table headers
    const headers = [
      'Item Code',
      'Item Name',
      'Category',
      'Opening',
      'Produced',
      'Prod. Wastage',
      'Transferred',
      'Wastage',
      'Closing'
    ];
    
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 25,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 160, 133] }
    });
    
    doc.save(`finished-goods-stock-report-${selectedDate}.pdf`);
  };

  return (
    <div className="stock-report-container">
      <h2>Finished Goods Stock Report</h2>
      
      <div className="report-controls">
        <label>
          Report Date:
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={format(new Date(), 'yyyy-MM-dd')}
          />
        </label>
        
        <button 
          onClick={fetchStockReport}
          disabled={loading}
          className="btn-generate"
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
        
        {stockData.length > 0 && (
          <button onClick={downloadPDF} className="download-btn">
            Download PDF
          </button>
        )}
      </div>
      
      {stockData.length > 0 ? (
        <div className="table-responsive">
          <table className="styled-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Opening Balance</th>
                <th>Production</th>
                <th>Production Wastage</th>
                <th>Transfers</th>
                <th>Wastage</th>
                <th>Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((item) => (
                <tr key={item.id}>
                  <td>{item.item_code}</td>
                  <td>{item.item_name}</td>
                  <td>{item.category}</td>
                  <td>{Number(item.opening_balance).toFixed(0)}</td>
                  <td>{Number(item.total_produced).toFixed(0)}</td>
                  <td>{Number(item.total_production_wasted).toFixed(0)}</td>
                  <td>{Number(item.total_transferred).toFixed(0)}</td>
                  <td>{Number(item.total_wasted).toFixed(0)}</td>
                  <td>{Number(item.closing_balance).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No data to display. Select a date and generate the report.</p>
      )}
    </div>
  );
};

export default StockReport;