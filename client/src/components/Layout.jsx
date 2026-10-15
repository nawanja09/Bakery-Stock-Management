// src/components/Layout.jsx

import React, { useContext } from 'react';
import NavigationBar from './NavigationBar';
import { Outlet } from 'react-router-dom';
import RouteAccessGuard from './common/RouteAccessGuard';
import ViewOnlyGuard from './common/ViewOnlyGuard';
import { PageKeyContext } from './common/useModalRouting';
import './Layout.css'; // Optional styling

const Layout = () => {
  // Changes only when a route popup is left by navigating forward (after a save),
  // so the page behind it reloads; closing the popup keeps the page as it was.
  const pageKey = useContext(PageKeyContext);
  return (
    <div className="layout-container">
      <NavigationBar />
      <ViewOnlyGuard />
      <main className="main-content">
        <RouteAccessGuard>
          <Outlet key={pageKey} />
        </RouteAccessGuard>
      </main>
    </div>
  );
};

export default Layout;