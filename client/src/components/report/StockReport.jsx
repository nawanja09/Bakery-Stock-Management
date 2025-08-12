import React, { useState } from 'react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
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
    import('jspdf').then((jsPDFModule) => {
      import('jspdf-autotable').then((autoTableModule) => {
        const { jsPDF } = jsPDFModule;
        const autoTable = autoTableModule.default;
        
        const doc = new jsPDF();
        const dateStr = new Date(selectedDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        // Title
        doc.setFontSize(16);
        doc.text(`Stock Report of ${dateStr}`, 15, 15);
        
        // Table data
        const tableData = stockData.map(item => [
          item.item_code,
          item.item_name,
          item.unit,
          item.opening_balance,
          item.total_purchased,
          item.total_issued,
          item.total_wasted,
          item.closing_balance,
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
        
        // Generate table
        autoTable(doc, {
          head: [headers],
          body: tableData,
          startY: 25,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 160, 133] }
        });
        
        doc.save(`stock-report-${selectedDate}.pdf`);
      });
    }).catch(error => {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    });
  };

  return (
    <div className="stock-report-container">
      <h2>Stock Report</h2>
      
      <div className="report-controls">
        <label>
          Select Date:
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
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
          <button onClick={downloadPDF} className="btn-download">
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
                   <td>{Number(item.opening_balance)}</td>
                  <td>{Number(item.total_purchased)}</td>
                  <td>{Number(item.total_issued)}</td>
                  <td>{Number(item.total_wasted)}</td>
                  <td>{Number(item.closing_balance)}</td>
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