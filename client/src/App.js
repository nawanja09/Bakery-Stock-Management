// src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AddPurchase from './components/purchase/NewPurchase';
import PurchaseHistory from './components/purchase/PurchaseHistory';
import PurchaseDetails from './components/purchase/PurchaseDetails';
import Suppliers from './components/Suppliers/Suppliers';
import AddItem from './components/Items/AddNewItems';
import ViewItems from './components/Items/ViewItems';
import EditItem from './components/Items/EditItem';
import ChangePassword from './components/ChangePassword';
import Layout from './components/Layout';
import AddOpeningBalance from './components/OpeningBalance/AddOpeningBalance';
import OpeningBalanceHistory from './components/OpeningBalance/OpeningBalanceHistory';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="purchase/new" element={<AddPurchase />} />
            <Route path="purchase/history" element={<PurchaseHistory />} />
            <Route path="purchase/:id" element={<PurchaseDetails />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="items/add" element={<AddItem />} />
            <Route path="items" element={<ViewItems />} />
            <Route path="items/edit/:id" element={<EditItem />} />
            <Route path="admin/password" element={<ChangePassword />} />
            <Route path="opening/add" element={<AddOpeningBalance />} />
            <Route path="opening/history" element={<OpeningBalanceHistory />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
