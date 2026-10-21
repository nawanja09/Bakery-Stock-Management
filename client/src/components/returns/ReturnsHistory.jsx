import React, { useState, useEffect } from 'react';
import { usePopup } from '../context/PopupContext';
import './Returns.css';
import api from '../../api';

// Modal component for return details
const ReturnDetailsModal = ({ id, onClose }) => {
  const [returnRecord, setReturnRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchReturn = async () => {
      try {
        const response = await api.get(`/returns/${id}`);
        setReturnRecord(response.data);
      } catch (err) {
        showPopup('error', 'Failed to fetch return details');
      } finally {
        setLoading(false);
      }
    };
    fetchReturn();
  }, [id, showPopup]);

  // Helper function to format stock value safely
  const formatStock = (value) => {
    const num = parseFloat(value) || 0;
    return num.toFixed(3);
  };

  if (loading) return <div className="loading" role="status" aria-live="polite">Loading...</div>;
  if (!returnRecord) return <div>No return data found</div>;

  return (
    <div className="return-details">
      <div className="header-with-actions">
        <h2>Return Reference: {returnRecord.return_number}</h2>
        <button className="btn-close" onClick={onClose}>&#10005;</button>
      </div>
      
      <div className="details-row vertical">
        <ul className="details-list">
          <li><strong>Date:</strong> {new Date(returnRecord.return_date).toLocaleDateString()}</li>
          <li><strong>Department:</strong> {returnRecord.department_name}</li>
          <li><strong>Received By:</strong> {returnRecord.received_by}</li>
          <li><strong>Entered By:</strong> {returnRecord.entered_by}</li>
          <li><strong>Remarks:</strong> {returnRecord.remarks || 'N/A'}</li>
        </ul>
      </div>
      
      <div className="items-table">
        <h3>Returned Items</h3>
        <div className="table-responsive">
          <table className="details-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Reason</th>
                <th>Current Stock</th>
              </tr>
            </thead>
            <tbody>
              {returnRecord.items.map((item, index) => {
                const currentStock = parseFloat(item.current_stock_quantity) || 0;
                return (
                  <tr key={index}>
                    <td>{item.item_code}</td>
                    <td>{item.item_name}</td>
                    <td>{Number(item.quantity).toFixed(3)}</td>
                    <td>{item.unit}</td>
                    <td>
                      <span className={`reason-badge reason-${item.reason.toLowerCase().replace(' ', '-')}`}>
                        {item.reason}
                      </span>
                    </td>
                    <td>
                      <span className={`stock-badge ${currentStock <= 0 ? 'stock-zero' : currentStock < 10 ? 'stock-low' : ''}`}>
                        {formatStock(currentStock)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ReturnsHistory = () => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReturnId, setSelectedReturnId] = useState(null);
  
  // Filter states
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [returnsRes, deptRes] = await Promise.all([
          api.get('/returns'),
          api.get('/departments')
        ]);
        setReturns(returnsRes.data);
        setDepartments(deptRes.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Apply filters
  const filteredReturns = returns.filter(returnRecord => {
    const returnDate = new Date(returnRecord.return_date);
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;

    const matchesDate =
      (!from || returnDate >= from) &&
      (!to || returnDate <= to);

    const matchesDepartment =
      !departmentFilter || 
      String(returnRecord.department_id) === String(departmentFilter);

    return matchesDate && matchesDepartment;
  });

  if (loading) return <div className="loading" role="status" aria-live="polite">Loading...</div>;

  return (
    <div className="returns-container erp-department-return-summary">
      <div className="header-with-actions">
        <h2 style={{ margin: 0 }}>Department Return Summary</h2>
      </div>

      {/* Filter Section */}
      <div className="filters-bar single-line">
        <label>
          From:
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="filter-input"
          />
        </label>
        <label>
          To:
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="filter-input"
          />
        </label>
        <label>
          Department:
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="filter-input"
          >
            <option value="">All</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Table */}
      <div className="table-responsive">
        <table className="returns-table styled-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Ref No.</th>
              <th>Date</th>
              <th>Department From</th>
              <th>Received By</th>
              <th>Items Count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredReturns.length > 0 ? (
              filteredReturns.map(returnRecord => (
                <tr key={returnRecord.id}>
                  <td>{returnRecord.return_number}</td>
                  <td>{new Date(returnRecord.return_date).toLocaleDateString()}</td>
                  <td>{returnRecord.department_name}</td>
                  <td>{returnRecord.received_by}</td>
                  <td>{returnRecord.items?.length || 0}</td>
                  <td className="actions-column">
                    <button 
                      className="btn-view" 
                      onClick={() => setSelectedReturnId(returnRecord.id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>
                  No return records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for return details */}
      {selectedReturnId && (
        <div className="modal-overlay" onClick={() => setSelectedReturnId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <ReturnDetailsModal 
              id={selectedReturnId} 
              onClose={() => setSelectedReturnId(null)} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnsHistory;