import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInbox } from '@fortawesome/free-solid-svg-icons';
import './ui.css';

/** Shown instead of an empty table: what is missing and what to do next. */
const EmptyState = ({ icon = faInbox, title = 'No records found', description, action, compact = false }) => (
  <div className={`ui-empty-state ${compact ? 'is-compact' : ''}`.trim()} role="status">
    <span className="ui-empty-icon" aria-hidden="true"><FontAwesomeIcon icon={icon} /></span>
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action && <div className="ui-empty-action">{action}</div>}
  </div>
);

export default EmptyState;
