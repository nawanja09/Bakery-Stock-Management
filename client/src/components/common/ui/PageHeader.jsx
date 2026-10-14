import React from 'react';
import './ui.css';

/**
 * Standard top-of-page header: title (+ optional count / status badge),
 * one line of context underneath, and the page's actions on the right.
 * Keep a single primary button in `actions`.
 */
const PageHeader = ({ eyebrow, title, subtitle, badge, actions, children, className = '' }) => (
  <header className={`ui-page-header ${className}`.trim()}>
    <div className="ui-page-header-text">
      {eyebrow && <span className="ui-page-eyebrow">{eyebrow}</span>}
      <div className="ui-page-title-row">
        <h1 className="ui-page-title">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="ui-page-subtitle">{subtitle}</p>}
      {children}
    </div>
    {actions && <div className="ui-page-actions">{actions}</div>}
  </header>
);

export default PageHeader;
