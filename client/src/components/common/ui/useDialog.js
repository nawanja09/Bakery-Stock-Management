import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const FIELD = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

// An open dropdown (react-select, listbox, menu) uses Escape to close itself;
// the dialog must not close with it.
const OPEN_DROPDOWN = '[aria-expanded="true"][role="combobox"], [role="listbox"], [role="menu"]';

// Open dialogs, innermost last. Escape and Tab belong to the innermost one only,
// so a confirmation opened from a form popup does not close the form as well.
const openDialogs = [];

const isVisible = (el) => !(el.hidden || el.closest('[hidden]') || el.getAttribute('aria-hidden') === 'true');

export const focusableIn = (root) => (root ? [...root.querySelectorAll(FOCUSABLE)].filter(isVisible) : []);

/**
 * Dialog behaviour shared by the <Modal> shell, RouteModal and the legacy popups:
 * Escape closes (unless a dropdown inside handled it), focus moves into the dialog
 * on open and returns to the trigger on close, Tab is kept inside, and the page
 * behind does not scroll.
 *
 * ref       - the dialog element
 * open      - whether the dialog is shown
 * onClose   - called on Escape; read through a ref so a new function on every
 *             parent render does not re-run the effect (and steal focus)
 * closeOnEsc
 * initialFocus - CSS selector of the area whose first field gets focus
 */
const useDialog = (ref, { open = true, onClose, closeOnEsc = true, initialFocus } = {}) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const entry = {};
    openDialogs.push(entry);
    const isInnermost = () => openDialogs[openDialogs.length - 1] === entry;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const dialog = ref.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const area = (initialFocus && dialog.querySelector(initialFocus)) || dialog;
      const target = area.querySelector(FIELD) || focusableIn(area)[0] || dialog;
      if (target === dialog && !dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
      target.focus?.();
    }

    let escapeHandledByDropdown = false;
    const onKeyDownCapture = (event) => {
      if (!isInnermost()) return;
      if (event.key === 'Escape') {
        const target = event.target;
        escapeHandledByDropdown = Boolean(target?.closest?.(OPEN_DROPDOWN));
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const items = focusableIn(ref.current);
      if (items.length === 0) {
        event.preventDefault();
        ref.current.focus?.();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !ref.current.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || !isInnermost() || escapeHandledByDropdown) return;
      if (closeOnEsc && onCloseRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDownCapture, true);
      document.removeEventListener('keydown', onKeyDown);
      openDialogs.splice(openDialogs.indexOf(entry), 1);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && document.contains(previousFocus) && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };
    // initialFocus is a constant per dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closeOnEsc]);
};

export default useDialog;
