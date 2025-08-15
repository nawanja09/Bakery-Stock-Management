import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload } from '@fortawesome/free-solid-svg-icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './StockReport.css';
import api from '../../api';

const DepartmentIssuesReport = () => {
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState('all'); 
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchDepartments = async () => {
            try {
                const response = await api.get('/departments');
                setDepartments(response.data);
                // Removed setting default department
            } catch (error) {
                console.error('Error fetching departments:', error);
            }
        };

        fetchDepartments();
        
        // Set default date range (last 30 days)
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    }, []);

    const generateReport = async () => {
        if (!startDate || !endDate) { 
            alert('Please select a date range');
            return;
        }

        setLoading(true);
        try {
            const params = {
                startDate,
                endDate
            };
            
            // Only add departmentId if not 'all'
            if (selectedDepartment !== 'all') {
                params.departmentId = selectedDepartment;
            }

            const response = await api.get('/reports/department', {
                params
            });
            setReportData(response.data);
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Failed to generate report');
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = () => {
        if (reportData.length === 0) return;
        
        const doc = new jsPDF();
        
        // Determine department name
        let departmentName = 'All Departments';
        if (selectedDepartment !== 'all') {
            const department = departments.find(d => d.id === parseInt(selectedDepartment));
            departmentName = department ? department.name : 'Selected Department';
        }
        
        // Title
        doc.setFontSize(16);
        doc.text(`Department Issues Report - ${departmentName}`, 15, 15);
        doc.setFontSize(10);
        doc.text(`Date Range: ${startDate} to ${endDate}`, 15, 22);
        
        // Table data - added department column
        const tableData = reportData.map(item => [
            new Date(item.issuance_date).toLocaleDateString(),
            item.issuance_id,
            item.department_name || 'N/A', 
            item.item_code,
            item.item_name,
            item.quantity,
            item.unit,
            item.received_by
        ]);
        
        // Table headers - added Department column
        const headers = [
            'Date',
            'Issuance ID',
            'Department', 
            'Item Code',
            'Item Name',
            'Quantity',
            'Unit',
            'Received By'
        ];
        
        autoTable(doc, {
            head: [headers],
            body: tableData,
            startY: 30,
            styles: { fontSize: 9 },
            headStyles: { fillColor: [41, 128, 185] }
        });
        
        doc.save(`department-issues-${departmentName.replace(/ /g, '_')}-${startDate}-to-${endDate}.pdf`);
    };

    return (
        <div className="report-container">
            <h2>Department Issues Report</h2>
            
            <div className="report-controls">
                <div className="form-group">
                    <label>Department</label>
                    <select
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                    >
                        {/* Added "All Departments" option */}
                        <option value="all">All Departments</option>
                        {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>
                                {dept.name}
                            </option>
                        ))}
                    </select>
                </div>
                
                {/* Date inputs remain the same */}
                
                <button 
                    onClick={generateReport}
                    disabled={loading}
                    className="btn-generate"
                >
                    {loading ? 'Generating...' : 'Generate Report'}
                </button>
                
                {reportData.length > 0 && (
                    <button onClick={downloadPDF} className="download-btn">
                        <FontAwesomeIcon icon={faDownload} /> Download PDF
                    </button>
                )}
            </div>
            
            {reportData.length > 0 ? (
                <div className="table-responsive">
                    <table className="styled-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Issuance ID</th>
                                <th>Department</th>
                                <th>Item Code</th>
                                <th>Item Name</th>
                                <th>Quantity</th>
                                <th>Unit</th>
                                <th>Received By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.map((item, index) => (
                                <tr key={index}>
                                    <td>{new Date(item.issuance_date).toLocaleDateString()}</td>
                                    <td>{item.issuance_id}</td>
                                    <td>{item.department_name}</td>
                                    <td>{item.item_code}</td>
                                    <td>{item.item_name}</td>
                                    <td>{item.quantity}</td>
                                    <td>{item.unit}</td>
                                    <td>{item.received_by}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p>No data to display. Select a department and date range, then generate the report.</p>
            )}
        </div>
    );
};

export default DepartmentIssuesReport;