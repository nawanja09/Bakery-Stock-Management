import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faPlus, faRotateLeft, faSackDollar, faSpinner, faTrash } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { formatCurrency } from '../../utils/formatters';
import { usePopup } from '../context/PopupContext';
import NewIncomeModal from '../Income/NewIncomeModal';
import '../Income/Income.css';

import { useConfirm } from '../common/ui';
const ALLOWED_COMPANY_NAMES = ['JH', 'RD'];
const initialFilters = { fromDate: '', toDate: '', departmentId: 'all', companyId: 'all' };
const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB') : '-');
const sortRecords = (records) => [...records].sort((a, b) => (
  a.income_date.localeCompare(b.income_date) || Number(a.id) - Number(b.id)
));

const AnalystIncomePage = () => {
  const confirm = useConfirm();
  const { showPopup } = usePopup();
  const [records, setRecords] = useState([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingRecord, setEditingRecord] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const loadRecords = useCallback(async (activeFilters) => {
    const { fromDate, toDate, departmentId, companyId } = activeFilters;
    if (fromDate && toDate && fromDate > toDate) {
      setError('From Date cannot be after To Date.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/analyst/incomes', {
        params: {
          ...(fromDate && { fromDate }),
          ...(toDate && { toDate }),
          ...(departmentId && departmentId !== 'all' && { department: departmentId }),
          ...(companyId && companyId !== 'all' && { company: companyId })
        }
      });
      const loaded = response.data.records || [];
      setRecords(sortRecords(loaded));
      setTotalIncome(Number(response.data.totalIncome) || 0);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to load income records.');
      setRecords([]);
      setTotalIncome(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords(filters);
  }, [filters, loadRecords]);

  useEffect(() => {
    Promise.all([api.get('/companies'), api.get('/departments')])
      .then(([companyResponse, departmentResponse]) => {
        setCompanies((companyResponse.data || []).filter((company) => (
          ALLOWED_COMPANY_NAMES.includes((company.name || '').toUpperCase())
        )));
        setDepartments(departmentResponse.data || []);
      })
      .catch(() => showPopup('error', 'Unable to load companies or departments for the form.'));
  }, [showPopup]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const clearFilters = () => setFilters(initialFilters);

  const openCreateForm = () => {
    setEditingRecord(null);
    setIsFormOpen(true);
  };

  const openEditForm = (record) => {
    setEditingRecord(record);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setEditingRecord(null);
    setIsFormOpen(false);
  };

  const handleSaved = (record, isEditing) => {
    closeForm();
    loadRecords(filters);
    showPopup('success', isEditing ? 'Income updated successfully.' : 'Income added successfully.');
  };

  const handleDelete = async (record) => {
    if (!await confirm('Delete this income record?')) return;
    try {
      await api.delete(`/incomes/${record.id}`);
      loadRecords(filters);
      showPopup('success', 'Income deleted successfully.');
    } catch (requestError) {
      showPopup('error', requestError.response?.data?.error || 'Unable to delete income record.');
    }
  };

  return (
    <div className="page-container income-page">
      <header className="page-header income-header">
        <h2><FontAwesomeIcon icon={faSackDollar} /> Income</h2>
        <button className="btn btn-primary income-new-btn" onClick={openCreateForm}>
          <FontAwesomeIcon icon={faPlus} /> Add New Income
        </button>
      </header>

      <div className="income-summary-grid">
        <div className="card income-summary-card income-total-card">
          <span>Total Income</span>
          <strong>{formatCurrency(totalIncome)}</strong>
        </div>
      </div>

      <div className="card income-filters">
        <label>From Date<input type="date" name="fromDate" value={filters.fromDate} onChange={updateFilter} /></label>
        <label>To Date<input type="date" name="toDate" value={filters.toDate} onChange={updateFilter} /></label>
        <label>
          Department
          <select name="departmentId" value={filters.departmentId} onChange={updateFilter}>
            <option value="all">All Departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>
        <label>
          Company
          <select name="companyId" value={filters.companyId} onChange={updateFilter}>
            <option value="all">All Companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
        <div className="income-filters-actions">
          <button className="btn btn-secondary" onClick={clearFilters} disabled={loading}>
            <FontAwesomeIcon icon={faRotateLeft} /> Clear
          </button>
        </div>
      </div>

      {error && <div className="income-error" role="alert">{error}</div>}

      {loading ? (
        <div className="income-empty-panel"><FontAwesomeIcon icon={faSpinner} spin /> Loading income records...</div>
      ) : records.length ? (
        <div className="card income-table-card">
          <div className="income-table-scroll">
            <table className="report-table">
              <thead><tr><th>Date</th><th>Company</th><th>Department</th><th className="income-amount">Amount</th><th>Actions</th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.income_date)}</td>
                    <td><span className="income-badge">{record.company_name}</span></td>
                    <td>{record.department_name}</td>
                    <td className="income-amount">{formatCurrency(record.amount)}</td>
                    <td className="income-actions">
                      <button className="btn btn-secondary" onClick={() => openEditForm(record)}><FontAwesomeIcon icon={faEdit} /> Edit</button>
                      <button className="btn btn-danger" onClick={() => handleDelete(record)}><FontAwesomeIcon icon={faTrash} /> Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="income-empty-panel">
          <strong>No income records found</strong>
          <span>No income records match the selected filters.</span>
          <button className="btn btn-primary income-new-btn" onClick={openCreateForm}>
            <FontAwesomeIcon icon={faPlus} /> Add New Income
          </button>
        </div>
      )}

      <NewIncomeModal
        isOpen={isFormOpen}
        record={editingRecord}
        companies={companies}
        departments={departments}
        onClose={closeForm}
        onSuccess={handleSaved}
      />
    </div>
  );
};

export default AnalystIncomePage;
