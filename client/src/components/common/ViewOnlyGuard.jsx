// Hides data-changing controls (Add / Edit / Delete / Approve / Pay / Save ...)
// for view-only roles such as QB, on every page, without touching each page.
//
//  * Only mounts its observer for view-only roles - all other roles are untouched.
//  * The sidebar and the global popup dialogs are never scanned.
//  * This is a UI convenience; the API independently rejects every POST / PUT /
//    PATCH / DELETE from view-only roles (server/middleware/authorizeApi.js).

import { useEffect } from 'react';
import usePermissions from '../../hooks/usePermissions';
import { CONTROL_SELECTOR, isActionControl } from './viewOnlyMatcher';

const HIDDEN_ATTR = 'data-view-only-hidden';
const STYLE_ID = 'view-only-guard-style';
const SKIP_CONTAINERS = '.sidebar, .popup-overlay, [data-view-only-exempt]';

const hideIfAction = (el) => {
  if (el.hasAttribute(HIDDEN_ATTR) || el.closest(SKIP_CONTAINERS)) return;
  if (isActionControl(el)) el.setAttribute(HIDDEN_ATTR, 'true');
};

const scan = (root) => {
  if (!root || root.nodeType !== 1) return;
  if (root.matches && root.matches(CONTROL_SELECTOR)) hideIfAction(root);
  if (root.querySelectorAll) root.querySelectorAll(CONTROL_SELECTOR).forEach(hideIfAction);
};

const ViewOnlyGuard = () => {
  const { isViewOnly } = usePermissions();

  useEffect(() => {
    if (!isViewOnly) return undefined;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `[${HIDDEN_ATTR}] { display: none !important; }`;
      document.head.appendChild(style);
    }

    scan(document.body);

    let pending = new Set();
    let frame = null;
    const flush = () => {
      frame = null;
      const nodes = pending;
      pending = new Set();
      nodes.forEach(scan);
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) pending.add(n); });
        // Text / attribute updates on an existing control (e.g. a label that changes)
        if (m.type === 'characterData' && m.target.parentElement) pending.add(m.target.parentElement);
      });
      if (pending.size && frame === null) frame = window.requestAnimationFrame(flush);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => el.removeAttribute(HIDDEN_ATTR));
    };
  }, [isViewOnly]);

  return null;
};

export default ViewOnlyGuard;
