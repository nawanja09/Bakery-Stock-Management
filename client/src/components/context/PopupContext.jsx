// src/context/PopupContext.jsx
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Popup from '../common/Popup';

const PopupContext = createContext();

export const PopupProvider = ({ children }) => {
  const [popup, setPopup] = useState({
    show: false,
    type: 'success',
    message: '',
    title: '',
    confirmText: 'Continue',
    duration: 4500
  });

  const hidePopup = useCallback(() => {
    setPopup((prev) => ({ ...prev, show: false }));
  }, []);

  const showPopup = (type, message, options = {}) => {
    setPopup({
      show: true,
      type,
      message,
      title: options.title || '',
      confirmText: options.confirmText || 'Continue',
      duration: options.duration ?? (type === 'success' ? 4500 : type === 'error' ? 5500 : 5000)
    });
  };

  // A change refused because its month is closed (api.js): always say why, whatever the page shows.
  useEffect(() => {
    const onPeriodClosed = (event) => setPopup({
      show: true,
      type: 'error',
      title: 'Cannot save: period closed',
      message: event.detail?.message || 'This month is closed, so it cannot be changed.',
      confirmText: 'OK',
      duration: 10000
    });
    window.addEventListener('bsms:period-closed', onPeriodClosed);
    return () => window.removeEventListener('bsms:period-closed', onPeriodClosed);
  }, []);

  useEffect(() => {
    if (!popup.show) {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      return;
    }

    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    };
  }, [popup.show]);

  const modalRoot = typeof document !== 'undefined' ? document.getElementById('modal-root') || document.body : null;

  return (
    <PopupContext.Provider value={{ showPopup, hidePopup }}>
      {children}
      {popup.show && modalRoot ? createPortal(
        <Popup
          type={popup.type}
          title={popup.title}
          message={popup.message}
          onClose={hidePopup}
          confirmText={popup.confirmText}
          duration={popup.duration}
        />,
        modalRoot
      ) : null}
    </PopupContext.Provider>
  );
};

export const usePopup = () => useContext(PopupContext);