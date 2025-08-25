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
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deptData, setDeptData] = useState([]);
  const [itemData, setItemData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const response = await api.get("/departments");
        setDepartments(response.data);
      } catch (error) {
        console.error("Error fetching departments:", error);
      }
    };

    fetchDepartments();

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

      const [deptRes, itemRes] = await Promise.all([
        api.get("/reports/department", { params }),
        api.get("/reports/department/items", { params })
      ]);

      setDeptData(deptRes.data);
      setItemData(itemRes.data);
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const dateRange = `${format(new Date(startDate), 'MMM dd, yyyy')} - ${format(new Date(endDate), 'MMM dd, yyyy')}`;

    // Fix: Convert selectedDepartment to number before comparing
    const departmentName = selectedDepartment === "all"
      ? "All Departments"
      : (departments.find((dept) => dept.id === Number(selectedDepartment))?.name || "Unknown Department");

    doc.setFontSize(16);
    doc.text("Issuance Report Summary", 14, 16);

    doc.setFontSize(12);
    doc.text(`Date Range: ${dateRange}`, 14, 24);
    doc.text(`Department: ${departmentName}`, 14, 32);

    let currentY = 40;

    if (itemData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [["Issuance ID", "Department", "Item Code", "Item Name", "Unit",  "Total Issued Quantity"]],
        body: itemData.map(row => [
          row.issuance_id,
          row.department_name,
          row.item_code,
          row.item_name,
          row.unit,
          row.total_issued
        ])
      });
    } else {
      doc.text("No data available for the selected filters.", 14, currentY);
    }

    doc.save("issuance_report.pdf");
  };

  return (
    <div className="report-container">
      <h2>Issuance Report Summary</h2>

      <div className="report-controls">
        <div className="form-group">
          <label>Department</label>
          <select
            value={selectedDepartment}
            onChange={(e) =>
              setSelectedDepartment(e.target.value === "all" ? "all" : e.target.value)
            }
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

        <button onClick={exportPDF} className="btn-export">
          <FontAwesomeIcon icon={faDownload} /> Export PDF
        </button>
      </div>

      
      {itemData.length > 0 ? (
        <table className="styled-table">
          <thead>
            <tr>
              <th>Issuance ID</th>
              <th>Department</th>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Unit</th>
              <th>Total Issued Quantity</th>
            </tr>
          </thead>
          <tbody>
            {itemData.map((row, idx) => (
              <tr key={idx}>
                <td>{row.issuance_id}</td>
                <td>{row.department_name}</td>
                <td>{row.item_code}</td>
                <td>{row.item_name}</td>
                <td>{row.unit}</td>
                <td>{row.total_issued}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No item-wise data.</p>
      )}
    </div>
  );
};

export default DepartmentIssuesReport;
