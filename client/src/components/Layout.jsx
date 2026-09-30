// src/components/Layout.jsx

import React from 'react';
import NavigationBar from './NavigationBar';
import { Outlet } from 'react-router-dom';
import RouteAccessGuard from './common/RouteAccessGuard';
import ViewOnlyGuard from './common/ViewOnlyGuard';
import './Layout.css'; // Optional styling

const Layout = () => {
  return (
    <div className="layout-container">
      <NavigationBar />
      <ViewOnlyGuard />
      <main className="main-content">
        <RouteAccessGuard>
          <Outlet />
        </RouteAccessGuard>
      </main>
    </div>
  );
};

export default Layout;