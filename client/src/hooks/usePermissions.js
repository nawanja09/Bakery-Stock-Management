// client/src/hooks/usePermissions.js
//
// React access to the central role-permission config for the logged-in user.
// The role is re-read from the stored auth data on every render, so a fresh
// login (or a refresh) always yields that user's permissions, and changes made
// in another browser tab (logout / login as someone else) trigger a re-render.

import { useEffect, useReducer } from 'react';
import {
  getAuthRole,
  getAuthUsername,
  getRawAuthRole,
  getRoleModules,
  hasModule,
  canWrite,
  isViewOnlyRole,
  canAccessPath,
  canAccessAnyPath,
  canSeeNavModule,
  getModuleLanding
} from '../config/rolePermissions';

export const usePermissions = () => {
  const [, forceRender] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    const onStorage = (event) => {
      if (!event.key || event.key === 'token' || event.key === 'user') forceRender();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const role = getAuthRole();

  return {
    role,                                   // canonical role, e.g. 'QB' (null if unknown)
    username: getAuthUsername(),
    rawRole: getRawAuthRole(),              // as stored, e.g. 'View Only'
    modules: getRoleModules(role),
    isViewOnly: isViewOnlyRole(role),
    canWrite: canWrite(role),               // false for QB
    hasModule: (moduleName) => hasModule(role, moduleName),
    canAccessPath: (path) => canAccessPath(role, path),
    canAccessAnyPath: (paths) => canAccessAnyPath(role, paths),
    canSeeNavModule: (navKey) => canSeeNavModule(role, navKey),
    getModuleLanding: (navKey) => getModuleLanding(role, navKey)
  };
};

export default usePermissions;
