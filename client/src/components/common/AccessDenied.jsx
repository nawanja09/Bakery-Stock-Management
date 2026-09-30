// Shown when the logged-in role may not open the requested page (for example
// after typing a URL by hand). Uses the app's existing page/button classes.

import React from 'react';
import { useNavigate } from 'react-router-dom';

const AccessDenied = ({ canGoBack = true }) => {
  const navigate = useNavigate();
  return (
    <div className="page-shell" role="alert" style={{ textAlign: 'center', padding: '64px 16px' }}>
      <h1 style={{ marginBottom: 8 }}>Access Denied</h1>
      <p style={{ marginBottom: 20 }}>You do not have permission to access this page.</p>
      {canGoBack && (
        <button type="button" className="btn btn-primary" onClick={() => navigate('/dashboard', { replace: true })}>
          Go to Dashboard
        </button>
      )}
    </div>
  );
};

export default AccessDenied;
