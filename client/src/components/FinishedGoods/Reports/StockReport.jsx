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
      
      // Get item details for the report header
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
    
    // Title
    doc.setFontSize(16);
    doc.text(`Finished Goods Stock Report - ${itemDetails.name}`, 14, 20);
    
    // Item details
    doc.setFontSize(12);
    doc.text(`Item Code: ${itemDetails.item_code}`, 14, 30);
    doc.text(`Category: ${itemDetails.category}`, 14, 37);
    doc.text(`Unit Price: LKR ${parseFloat(itemDetails.unit_price).toFixed(2)}`, 14, 44);
    
    // Date range
    const rangeStr = `Period: ${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`;
    doc.text(rangeStr, 14, 51);

    // Table data
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
    <div className="finished-goods-stock-report-container">
      <h2>Finished Goods Stock Report</h2>
      
      <div className="report-controls">
        <div className="control-group">
          <label>
            From Date:
            <input 
              type="date" 
              max={endDate} 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
            />
          </label>
          
          <label>
            To Date:
            <input 
              type="date" 
              min={startDate} 
              max={today} 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
            />
          </label>
          
          <label>
            Finished Goods Item:
            <Select
              options={items}
              value={selectedItem}
              onChange={setSelectedItem}
              isClearable
              placeholder="Select a finished goods item"
              styles={{
                container: (base) => ({
                  ...base,
                  width: 300,
                }),
                control: (base) => ({
                  ...base,
                  minHeight: 38,
                }),
                menu: (base) => ({
                  ...base,
                  width: 300,
                })
              }}
            />
          </label>
        </div>
        
        <div className="action-buttons">
          <button onClick={fetchStockReport} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          
          {stockData.length > 0 && (
            <button onClick={downloadPDF} className="download-btn">
              Download PDF
            </button>
          )}
        </div>
      </div>

      {itemDetails && stockData.length > 0 && (
        <div className="report-header">
          <h3>Item Details</h3>
          <div className="item-details">
            <p><strong>Item Code:</strong> {itemDetails.item_code}</p>
            <p><strong>Item Name:</strong> {itemDetails.name}</p>
            <p><strong>Category:</strong> {itemDetails.category}</p>
            <p><strong>Unit Price:</strong> LKR {parseFloat(itemDetails.unit_price).toFixed(2)}</p>
          </div>
        </div>
      )}

      {stockData.length > 0 ? (
        <>
          <div className="table-responsive">
            <table className="finished-goods-stock-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opening Balance</th>
                  <th>Total Production</th>
                  <th>Production Wastage</th>
                  <th>Total Transfer</th>
                  <th>Total Wastage</th>
                  <th>Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {stockData.map((day, index) => (
                  <tr key={index}>
                    <td>{new Date(day.date).toLocaleDateString()}</td>
                    <td>{day.opening_balance}</td>
                    <td className={day.total_production > 0 ? 'positive' : ''}>
                      {day.total_production > 0 ? `+${day.total_production}` : day.total_production}
                    </td>
                    <td className={day.total_production_wastage > 0 ? 'negative' : ''}>
                      {day.total_production_wastage > 0 ? `-${day.total_production_wastage}` : day.total_production_wastage}
                    </td>
                    <td className={day.total_transfer > 0 ? 'negative' : ''}>
                      {day.total_transfer > 0 ? `-${day.total_transfer}` : day.total_transfer}
                    </td>
                    <td className={day.total_wastage > 0 ? 'negative' : ''}>
                      {day.total_wastage > 0 ? `-${day.total_wastage}` : day.total_wastage}
                    </td>
                    <td className="closing-balance">{day.closing_balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="no-data">
          {selectedItem ? (
            <p>No stock data available for the selected item and date range.</p>
          ) : (
            <p>Please select a date range and a finished goods item to generate the report.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default FinishedGoodsStockReport;