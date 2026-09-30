// Blocks pages the logged-in role may not open - including when the URL is
// typed in by hand - using the central rules in config/rolePermissions.js.
// Mounted once in Layout, so it covers every protected route; App.js also uses
// it for the per-module route wrappers.
//
//  * denied page      -> "Access Denied" page (with a way back to the Dashboard)
//  * unknown role     -> "Access Denied" too (no redirect, so no redirect loop
//                        for roles such as Staff / Manager / User that have no
//                        navigation privileges defined)
// The API enforces the same rules independently (server/middleware/authorizeApi.js).

import React from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../../hooks/usePermissions';
import AccessDenied from './AccessDenied';

const RouteAccessGuard = ({ children }) => {
  const location = useLocation();
  const { role, canAccessPath } = usePermissions();

  if (!canAccessPath(location.pathname)) {
    return <AccessDenied canGoBack={!!role && location.pathname !== '/dashboard'} />;
  }
  return children;
};

export default RouteAccessGuard;
