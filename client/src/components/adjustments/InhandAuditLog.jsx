// client/src/components/adjustments/InhandAuditLog.jsx
//
// Displays the immutable audit trail for a single Inhand entry.
// Fetches from GET /api/inhand/:id/audit

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHistory, faSpinner, faCheckCircle, faClock,
  faBan, faPaperPlane, faPlus, faExclamationTriangle, faSync
} from '@fortawesome/free-solid-svg-icons';
import api from '../../api';

const ACTION_META = {
  CREATED           : { label: 'Created',            icon: faPlus,               color: '#6366f1' },
  SUBMITTED         : { label: 'Submitted',           icon: faPaperPlane,         color: '#0ea5e9' },
  APPROVED          : { label: 'Approved & Posted',   icon: faCheckCircle,        color: '#22c55e' },
  CANCELLED         : { label: 'Cancelled',            icon: faBan,               color: '#ef4444' },
  REVERSED          : { label: 'Finance Reversed',    icon: faSync,               color: '#f59e0b' },
  DUPLICATE_BLOCKED : { label: 'Duplicate Blocked',   icon: faExclamationTriangle, color: '#dc2626' },
};

const InhandAuditLog = ({ inhandId }) => {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!inhandId) return;
    setLoading(true);
    api.get(`/inhand/${inhandId}/audit`)
      .then(res => setLogs(res.data || []))
      .catch(() => setError('Could not load audit log.'))
      .finally(() => setLoading(false));
  }, [inhandId]);

  if (loading) return (
    <div className="ih-audit-loading">
      <FontAwesomeIcon icon={faSpinner} spin /> Loading audit log...
    </div>
  );
  if (error) return <div className="ih-audit-error">{error}</div>;
  if (logs.length === 0) return <div className="ih-audit-empty">No audit records found.</div>;

  return (
    <div className="ih-audit-log">
      <div className="ih-audit-header">
        <FontAwesomeIcon icon={faHistory} />
        <span>Audit Trail</span>
      </div>
      <div className="ih-audit-timeline">
        {logs.map((log, idx) => {
          const meta    = ACTION_META[log.action] || { label: log.action, icon: faClock, color: '#6b7280' };
          const details = log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null;
          const isLast  = idx === logs.length - 1;
          return (
            <div key={log.id} className={`ih-audit-step ${isLast ? 'last' : ''}`}>
              <div className="ih-audit-dot" style={{ background: meta.color }}>
                <FontAwesomeIcon icon={meta.icon} />
              </div>
              <div className="ih-audit-body">
                <div className="ih-audit-action">{meta.label}</div>
                <div className="ih-audit-meta">
                  <span className="ih-audit-user">{log.performed_by_name}</span>
                  <span className="ih-audit-time">{log.performed_at}</span>
                </div>
                {details && (
                  <div className="ih-audit-details">
                    {details.amount       && <span>Amount: Rs. {parseFloat(details.amount).toFixed(2)}</span>}
                    {details.payment_type && <span>Type: {details.payment_type}</span>}
                    {details.finance_txn_id && <span>Finance Txn ID: #{details.finance_txn_id}</span>}
                    {details.reversal_txn_id && <span>Reversal Txn ID: #{details.reversal_txn_id}</span>}
                    {details.previous_status && <span>Was: {details.previous_status}</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InhandAuditLog;
