import React, { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { createPortal } from 'react-dom';
import useDialog from './ui/useDialog';
import './RouteModal.css';

/**
 * Shell for a route opened as a popup over the page it was opened from.
 * Escape (but not Escape inside an open dropdown), focus, the Tab trap and the
 * scroll lock come from useDialog.
 *
 * closeOnOverlay: only for read-only popups. Form popups keep the backdrop inert
 * so a stray click outside does not throw away what the user typed.
 */
const RouteModal = ({ children, title = 'Details', size = 'large', closeOnOverlay = false }) => {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const close = useCallback(() => navigate(-1), [navigate]);

  useDialog(sectionRef, { onClose: close, initialFocus: '.route-modal-body' });

  const modalRoot = document.getElementById('modal-root') || document.body;

  return createPortal(
    <div className="route-modal-overlay" onMouseDown={(event) => {
      if (closeOnOverlay && event.target === event.currentTarget) close();
    }}>
      <section
        ref={sectionRef}
        className={`route-modal route-modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-modal-title"
        tabIndex={-1}
      >
        <header className="route-modal-header">
          <div>
            <span className="route-modal-kicker">Bakery stock management</span>
            <h2 id="route-modal-title">{title}</h2>
          </div>
          <button type="button" className="route-modal-close" onClick={close} aria-label="Close">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </header>
        <div className="route-modal-body">{children}</div>
      </section>
    </div>,
    modalRoot
  );
};

// A popup opened from inside another popup keeps the original page behind it.
export const modalRouteState = (location) => ({
  backgroundLocation: location.state?.backgroundLocation || location,
});

export default RouteModal;
