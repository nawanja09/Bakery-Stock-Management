// client/src/components/VatRateSettings/VatRateSettings.jsx
//
// Management setting for the system-wide VAT rate used across Purchases and
// Expenses (server/services/vatSettings.js). Everyone with access to the
// Raw Material / Expenses / VAT modules can see the current rate; only
// Admin / Super Admin can change it (enforced server-side, config/rolePermissions.js).
import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave, faCalculator } from '@fortawesome/free-solid-svg-icons';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import usePermissions from '../../hooks/usePermissions';
import { ROLES } from '../../config/rolePermissions';
import { PageHeader } from '../common/ui';
import { invalidateVatRateCache } from '../../utils/vatRate';
import './VatRateSettings.css';

const errorText = (error, fallback) => error?.response?.data?.error || fallback;

const VatRateSettings = () => {
  const { showPopup } = usePopup();
  const { role } = usePermissions();
  const canEdit = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;

  const [currentRate, setCurrentRate] = useState(null);
  const [inputRate, setInputRate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings/vat-rate');
      const rate = parseFloat(response.data?.vat_rate);
      setCurrentRate(Number.isFinite(rate) ? rate : 18);
      setInputRate(Number.isFinite(rate) ? String(rate) : '18');
    } catch (error) {
      showPopup('error', errorText(error, 'Could not load the VAT rate'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (event) => {
    event.preventDefault();
    const rate = parseFloat(inputRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      showPopup('error', 'Enter a VAT rate between 0 and 100');
      return;
    }

    setSaving(true);
    try {
      await api.put('/settings/vat-rate', { vat_rate: rate });
      invalidateVatRateCache();
      setCurrentRate(rate);
      showPopup('success', 'VAT rate updated successfully');
    } catch (error) {
      showPopup('error', errorText(error, 'Could not update the VAT rate'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="VAT Rate Settings"
        subtitle="The default VAT % applied to new Purchases, Purchase Returns and Expenses."
      />

      <div className="card vat-rate-card">
        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="vat-rate-current">
              <span className="icon-container"><FontAwesomeIcon icon={faCalculator} /></span>
              <div>
                <div className="report-summary-label">Current VAT Rate</div>
                <div className="report-summary-value">{currentRate}%</div>
              </div>
            </div>

            {canEdit ? (
              <form onSubmit={handleSave} className="vat-rate-form">
                <label htmlFor="vat_rate_input">New VAT Rate (%)</label>
                <div className="vat-rate-form-row">
                  <input
                    id="vat_rate_input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={inputRate}
                    onChange={(e) => setInputRate(e.target.value)}
                    className="report-filter-input"
                  />
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    <FontAwesomeIcon icon={faSave} /> {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
                <p className="vat-rate-note">
                  This only changes the default used for new invoices going forward -
                  purchases and returns already saved keep the rate they were created with.
                </p>
              </form>
            ) : (
              <p className="vat-rate-note">Only Admin / Super Admin can change the VAT rate.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VatRateSettings;
