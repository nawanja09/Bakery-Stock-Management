import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload } from '@fortawesome/free-solid-svg-icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import './StockReport.css';
import api from '../../api';

const DepartmentIssuesReport = () => {
  const [departments, setDepartments] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedItem, setSelectedItem] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [deptResponse, itemsResponse] = await Promise.all([
          api.get("/departments"),
          api.get("/items")
        ]);
        setDepartments(deptResponse.data);
        setItems(itemsResponse.data);
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };

    fetchInitialData();

    // default date range = last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  }, []);

  const generateReport = async () => {
    if (!startDate || !endDate) {
      alert("Please select a date range");
      return;
    }

    setLoading(true);
    try {
      const params = { startDate, endDate };
      if (selectedDepartment !== "all") params.departmentId = selectedDepartment;
      if (selectedItem !== "all") params.itemId = selectedItem;

      // Always fetch detailed data
      const response = await api.get("/reports/department", { params });
      setReportData(response.data);
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    if (reportData.length === 0) {
      alert("No data to export");
      return;
    }

    const doc = new jsPDF();
    const dateRange = `${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')}`;

    const departmentName = selectedDepartment === "all"
      ? "All Departments"
      : (departments.find((dept) => dept.id === Number(selectedDepartment))?.name || "Unknown Department");

    const itemName = selectedItem === "all"
      ? "All Items"
      : (items.find((item) => item.id === Number(selectedItem))?.name || "Unknown Item");

    doc.setFontSize(16);
    doc.text("Issuance Report", 14, 16);

    doc.setFontSize(12);
    doc.text(`Date Range: ${dateRange}`, 14, 24);
    doc.text(`Department: ${departmentName}`, 14, 32);
    doc.text(`Item: ${itemName}`, 14, 40);

    // Detailed issuance data
    autoTable(doc, {
      startY: 50,
      head: [["Date", "Department", "Item Code", "Item Name", "Quantity", "Unit", "Received By", "Remarks"]],
      body: reportData.map(row => [
        format(new Date(row.issuance_date), 'MMM dd, yyyy'),
        row.department_name,
        row.item_code,
        row.item_name,
        row.quantity,
        row.unit,
        row.received_by,
        row.remarks || 'N/A'
      ])
    });

    doc.save("issuance_report.pdf");
  };

  return (
    <div className="report-container">
      <h2>Issuance Report</h2>

      <div className="report-controls">
        <div className="form-group">
          <label>Department</label>
          <select
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Item</label>
          <select
            value={selectedItem}
            onChange={(e) => setSelectedItem(e.target.value)}
          >
            <option value="all">All Items</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.item_code})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <button onClick={generateReport} disabled={loading} className="btn-generate">
          {loading ? "Generating..." : "Generate Report"}
        </button>

        <button onClick={exportPDF} disabled={reportData.length === 0} className="btn-export">
          <FontAwesomeIcon icon={faDownload} /> Export PDF
        </button>
      </div>

      {reportData.length > 0 && (
        <div className="report-summary">
          <p>Showing {reportData.length} issuance records</p>
          <table className="styled-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Department</th>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Received By</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((row, idx) => (
                <tr key={idx}>
                  <td>{format(new Date(row.issuance_date), 'MMM dd, yyyy')}</td>
                  <td>{row.department_name}</td>
                  <td>{row.item_code}</td>
                  <td>{row.item_name}</td>
                  <td>{row.quantity}</td>
                  <td>{row.unit}</td>
                  <td>{row.received_by}</td>
                  <td>{row.remarks || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportData.length === 0 && !loading && (
        <p>No data available for the selected filters.</p>
      )}
    </div>
  );
};

export default DepartmentIssuesReport;