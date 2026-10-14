import React from 'react';
import './ui.css';

// One colour per meaning, everywhere in the app.
const TONE_BY_STATUS = {
  approved: 'success', paid: 'success', completed: 'success', settled: 'success', active: 'success',
  received: 'success', released: 'success', confirmed: 'success', cleared: 'success',
  pending: 'warning', partial: 'warning', 'partially paid': 'warning', 'partially settled': 'warning',
  unpaid: 'warning', 'awaiting approval': 'warning', submitted: 'warning', hold: 'warning', 'on hold': 'warning',
  rejected: 'danger', cancelled: 'danger', canceled: 'danger', overdue: 'danger', inactive: 'danger',
  returned: 'danger', bounced: 'danger', void: 'danger',
  draft: 'neutral', new: 'info', open: 'info', issued: 'info',
};

export const statusTone = (status) => TONE_BY_STATUS[String(status ?? '').trim().toLowerCase()] || 'neutral';

const StatusBadge = ({ status, tone, children, className = '' }) => {
  const label = children ?? status;
  const resolvedTone = tone || statusTone(status);
  return (
    <span className={`ui-status-badge tone-${resolvedTone} ${className}`.trim()}>
      <span className="ui-status-dot" aria-hidden="true" />
      {label}
    </span>
  );
};

export default StatusBadge;
