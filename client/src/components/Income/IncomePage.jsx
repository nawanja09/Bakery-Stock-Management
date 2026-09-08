// src/components/Income/IncomePage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSackDollar, faPlus, faSpinner, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { formatCurrency } from '../../utils/formatters';
import { usePopup } from '../context/PopupContext';
import NewIncomeModal from './NewIncomeModal';
import './Income.css';

const ALLOWED_COMPANY_NAMES = ['JH', 'RD'];
const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-GB') : '-');

const IncomePage = () => {
  const { showPopup } = usePopup();
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadIncomes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/incomes');
      setRecords(response.data.records || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to load income records.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const [companyRes, deptRes] = await Promise.all([
        api.get('/companies'),
        api.get('/departments')
      ]);
      const allCompanies = companyRes.data || [];
      setCompanies(allCompanies.filter((company) => ALLOWED_COMPANY_NAMES.includes((company.name || '').toUpperCase())));
      setDepartments(deptRes.data || []);
    } catch (requestError) {
      showPopup('error', 'Unable to load companies or departments for the form.');
    }
  }, [showPopup]);

  useEffect(() => {
    loadIncomes();
    loadOptions();
  }, [loadIncomes, loadOptions]);

  const handleCreated = (record) => {
    // Add the new record immediately (optimistic) and keep newest-first order.
    setRecords((prev) => [
      { ...record, id: record.id },
      ...prev
    ].sort((a, b) => (b.income_date > a.income_date ? 1 : b.income_date < a.income_date ? -1 : b.id - a.id)));
  };

  const totalAmount = records.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  return (
    <div className="page-container income-page">
      <header className="page-header income-header">
        <div>
          <h2><FontAwesomeIcon icon={faSackDollar} /> Income</h2>
        </div>
        <div className="income-header-actions">
          <button className="btn btn-secondary" onClick={loadIncomes} disabled={loading}>
            <FontAwesomeIcon icon={faRotateRight} /> Refresh
          </button>
          <button className="btn btn-primary income-new-btn" onClick={() => setIsModalOpen(true)}>
            <FontAwesomeIcon icon={faPlus} /> New Income
          </button>
        </div>
      </header>

      <div className="income-summary-grid">
        <div className="card income-summary-card">
          <span>Total Income Recorded</span>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>
        <div className="card income-summary-card">
          <span>Records</span>
          <strong>{records.length}</strong>
        </div>
      </div>

      {error && <div className="income-error" role="alert">{error}</div>}

      <div className="card income-table-card">
        <div className="income-table-scroll">
          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Department</th>
                <th className="income-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" className="income-empty"><FontAwesomeIcon icon={faSpinner} spin /> Loading income records...</td></tr>
              ) : records.length ? (
                records.map((record) => (
                  <tr key={record.id}>
                    <td>{formatDate(record.income_date)}</td>
                    <td><span className="income-badge">{record.company_name}</span></td>
                    <td>{record.department_name}</td>
                    <td className="income-amount">{formatCurrency(record.amount)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="4" className="income-empty">No income records yet. Click "New Income" to add one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewIncomeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        companies={companies}
        departments={departments}
        onSuccess={handleCreated}
      />
    </div>
  );
};

export default IncomePage;