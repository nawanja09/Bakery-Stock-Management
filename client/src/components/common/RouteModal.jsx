import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { createPortal } from 'react-dom';
import './RouteModal.css';

const OPEN_DROPDOWN_SELECTOR = '[aria-expanded="true"][role="combobox"], [role="listbox"], [role="menu"]';

const RouteModal = ({ children, title = 'Details', size = 'large' }) => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // An open dropdown (react-select, listbox, menu) uses Escape to close itself.
    // Its menu state is read in the capture phase, before the dropdown handles the
    // key and collapses, so that Escape closes only the menu and not the popup.
    let escapeHandledByDropdown = false;
    const handleKeyDownCapture = (event) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      escapeHandledByDropdown = Boolean(
        target && typeof target.closest === 'function'
          && target.closest(OPEN_DROPDOWN_SELECTOR)
      );
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || escapeHandledByDropdown) return;
      navigate(-1);
    };
    document.addEventListener('keydown', handleKeyDownCapture, true);
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDownCapture, true);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [navigate]);

  const close = () => navigate(-1);
  const modalRoot = document.getElementById('modal-root') || document.body;

  return createPortal(
    <div className="route-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section className={`route-modal route-modal-${size}`} aria-labelledby="route-modal-title">
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

export const modalRouteState = (location) => ({ backgroundLocation: location });

export default RouteModal;
