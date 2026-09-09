import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faSave,
  faCalendarAlt,
  faUser,
  faBox,
  faFileAlt,
  faExclamationCircle,
  faCheckCircle
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import './Adjustments.css';

const EditAdjustment = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    date: '',
    user_name: '',
    reference_note: '',
    item_id: '',
    item_name: '',
    item_code: '',
    unit: '',
    system_qty: '',
    actual_qty: '',
    variance: '',
    unit_price: '',
    amount: '',
    reason: ''
  });

  useEffect(() => {
    const fetchAdjustment = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await api.get(`/adjustments/${id}`);
        const adjustment = response.data;

        const parsedDate = adjustment.date
          ? new Date(adjustment.date).toISOString().slice(0, 16)
          : '';

        setFormData({
          date: parsedDate,
          user_name: adjustment.user_name || '',
          reference_note: adjustment.reference_note || '',
          item_id: adjustment.item_id || '',
          item_name: adjustment.item_name || '',
          item_code: adjustment.item_code || '',
          unit: adjustment.unit || '',
          system_qty: adjustment.system_qty ?? '',
          actual_qty: adjustment.actual_qty ?? '',
          variance: adjustment.variance ?? '',
          unit_price: adjustment.unit_price ?? '',
          amount: adjustment.amount ?? '',
          reason: adjustment.reason || ''
        });
      } catch (err) {
        console.error('Error loading adjustment:', err);
        setError('Unable to load the adjustment record. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAdjustment();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleActualQtyChange = (e) => {
    const actualQty = e.target.value;
    const systemQty = parseFloat(formData.system_qty || 0);
    const unitPrice = parseFloat(formData.unit_price || 0);
    const parsedActualQty = parseFloat(actualQty);
    const variance = Number.isNaN(parsedActualQty) ? '' : (parsedActualQty - systemQty).toFixed(3);
    const amount = Number.isNaN(parsedActualQty) || Number.isNaN(unitPrice)
      ? ''
      : (parseFloat(variance || 0) * unitPrice).toFixed(2);

    setFormData((prev) => ({
      ...prev,
      actual_qty: actualQty,
      variance,
      amount
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const payload = {
        date: formData.date,
        user_name: formData.user_name,
        reference_note: formData.reference_note,
        item_id: formData.item_id,
        system_qty: formData.system_qty,
        actual_qty: formData.actual_qty,
        variance: formData.variance,
        unit_price: formData.unit_price,
        amount: formData.amount,
        reason: formData.reason
      };

      await api.put(`/adjustments/${id}`, payload);
      setSuccess('Adjustment updated successfully.');
      setTimeout(() => navigate('/adjustments/stores-adjustments'), 600);
    } catch (err) {
      console.error('Error updating adjustment:', err);
      setError('Unable to save the changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h2 style={{ margin: 0 }}>Edit Adjustment</h2>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <h2 style={{ margin: 0 }}>RM Adjustment - Edit</h2>
        </div>
        <div>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/adjustments/stores-adjustments')}>
            <FontAwesomeIcon icon={faArrowLeft} style={{ marginRight: '8px' }} /> Back to History
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', backgroundColor: '#f8d7da', color: '#721c24' }}>
          <FontAwesomeIcon icon={faExclamationCircle} style={{ marginRight: '8px' }} /> {error}
        </div>
      )}

      {success && (
        <div style={{ padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--spacing-md)', backgroundColor: '#d4edda', color: '#155724' }}>
          <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: '8px' }} /> {success}
        </div>
      )}

      <form className="adjustments-form" onSubmit={handleSubmit}>
        <div className="card" style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
          <h3 className="form-section-title">
            <FontAwesomeIcon icon={faFileAlt} /> Adjustment Details
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faCalendarAlt} /> Date & Time
              </label>
              <input type="datetime-local" name="date" value={formData.date} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faUser} /> Adjusted By
              </label>
              <input type="text" name="user_name" value={formData.user_name} onChange={handleChange} required />
            </div>

            <div className="form-group full-width">
              <label>
                <FontAwesomeIcon icon={faFileAlt} /> Reference Note
              </label>
              <input type="text" name="reference_note" value={formData.reference_note} onChange={handleChange} placeholder="Optional reference note" />
            </div>

            <div className="form-group">
              <label>
                <FontAwesomeIcon icon={faBox} /> Item
              </label>
              <input type="text" value={`${formData.item_code || ''} ${formData.item_name ? `- ${formData.item_name}` : ''}`.trim()} readOnly className="readonly-input" />
            </div>

            <div className="form-group">
              <label>System Qty</label>
              <input type="number" name="system_qty" value={formData.system_qty} onChange={handleChange} step="0.001" required />
            </div>

            <div className="form-group">
              <label>Actual Qty</label>
              <input type="number" name="actual_qty" value={formData.actual_qty} onChange={handleActualQtyChange} step="0.001" required />
            </div>

            <div className="form-group">
              <label>Unit Price</label>
              <input type="number" name="unit_price" value={formData.unit_price} onChange={handleChange} step="0.01" required />
            </div>

            <div className="form-group">
              <label>Variance</label>
              <input type="text" name="variance" value={formData.variance} readOnly className="readonly-input" />
            </div>

            <div className="form-group">
              <label>Amount</label>
              <input type="text" name="amount" value={formData.amount} readOnly className="readonly-input" />
            </div>

            <div className="form-group full-width">
              <label>Reason</label>
              <textarea name="reason" value={formData.reason} onChange={handleChange} rows="3" required />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/adjustments/stores-adjustments')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-success" disabled={saving}>
            {saving ? 'Saving...' : <><FontAwesomeIcon icon={faSave} /> Save Changes</>}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditAdjustment;
