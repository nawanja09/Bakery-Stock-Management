import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AddPurchase from './components/purchase/NewPurchase';
import EditPurchase from './components/purchase/EditPurchase';
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
import IssueToDepartment from './components/issuance/IssueToDepartment';
import EditIssuance from './components/issuance/EditIssuance';
import IssuanceHistory from './components/issuance/IssuanceHistory';
import AddWastage from './components/wastage/AddWastage';
import WastageHistory from './components/wastage/WastageHistory';
import StockReport from './components/report/StockReport';
import Register from './components/Register';
import DepartmentIssuesReport from './components/report/DepartmentIssuesReport';
import PurchasingReport from './components/report/PurchasingReport/PurchasingReport';
import WastageReport from './components/report/WastageReport/WastageReport';
import ItemWiseStockReport from './components/report/StockReportByRangeAndItem';
import ManageUsers from './components/admin/ManageUsers';

import AddFinishedGoodsItem from './components/FinishedGoods/Item Management - FS/AddFinishedGoodsItem';
import EditFinishedGoodsItem from './components/FinishedGoods/Item Management - FS/EditFinishedGoodsItem';
import ViewFinishedGoodsItems from './components/FinishedGoods/Item Management - FS/ViewFinishedGoodsItems';
import AddFinishedGoodsOpeningBalance from './components/FinishedGoods/Opening Management - FS/AddFinishedGoodsOpeningBalance';
import FinishedGoodsOpeningBalanceHistory from './components/FinishedGoods/Opening Management - FS/FinishedGoodsOpeningBalanceHistory';
import ProductionManagement from './components/FinishedGoods/Production Management/ProductionManagement';
import ViewProduction from './components/FinishedGoods/Production Management/ViewProduction';
import EditProduction from './components/FinishedGoods/Production Management/EditProduction';
import TransfersManagement from './components/FinishedGoods/Transfers/TransfersManagement';
import ViewTransfer from './components/FinishedGoods/Transfers/ViewTransferPopup';
import EditTransfer from './components/FinishedGoods/Transfers/EditTransferPopup';
import AddTransferPopup from './components/FinishedGoods/Transfers/AddTransferPopup';
import AddFinishedGoodsWastage from './components/FinishedGoods/Wastage/AddFinishedGoodsWastage'
import FinishedGoodsWastageHistory from './components/FinishedGoods/Wastage/FinishedGoodsWastageHistory';
import ProductionWastageHistory from './components/FinishedGoods/Production Wastage/ProductionWastageHistory';
import AddProductionWastage from './components/FinishedGoods/Production Wastage/AddProductionWastage';

import './App.css';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
};

const AuthCheck = () => {
  const token = localStorage.getItem('token');
  return token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path='/register' element={<Register />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/auth-check" element={<AuthCheck />} />

          {/* Protected Routes */}  
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
            <Route path="purchase/edit/:id" element={<EditPurchase />} />
            <Route path="purchase/history" element={<PurchaseHistory />} />
            <Route path="purchase/:id" element={<PurchaseDetails />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="items/add" element={<AddItem />} />
            <Route path="items" element={<ViewItems />} />
            <Route path="items/edit/:id" element={<EditItem />} />
            <Route path="admin/password" element={<ChangePassword />} />
            <Route path="opening/add" element={<AddOpeningBalance />} />
            <Route path="opening/history" element={<OpeningBalanceHistory />} />
            <Route path="issuance/issue" element={<IssueToDepartment />} />
            <Route path="issuance/edit/:id" element={<EditIssuance />} />
            <Route path="issuance/history" element={<IssuanceHistory />} />
            <Route path="wastage/add" element={<AddWastage />} />
            <Route path="wastage/history" element={<WastageHistory />} />
            <Route path="reports/stock" element={<StockReport />} />
            <Route path="reports/department" element={<DepartmentIssuesReport />} />
            <Route path="reports/purchasing" element={<PurchasingReport />} />
            <Route path="reports/wastage" element={<WastageReport />} />
            <Route path="admin/users" element={<ManageUsers />} />
            <Route path="reports/stock/items" element={<ItemWiseStockReport/>} />

            <Route path="finished-goods/items/add" element={<AddFinishedGoodsItem />} />
            <Route path="finished-goods/items" element={<ViewFinishedGoodsItems />} />
            <Route path="finished-goods/items/edit/:id" element={<EditFinishedGoodsItem />} />
            <Route path="finished-goods/opening/add" element={<AddFinishedGoodsOpeningBalance />} />
            <Route path="finished-goods/opening/history" element={<FinishedGoodsOpeningBalanceHistory />} />
            <Route path="finished-goods/production" element={<ProductionManagement />} />
            <Route path="finished-goods/production/view/:id" element={<ViewProduction />} />
            <Route path="finished-goods/production/edit/:id" element={<EditProduction />} />
            <Route path="finished-goods/transfer" element={<TransfersManagement />} />
            <Route path="finished-goods/transfer/view/:id" element={<ViewTransfer />} />
            <Route path="finished-goods/transfer/edit/:id" element={<EditTransfer />} />
            <Route path="finished-goods/transfer/add" element={<AddTransferPopup />} />
            <Route path="finished-goods/wastage/kitchen" element={<AddFinishedGoodsWastage />} />
            <Route path="finished-goods/wastage/history" element={<FinishedGoodsWastageHistory />} />
            <Route path="finished-goods/wastage/production" element={<ProductionWastageHistory />} />
            <Route path="finished-goods/wastage/production/add" element={<AddProductionWastage />} />

          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;