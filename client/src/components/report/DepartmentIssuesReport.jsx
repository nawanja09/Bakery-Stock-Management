import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileExcel, faFilter } from '@fortawesome/free-solid-svg-icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import './DepartmentIssuesReport.css';
import Select from 'react-select';
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

    // Default date range: last 30 days
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
    const dateRange = `${format(new Date(startDate), 'dd,MMM, yyyy')} - ${format(new Date(endDate), 'dd,MMM, yyyy')}`;

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

    // Calculate grand total
    const grandTotal = reportData.reduce((total, row) => total + (parseFloat(row.total_price) || 0), 0);

    autoTable(doc, {
      startY: 50,
      head: [["Date", "Department", "Item Code", "Item Name", "Quantity", "Unit", "Unit Price (Rs.)", "Total Price (Rs.)", "Received By", "Remarks"]],
      body: reportData.map(row => [
        format(new Date(row.issuance_date), 'MMM dd, yyyy'),
        row.department_name,
        row.item_code,
        row.item_name,
        parseFloat(row.quantity).toFixed(3),
        row.unit,
        row.unit_price ? `Rs. ${parseFloat(row.unit_price).toFixed(2)}` : 'N/A',
        row.total_price ? `Rs. ${parseFloat(row.total_price).toFixed(2)}` : 'N/A',
        row.received_by,
        row.remarks || 'N/A'
      ]),
      foot: [
        ['', '', '', '', '', '', 'Grand Total:', `Rs. ${grandTotal.toFixed(2)}`, '', '']
      ]
    });

    doc.save("issuance_report.pdf");
  };

  const exportExcel = () => {
    if (reportData.length === 0) {
      alert("No data to export");
      return;
    }

    const worksheetData = reportData.map(row => ({
      'Date': format(new Date(row.issuance_date), 'MMM dd, yyyy'),
      'Department': row.department_name,
      'Item Code': row.item_code,
      'Item Name': row.item_name,
      'Quantity': parseFloat(row.quantity).toFixed(3),
      'Unit': row.unit,
      'Unit Price (Rs.)': row.unit_price ? parseFloat(row.unit_price).toFixed(2) : 'N/A',
      'Total Price (Rs.)': row.total_price ? parseFloat(row.total_price).toFixed(2) : 'N/A',
      'Received By': row.received_by,
      'Remarks': row.remarks || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Issuance Report');
    
    // Add grand total
    const grandTotal = reportData.reduce((total, row) => total + (parseFloat(row.total_price) || 0), 0);
    XLSX.utils.sheet_add_aoa(worksheet, [['', '', '', '', '', '', 'Grand Total:', `Rs. ${grandTotal.toFixed(2)}`]], { origin: -1 });
    
    XLSX.writeFile(workbook, `issuance-report-${startDate}-to-${endDate}.xlsx`);
  };

  return (
    <div className="report-container">
      <header className="report-header">
        <div>
          <h2>Issuance Report</h2>
          <p className="report-subtitle">Track item issuance across departments</p>
        </div>
      </header>

      <section className="controls-grid" aria-label="Report filters">
        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faFilter} /> Department
          </label>
          <Select
            value={selectedDepartment === "all" ? { value: "all", label: "All Departments" } : departments.find(d => d.id === Number(selectedDepartment)) && { value: selectedDepartment, label: departments.find(d => d.id === Number(selectedDepartment))?.name }}
            onChange={(option) => setSelectedDepartment(option.value)}
            options={[
              { value: "all", label: "All Departments" },
              ...departments.map((dept) => ({
                value: dept.id.toString(),
                label: dept.name,
              })),
            ]}
          />
        </div>

        <div className="form-group">
          <label>
            <FontAwesomeIcon icon={faFilter} /> Item
          </label>
          <Select
            value={selectedItem === "all" ? { value: "all", label: "All Items" } : items.find(i => i.id === Number(selectedItem)) && { value: selectedItem, label: items.find(i => i.id === Number(selectedItem))?.name + ` (${items.find(i => i.id === Number(selectedItem))?.item_code})` }}
            onChange={(option) => setSelectedItem(option.value)}
            options={[
              { value: "all", label: "All Items" },
              ...items.map((item) => ({
                value: item.id.toString(),
                label: `${item.name} (${item.item_code})`,
              })),
            ]}
          />
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
  </section>

  <div className="action-buttons" role="toolbar" aria-label="Report actions">
        <button
          onClick={generateReport}
          disabled={loading}
          className="btn btn-primary"
          title="Generate report"
        >
          {loading ? "Generating..." : "Generate"}
        </button>

        <button
          onClick={exportPDF}
          disabled={reportData.length === 0}
          className="btn btn-secondary"
          title="Export as PDF"
        >
          <FontAwesomeIcon icon={faDownload} />
          <span>PDF</span>
        </button>

        <button
          onClick={exportExcel}
          disabled={reportData.length === 0}
          className="btn btn-secondary"
          title="Export as Excel"
        >
          <FontAwesomeIcon icon={faFileExcel} />
          <span>Excel</span>
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading report data...</div>
      ) : reportData.length > 0 ? (
        <div className="report-summary">
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Department</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Unit Price (Rs.)</th>
                  <th>Total Price (Rs.)</th>
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
                    <td>{parseFloat(row.quantity).toFixed(3)}</td>
                    <td>{row.unit}</td>
                    <td>{row.unit_price ? `Rs. ${parseFloat(row.unit_price).toFixed(2)}` : 'N/A'}</td>
                    <td style={{ fontWeight: 'bold' }}>
                      {row.total_price ? `Rs. ${parseFloat(row.total_price).toFixed(2)}` : 'N/A'}
                    </td>
                    <td>{row.received_by}</td>
                    <td>{row.remarks || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                  <td colSpan="4"></td>
                  <td>Grand Total Quantity:</td>
                  <td>
                    {reportData
                      .reduce((total, row) => total + (parseFloat(row.quantity) || 0), 0)
                      .toFixed(3)}
                  </td>
                  <td>Grand Total:</td>
                  <td colSpan="1"></td>
                  <td>
                    Rs.{" "}
                    {reportData
                      .reduce((total, row) => total + (parseFloat(row.total_price) || 0), 0)
                      .toFixed(2)}
                  </td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No data available for the selected filters. Generate a report to view data.</p>
        </div>
      )}
    </div>
  );
};

export default DepartmentIssuesReport;