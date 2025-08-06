// src/components/Layout.jsx

import React from 'react';
import NavigationBar from './NavigationBar';
import { Outlet } from 'react-router-dom';
import './Layout.css'; // Optional styling

const Layout = () => {
  return (
    <div className="layout-container">
      <NavigationBar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;