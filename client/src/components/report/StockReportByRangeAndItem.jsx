import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileExcel, faCalendar, faChartLine } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './StockReport.css';

const StockReportByRangeAndItem = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await api.get('/items');
        setItems(res.data.map(item => ({
          value: item.id,
          label: `${item.item_code} - ${item.name}`,
          data: item
        })));
      } catch (err) {
        console.error('Failed to fetch items:', err);
      }
    };
    fetchItems();
  }, []);

  const fetchStockReport = async () => {
    if (!startDate || !endDate || !selectedItem) {
      alert('Please select start date, end date, and item.');
      return;
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      alert('Start date cannot be after end date.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/reports/stock-range-item`, {
        params: { startDate, endDate, itemId: selectedItem.value }
      });
      setStockData(res.data);
    } catch (err) {
      console.error(err);
      alert('Error fetching stock data');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (stockData.length === 0) {
      alert('No data to export');
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(16);
    const itemLabel = selectedItem.label;
    doc.text(`Item Stock Report – ${itemLabel}`, 14, 20);
    
    const rangeStr = `Period: ${format(new Date(startDate), 'MMM dd, yyyy')} – ${format(new Date(endDate), 'MMM dd, yyyy')}`;
    doc.setFontSize(12);
    doc.text(rangeStr, 14, 28);

    autoTable(doc, {
      head: [['Date', 'Opening Balance', 'Purchased', 'Issued', 'Wasted', 'Closing Balance']],
      body: stockData.map(r => [
        format(new Date(r.date), 'MMM dd, yyyy'),
        Number(r.opening).toFixed(2),
        Number(r.purchased).toFixed(2),
        Number(r.issued).toFixed(2),
        Number(r.wasted).toFixed(2),
        Number(r.closing).toFixed(2)
      ]),
      startY: 36,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [40, 116, 166] },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 25 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
        5: { cellWidth: 25 }
      }
    });
    
    doc.save(`StockReport_${selectedItem.value}_${startDate}_to_${endDate}.pdf`);
  };

  const downloadExcel = () => {
    if (stockData.length === 0) {
      alert('No data to export');
      return;
    }

    const worksheetData = stockData.map(r => ({
      'Date': format(new Date(r.date), 'MMM dd, yyyy'),
      'Opening Balance': Number(r.opening),
      'Purchased': Number(r.purchased),
      'Issued': Number(r.issued),
      'Wasted': Number(r.wasted),
      'Closing Balance': Number(r.closing)
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    
    const itemLabel = selectedItem ? selectedItem.label.replace(/[^\w\s]/gi, '') : 'Item';
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Report');
    XLSX.writeFile(workbook, `stock-report-${itemLabel}-${startDate}-to-${endDate}.xlsx`);
  };

  // Calculate summary statistics
  const summary = stockData.length > 0 ? {
    totalPurchased: stockData.reduce((sum, day) => sum + Number(day.purchased), 0),
    totalIssued: stockData.reduce((sum, day) => sum + Number(day.issued), 0),
    totalWasted: stockData.reduce((sum, day) => sum + Number(day.wasted), 0),
    avgClosing: stockData.reduce((sum, day) => sum + Number(day.closing), 0) / stockData.length
  } : null;

  return (
    <div className="report-container">
      <div className="report-header">
        <h2>
          <FontAwesomeIcon icon={faChartLine} style={{ marginRight: '12px', color: '#007acc' }} />
          Item-wise Stock Trend
        </h2>
        <p className="report-subtitle">Analyze stock movements for specific items over time</p>
      </div>

      <div className="controls-grid">
        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faCalendar} /> Start Date
          </label>
          <input 
            type="date" 
            max={endDate} 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
          />
        </div>

        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faCalendar} /> End Date
          </label>
          <input 
            type="date" 
            min={startDate} 
            max={today} 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
          />
        </div>

        <div className="form-group">
          <label>Item Selection</label>
          <Select
            options={items}
            value={selectedItem}
            onChange={setSelectedItem}
            isClearable
            placeholder="Search items..."
            className="react-select-container"
            classNamePrefix="react-select"
            styles={{
              control: (base) => ({
                ...base,
                minHeight: '42px',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                '&:hover': {
                  borderColor: '#e0e0e0'
                }
              }),
              menu: (base) => ({
                ...base,
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
              }),
              option: (base, state) => ({
                ...base,
                backgroundColor: state.isSelected ? '#007acc' : state.isFocused ? '#f0f8ff' : 'white',
                color: state.isSelected ? 'white' : '#333'
              })
            }}
          />
        </div>
      </div>

      <div className="action-buttons">
        <button 
          onClick={fetchStockReport} 
          disabled={loading || !selectedItem}
          className="btn btn-primary"
        >
          {loading ? 'Generating Report...' : 'Generate Trend Report'}
        </button>
        
        {stockData.length > 0 && (
          <>
            <button onClick={downloadPDF} className="btn btn-secondary">
              <FontAwesomeIcon icon={faDownload} /> Export PDF
            </button>
            <button onClick={downloadExcel} className="btn btn-secondary">
              <FontAwesomeIcon icon={faFileExcel} /> Export Excel
            </button>
          </>
        )}
      </div>

      {summary && stockData.length > 0 && (
        <div className="summary-cards" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px', 
          marginBottom: '24px' 
        }}>
          <div style={{ 
            background: '#f8f9fa', 
            padding: '16px', 
            borderRadius: '8px', 
            borderLeft: '4px solid #28a745' 
          }}>
            <div style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>TOTAL PURCHASED</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#28a745' }}>
              {summary.totalPurchased.toFixed(2)}
            </div>
          </div>
          
          <div style={{ 
            background: '#f8f9fa', 
            padding: '16px', 
            borderRadius: '8px', 
            borderLeft: '4px solid #dc3545' 
          }}>
            <div style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>TOTAL ISSUED</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#dc3545' }}>
              {summary.totalIssued.toFixed(2)}
            </div>
          </div>
          
          <div style={{ 
            background: '#f8f9fa', 
            padding: '16px', 
            borderRadius: '8px', 
            borderLeft: '4px solid #ffc107' 
          }}>
            <div style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>TOTAL WASTED</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#ffc107' }}>
              {summary.totalWasted.toFixed(2)}
            </div>
          </div>
          
          <div style={{ 
            background: '#f8f9fa', 
            padding: '16px', 
            borderRadius: '8px', 
            borderLeft: '4px solid #007acc' 
          }}>
            <div style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>AVG CLOSING BALANCE</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#007acc' }}>
              {summary.avgClosing.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading stock trend data...</div>
      ) : stockData.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opening Balance</th>
                <th>Purchased</th>
                <th>Issued</th>
                <th>Wasted</th>
                <th>Closing Balance</th>
                <th>Net Change</th>
              </tr>
            </thead>
            <tbody>
              {stockData.map((r, index) => {
                const netChange = Number(r.purchased) - Number(r.issued) - Number(r.wasted);
                return (
                  <tr key={r.date}>
                    <td style={{ fontWeight: '600' }}>
                      {format(new Date(r.date), 'MMM dd, yyyy')}
                    </td>
                    <td>{Number(r.opening).toFixed(2)}</td>
                    <td className="positive">+{Number(r.purchased).toFixed(2)}</td>
                    <td className="negative">-{Number(r.issued).toFixed(2)}</td>
                    <td className="negative">-{Number(r.wasted).toFixed(2)}</td>
                    <td style={{ fontWeight: '600' }}>{Number(r.closing).toFixed(2)}</td>
                    <td style={{ 
                      color: netChange >= 0 ? '#28a745' : '#dc3545',
                      fontWeight: '600'
                    }}>
                      {netChange >= 0 ? '+' : ''}{netChange.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          {selectedItem ? (
            <p>No stock data available for {selectedItem.label} in the selected date range.</p>
          ) : (
            <p>Please select a date range and an item to generate the stock trend report.</p>
          )}
        </div>
      )}

      {stockData.length > 0 && selectedItem && (
        <div style={{ 
          marginTop: '24px', 
          padding: '16px', 
          background: '#f8f9fa', 
          borderRadius: '8px',
          fontSize: '14px',
          color: '#666'
        }}>
          <strong>Report Summary:</strong> Showing {stockData.length} days of data for{' '}
          <strong>{selectedItem.label}</strong> from{' '}
          {format(new Date(startDate), 'MMM dd, yyyy')} to{' '}
          {format(new Date(endDate), 'MMM dd, yyyy')}
        </div>
      )}
    </div>
  );
};

export default StockReportByRangeAndItem;