// src/context/PopupContext.jsx
import React, { createContext, useState, useContext } from 'react';
import Popup from '../common/Popup';

const PopupContext = createContext();

export const PopupProvider = ({ children }) => {
  const [popup, setPopup] = useState({
    show: false,
    type: 'success',
    message: ''
  });

  const showPopup = (type, message) => {
    setPopup({ show: true, type, message });
  };

  const hidePopup = () => {
    setPopup({ ...popup, show: false });
  };

  return (
    <PopupContext.Provider value={{ showPopup, hidePopup }}>
      {children}
      {popup.show && (
        <Popup 
          type={popup.type} 
          message={popup.message} 
          onClose={hidePopup} 
        />
      )}
    </PopupContext.Provider>
  );
};

export const usePopup = () => useContext(PopupContext);