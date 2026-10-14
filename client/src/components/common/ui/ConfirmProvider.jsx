import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

const ConfirmContext = createContext(null);

// Picks a sensible title, button label and colour from the question text so
// call sites can simply swap `window.confirm(message)` for
// `await confirm(message)`.
const inferOptions = (message) => {
  const text = String(message || '').toLowerCase();
  if (/\b(delete|remove)\b/.test(text)) {
    return { title: /\bremove\b/.test(text) && !/\bdelete\b/.test(text) ? 'Remove this?' : 'Delete this?', confirmText: /\bremove\b/.test(text) && !/\bdelete\b/.test(text) ? 'Remove' : 'Delete', tone: 'danger' };
  }
  if (/\bvoid\b/.test(text)) return { title: 'Void this transaction?', confirmText: 'Void', tone: 'danger' };
  if (/\b(deactivate|disable)\b/.test(text)) return { title: 'Please confirm', confirmText: 'Deactivate', tone: 'warning' };
  return { title: 'Please confirm', confirmText: 'Confirm', tone: 'warning' };
};

/**
 * App-wide replacement for window.confirm that uses the shared ConfirmDialog.
 *   const confirm = useConfirm();
 *   if (!(await confirm('Delete this supplier?'))) return;
 *   await confirm({ title, message, confirmText, tone: 'danger' | 'warning' | 'info' })
 * Resolves true when the user confirms, false on Cancel / Esc / close.
 */
export const ConfirmProvider = ({ children }) => {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((input) => {
    const options = typeof input === 'object' && input !== null && !React.isValidElement(input)
      ? input
      : { message: input };
    if (resolverRef.current) resolverRef.current(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest({ ...inferOptions(options.message), ...options });
    });
  }, []);

  const settle = (answer) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    if (resolve) resolve(answer);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <ConfirmDialog
          title={request.title}
          message={request.message}
          tone={request.tone}
          confirmText={request.confirmText}
          cancelText={request.cancelText || 'Cancel'}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
};

// Falls back to the browser dialog when no provider is mounted (e.g. a test
// that renders a page on its own), so behaviour never silently changes.
export const useConfirm = () => {
  const confirm = useContext(ConfirmContext);
  return confirm || ((input) => Promise.resolve(window.confirm(typeof input === 'object' && input ? input.message : input)));
};
