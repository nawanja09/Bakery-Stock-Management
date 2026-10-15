// src/components/Income/NewIncomeModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSave, faSpinner, faSackDollar } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import useDialog from '../common/ui/useDialog';

const defaultForm = () => ({
  income_date: dayjs().format('YYYY-MM-DD'),
  company_id: '',
  department_id: '',
  amount: ''
});

const NewIncomeModal = ({ isOpen, record, onClose, companies = [], departments = [], onSuccess }) => {
  const { showPopup } = usePopup();
  const [formData, setFormData] = useState(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);
  // Escape closes (not while saving); focus moves in; Tab and page scroll stay put.
  useDialog(dialogRef, { open: Boolean(isOpen), onClose: submitting ? undefined : onClose });

  useEffect(() => {
    if (isOpen) {
      setFormData(record ? {
        income_date: record.income_date || '',
        company_id: record.company_id || '',
        department_id: record.department_id || '',
        amount: record.amount || ''
      } : defaultForm());
    }
  }, [isOpen, record]);

  if (!isOpen) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.income_date) return showPopup('error', 'Date is required');
    if (!formData.company_id) return showPopup('error', 'Please select a company');
    if (!formData.department_id) return showPopup('error', 'Please select a department');
    const amt = parseFloat(formData.amount);
    if (!amt || amt <= 0) return showPopup('error', 'Amount must be greater than 0');

    setSubmitting(true);
    try {
      const payload = {
        income_date: formData.income_date,
        company_id: Number(formData.company_id),
        department_id: Number(formData.department_id),
        amount: amt
      };
      const response = record
        ? await api.put(`/incomes/${record.id}`, payload)
        : await api.post('/incomes', payload);

      if (onSuccess) onSuccess(response.data.record, Boolean(record));
      setFormData(defaultForm());
      onClose();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to save income record');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    // Backdrop is inert: an outside click must not discard what was typed.
    <div className="inc-overlay">
      <div ref={dialogRef} className="inc-modal" role="dialog" aria-modal="true" aria-label={record ? 'Edit Income' : 'Add New Income'}>
        <div className="inc-header">
          <h3><FontAwesomeIcon icon={faSackDollar} /> {record ? 'Edit Income' : 'Add New Income'}</h3>
          <button type="button" className="inc-close" onClick={onClose}><FontAwesomeIcon icon={faTimes} /></button>
        </div>

        <form className="inc-body" onSubmit={handleSubmit} id="new-income-form">
          <div className="inc-form-row">
            <div className="inc-form-group">
              <label htmlFor="income_date">Date *</label>
              <input
                id="income_date"
                type="date"
                name="income_date"
                value={formData.income_date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="inc-form-group">
              <label htmlFor="amount">Amount *</label>
              <input
                id="amount"
                type="number"
                name="amount"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="inc-amount-input"
                value={formData.amount}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="inc-form-row">
            <div className="inc-form-group">
              <label htmlFor="company_id">Company *</label>
              <select id="company_id" name="company_id" value={formData.company_id} onChange={handleChange} required>
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="inc-form-group">
              <label htmlFor="department_id">Dept *</label>
              <select id="department_id" name="department_id" value={formData.department_id} onChange={handleChange} required>
                <option value="">Select department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
            </div>
          </div>
        </form>

        <div className="inc-footer">
          <button type="button" className="btn btn-secondary inc-btn-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" form="new-income-form" className="btn btn-primary inc-btn-submit" disabled={submitting}>
            <FontAwesomeIcon icon={submitting ? faSpinner : faSave} spin={submitting} /> Save Income
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NewIncomeModal;