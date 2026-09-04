import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Select from 'react-select';
import api from '../../../api';
import './Reports.css';

const FinishedGoodsStockReport = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [itemDetails, setItemDetails] = useState(null);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await api.get('/finished-goods-items');
        setItems(res.data.map(item => ({
          value: item.id,
          label: `${item.item_code} - ${item.name} (${item.category})`
        })));
      } catch (err) {
        console.error('Failed to fetch finished goods items:', err);
      }
    };
    fetchItems();
  }, []);

  const fetchStockReport = async () => {
    if (!startDate || !endDate || !selectedItem) {
      alert('Please select start date, end date, and a finished goods item.');
      return;
    }
    
    setLoading(true);
    try {
      const res = await api.get(`/finished-goods-reports/stock-report`, {
        params: { 
          startDate, 
          endDate, 
          itemId: selectedItem.value 
        }
      });
      
      const itemRes = await api.get(`/finished-goods-items/${selectedItem.value}`);
      setItemDetails(itemRes.data);
      setStockData(res.data);
    } catch (err) {
      console.error(err);
      alert('Error fetching stock data');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (!stockData.length || !itemDetails) return;

    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`Finished Goods Stock Report - ${itemDetails.name}`, 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Item Code: ${itemDetails.item_code}`, 14, 30);
    doc.text(`Category: ${itemDetails.category}`, 14, 37);
    doc.text(`Unit Price: LKR ${parseFloat(itemDetails.unit_price).toFixed(2)}`, 14, 44);
    
    const rangeStr = `Period: ${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`;
    doc.text(rangeStr, 14, 51);

    const tableData = stockData.map(r => [
      r.date,
      r.opening_balance.toString(),
      r.total_production.toString(),
      r.total_production_wastage.toString(),
      r.total_transfer.toString(),
      r.total_wastage.toString(),
      r.closing_balance.toString()
    ]);

    autoTable(doc, {
      head: [['Date', 'Opening Balance', 'Total Production', 'Production Wastage', 'Total Transfer', 'Total Wastage', 'Closing Balance']],
      body: tableData,
      startY: 60,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 116, 166] }
    });

    doc.save(`FinishedGoods_StockReport_${itemDetails.item_code}_${startDate}_to_${endDate}.pdf`);
  };

  const calculateTotals = () => {
    if (!stockData.length) return null;
    
    return {
      opening: stockData.reduce((sum, day) => sum + day.opening_balance, 0),
      production: stockData.reduce((sum, day) => sum + day.total_production, 0),
      production_wastage: stockData.reduce((sum, day) => sum + day.total_production_wastage, 0),
      transfer: stockData.reduce((sum, day) => sum + day.total_transfer, 0),
      wastage: stockData.reduce((sum, day) => sum + day.total_wastage, 0),
      closing: stockData.reduce((sum, day) => sum + day.closing_balance, 0)
    };
  };

  const totals = calculateTotals();

  return (
    <div className="minimal-report-container">
      <div className="report-header">
        <div className="header-content">
          <h1 className="report-title">Finished Goods Stock Report</h1>
        </div>
      </div>

      <div className="control-card">
        <div className="control-grid">
          <div className="control-field">
            <label className="field-label">From Date</label>
            <input 
              type="date" 
              className="date-input"
              max={endDate} 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
            />
          </div>
          
          <div className="control-field">
            <label className="field-label">To Date</label>
            <input 
              type="date" 
              className="date-input"
              min={startDate} 
              max={today} 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
            />
          </div>
          
          <div className="control-field">
            <label className="field-label">Finished Goods Item</label>
            <Select
              options={items}
              value={selectedItem}
              onChange={setSelectedItem}
              isClearable
              placeholder="Select item..."
              className="select-input"
              classNamePrefix="react-select"
            />
          </div>
          
          <div className="control-actions">
            <button 
              onClick={fetchStockReport} 
              disabled={loading}
              className={`generate-btn ${loading ? 'loading' : ''}`}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Generating...
                </>
              ) : (
                'Generate Report'
              )}
            </button>
            
            {stockData.length > 0 && (
              <button onClick={downloadPDF} className="download-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 16L12 4M12 16L8 12M12 16L16 12" stroke="currentColor" strokeWidth="2"/>
                  <path d="M4 20H20" stroke="currentColor" strokeWidth="2"/>
                </svg>
                Download PDF
              </button>
            )}
          </div>
        </div>
      </div>

      {itemDetails && stockData.length > 0 && (
        <div className="item-card">
          <div className="card-header">
            <h3>Item Details</h3>
          </div>
          <div className="item-grid">
            <div className="item-detail">
              <span className="detail-label">Item Code</span>
              <span className="detail-value">{itemDetails.item_code}</span>
            </div>
            <div className="item-detail">
              <span className="detail-label">Item Name</span>
              <span className="detail-value">{itemDetails.name}</span>
            </div>
            <div className="item-detail">
              <span className="detail-label">Category</span>
              <span className="detail-value">{itemDetails.category}</span>
            </div>
            <div className="item-detail">
              <span className="detail-label">Unit Price</span>
              <span className="detail-value">LKR {parseFloat(itemDetails.unit_price).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {stockData.length > 0 ? (
        <div className="table-card">
          <div className="table-container">
            <table className="minimal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opening</th>
                  <th>Production</th>
                  <th>Prod. Waste</th>
                  <th>Transfer</th>
                  <th>Wastage</th>
                  <th>Closing</th>
                </tr>
              </thead>
              <tbody>
                {stockData.map((day, index) => (
                  <tr key={index}>
                    <td className="date-cell">{new Date(day.date).toLocaleDateString()}</td>
                    <td>{day.opening_balance}</td>
                    <td className="positive-change">
                      {day.total_production > 0 ? `+${day.total_production}` : day.total_production}
                    </td>
                    <td className="negative-change">
                      {day.total_production_wastage > 0 ? `-${day.total_production_wastage}` : day.total_production_wastage}
                    </td>
                    <td className="negative-change">
                      {day.total_transfer > 0 ? `-${day.total_transfer}` : day.total_transfer}
                    </td>
                    <td className="negative-change">
                      {day.total_wastage > 0 ? `-${day.total_wastage}` : day.total_wastage}
                    </td>
                    <td className="closing-balance">{day.closing_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M9 12H15M9 16H15M9 8H15M5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21Z" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
          <h3>No Data Available</h3>
          <p>Select a date range and item to generate the stock report</p>
        </div>
      )}
    </div>
  );
};

export default FinishedGoodsStockReport;