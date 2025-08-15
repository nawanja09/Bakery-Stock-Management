import React, { useState } from 'react';
import { format } from 'date-fns';
import  jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
      console.error('Error fetching stock report:', error);
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
    
    // Title
    doc.setFontSize(16);
    doc.text(`Stock Report - ${dateStr}`, 15, 15);
    
    // Table data
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
    
    // Table headers
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
    
    // ✅ Use autoTable from the import, passing the doc instance
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 25,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 160, 133] }
    });
    
    doc.save(`stock-report-${selectedDate}.pdf`);
  };

  return (
    <div className="stock-report-container">
      <h2>Stock Report</h2>
      
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
                <th>Unit</th>
                <th>Opening Balance</th>
                <th>Purchased</th>
                <th>Issued</th>
                <th>Wastage</th>
                <th>Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((item) => (
                <tr key={item.id}>
                  <td>{item.item_code}</td>
                  <td>{item.item_name}</td>
                  <td>{item.unit}</td>
                  <td>
                    {Number(item.opening_balance) % 1 === 0
                      ? Number(item.opening_balance)
                      : Number(item.opening_balance).toFixed(2)}
                  </td>
                  <td>{Number(item.total_purchased) % 1 === 0
                    ? Number(item.total_purchased)
                    : Number(item.total_purchased).toFixed(2)}</td>
                  <td>{Number(item.total_issued) % 1 === 0
                    ? Number(item.total_issued)
                    : Number(item.total_issued).toFixed(2)}</td>
                  <td>{Number(item.total_wasted) % 1 === 0
                    ? Number(item.total_wasted)
                    : Number(item.total_wasted).toFixed(2)}</td>
                  <td>{Number(item.closing_balance) % 1 === 0
                    ? Number(item.closing_balance)
                    : Number(item.closing_balance).toFixed(2)}</td>
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