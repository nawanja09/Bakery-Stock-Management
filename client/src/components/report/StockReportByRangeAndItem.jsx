import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Select from 'react-select';
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
          label: `${item.item_code} - ${item.name}`
        })));
      } catch (err) {
        console.error('Failed to fetch items:', err);
      }
    };
    fetchItems();
  }, []);

  const fetchStockReport = async () => {
    if (!startDate || !endDate || !selectedItem) {
      alert('Select start date, end date, and item.');
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
    const doc = new jsPDF();
    doc.setFontSize(16);
    const itemLabel = selectedItem.label;
    doc.text(`Item Wise Stock Report – ${itemLabel}`, 14, 20);
    const rangeStr = `Period: ${new Date(startDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`;
    doc.text(rangeStr, 14, 28);

    autoTable(doc, {
      head: [['Date', 'Opening', 'Purchased', 'Issued', 'Wasted', 'Closing']],
      body: stockData.map(r => [
        r.date,
        r.opening.toFixed(2),
        r.purchased.toFixed(2),
        r.issued.toFixed(2),
        r.wasted.toFixed(2),
        r.closing.toFixed(2)
      ]),
      startY: 36,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 116, 166] }
    });
    doc.save(`StockReport_${selectedItem.value}_${startDate}_to_${endDate}.pdf`);
  };

  return (
    <div className="stock-report-container">
      <h2>Item-Wise Stock Report (Date Range)</h2>
      <div className="report-controls">
        <label>
          From:
          <input type="date" max={endDate} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label>
          To:
          <input type="date" min={startDate} max={today} value={endDate} onChange={e => setEndDate(e.target.value)} />
        </label>
        <label>
          Item:
          <Select
          options={items}
          value={selectedItem}
          onChange={setSelectedItem}
          isClearable
          placeholder="Select an item"
          styles={{
            container: (base) => ({
              ...base,
              width: 250, // fixed select width
            }),
            control: (base) => ({
              ...base,
              minHeight: 38,
            }),
            menu: (base) => ({
              ...base,
              width: 250, // fix dropdown width same as select
            }),
            menuList: (base) => ({
              ...base,
              maxHeight: 200, // scroll instead of stretching too tall
            }),
          }}
        />

        </label>
        <button onClick={fetchStockReport} disabled={loading}>
          {loading ? 'Loading...' : 'Generate Report'}
        </button>
        {stockData.length > 0 && (
          <button onClick={downloadPDF} className="download-btn">
            Download PDF
          </button>
        )}
      </div>
      {stockData.length > 0 ? (
        <table className="styled-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opening</th>
              <th>Purchased</th>
              <th>Issued</th>
              <th>Wasted</th>
              <th>Closing</th>
            </tr>
          </thead>
          <tbody>
            {stockData.map(r => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{Number(r.opening).toFixed(2)}</td>
                <td>{Number(r.purchased).toFixed(2)}</td>
                <td>{Number(r.issued).toFixed(2)}</td>
                <td>{Number(r.wasted).toFixed(2)}</td>
                <td>{Number(r.closing).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>
          {selectedItem
            ? 'No stock data available for the selected item and date range.'
            : 'Please select a date range and an item to generate the report.'}
        </p>
      )}
    </div>
  );
};

export default StockReportByRangeAndItem;
