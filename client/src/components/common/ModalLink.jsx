import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const ModalLink = ({ children, to, state, ...props }) => {
  const location = useLocation();
  return (
    <Link
      {...props}
      to={to}
      state={{ ...state, backgroundLocation: location }}
    >
      {children}
    </Link>
  );
};

export default ModalLink;
