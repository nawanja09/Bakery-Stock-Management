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
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/purchase/new" 
            element={
              <ProtectedRoute>
                <AddPurchase />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/purchase/history" 
            element={
              <ProtectedRoute>
                <PurchaseHistory />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/purchases/:id" 
            element={
              <ProtectedRoute>
                <PurchaseDetails />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/suppliers" 
            element={
              <ProtectedRoute>
                <Suppliers />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/items/add" 
            element={
              <ProtectedRoute>
                <AddItem />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/items" 
            element={
              <ProtectedRoute>
                <ViewItems />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/items/edit/:id" 
            element={
              <ProtectedRoute>
                <EditItem />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;