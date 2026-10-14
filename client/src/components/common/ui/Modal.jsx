import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import './ui.css';

const FOCUSABLE = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * The one dialog shell for the app.
 *
 * size: 'sm' (420px, confirmations) | 'md' (560px, simple forms) |
 *       'lg' (760px) | 'xl' (1040px, line-item editors) | 'drawer' (right side panel)
 *
 * Form dialogs should keep closeOnOverlay={false} (the default) so a stray
 * click outside does not throw away what the user typed.
 */
const Modal = ({
  open = true,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  footer,
  children,
  closeOnOverlay = false,
  closeOnEsc = true,
  className = '',
  bodyClassName = '',
  ariaLabel,
}) => {
  const titleId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';

    const firstField = dialogRef.current?.querySelector(`.ui-modal-body ${FOCUSABLE.split(', ').join(', .ui-modal-body ')}`);
    (firstField || dialogRef.current)?.focus?.();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && closeOnEsc && onClose) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
  }, [open, closeOnEsc, onClose]);

  if (!open) return null;

  const modalRoot = document.getElementById('modal-root') || document.body;

  return createPortal(
    <div
      className={`ui-modal-overlay ${size === 'drawer' ? 'is-drawer' : ''}`}
      onMouseDown={(event) => {
        if (closeOnOverlay && onClose && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`ui-modal ui-modal-${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
      >
        {(title || onClose) && (
          <header className="ui-modal-header">
            {icon && <span className="ui-modal-icon" aria-hidden="true">{icon}</span>}
            <div className="ui-modal-heading">
              {title && <h2 id={titleId}>{title}</h2>}
              {subtitle && <p>{subtitle}</p>}
            </div>
            {onClose && (
              <button type="button" className="ui-modal-close" onClick={onClose} aria-label="Close">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </header>
        )}
        <div className={`ui-modal-body ${bodyClassName}`.trim()}>{children}</div>
        {footer && <footer className="ui-modal-footer">{footer}</footer>}
      </section>
    </div>,
    modalRoot
  );
};

export default Modal;
