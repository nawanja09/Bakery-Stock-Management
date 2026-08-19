import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import PurchaseReport from './components/report/PurchaseReport/PurchaseReport';
import WastageReport from './components/report/WastageReport/WastageReport';
import ItemWiseStockReport from './components/report/StockReportByRangeAndItem';
import ManageUsers from './components/admin/ManageUsers';

import ItemTypes from './components/RawMaterial/ItemTypes/ItemTypes';
import Departments from './components/RawMaterial/Departments/Departments';
import Companies from './components/RawMaterial/Companies/Companies';
import ExpenseTypeManagement from './components/RawMaterial/ExpenseTypes/ExpenseTypeManagement';
import ExpensePayeeManagement from './components/RawMaterial/ExpensePayees/ExpensePayeeManagement';
import BankChargesTypeManagement from './components/RawMaterial/BankChargesType/BankChargesTypeManagement';

import AddFinishedGoodsItem from './components/FinishedGoods/Item Management - FS/AddFinishedGoodsItem';
import EditFinishedGoodsItem from './components/FinishedGoods/Item Management - FS/EditFinishedGoodsItem';
import ViewFinishedGoodsItems from './components/FinishedGoods/Item Management - FS/ViewFinishedGoodsItems';
import ViewFinishedGoodsItem from './components/FinishedGoods/Item Management - FS/ViewFinishedGoodsItem';
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
import ProductionReport from './components/FinishedGoods/Reports/ProductionReport';
import KitchenWastageReport from './components/FinishedGoods/Reports/WastageReport';
import TransferReport from './components/FinishedGoods/Reports/TransferReport';
import FinishedGoodsStockReport from './components/FinishedGoods/Reports/StockReport';

import CalculateCost from './components/CostCalculator/CalculateCost';
import SavedCosting from './components/CostCalculator/SavedCosting';
import DepartmentUsageReport from './components/report/DepartmentUsageReport';
import AddFinishedGoodsSale from './components/FinishedGoods/Sales/AddFinishedGoodsSale';
import FinishedGoodsSalesHistory from './components/FinishedGoods/Sales/FinishedGoodsSalesHistory';

import StockSummary from './components/FinishedGoods/Reports/StockSummary';
import AddReturn from './components/returns/AddReturn';
import ReturnsHistory from './components/returns/ReturnsHistory';
import BakeryStockReport from './components/FinishedGoods/Reports/BakeryStockReport';

import Locations from './components/Cutlery/Locations/Locations';
import Assets from './components/Cutlery/Assets/Assets';
import ViewAsset from './components/Cutlery/Assets/ViewAsset';
import EditAsset from './components/Cutlery/Assets/EditAsset';
import Transfers from './components/Cutlery/Transfers/Transfers';
import ViewCutleryTransfer from './components/Cutlery/Transfers/ViewTransfer';
import Purchases from './components/Cutlery/Purchases/Purchases';
import Damages from './components/Cutlery/Damages/Damages';
import CutleryStockReport from './components/Cutlery/Reports/CutleryStockReport';

import VATReport from './components/report/VATReport';

import AddPurchaseReturn from './components/purchasereturn/AddPurchaseReturn';
import PurchaseReturnHistory from './components/purchasereturn/PurchaseReturnHistory';
import PurchaseVATReport from './components/report/PurchaseVATReport';

import NonPaidPurchases from './components/purchase/NonPaidPurchases';

import PettyCash from './components/Expenses/PettyCash';
import Reimbursement from './components/Expenses/Reimbursement';
import NewExpenses from './components/Expenses/NewExpenses';
import BankCharges from './components/Expenses/BankCharges';

import BankDetails from './components/Expenses/BankDetails';
import Payees from './components/Expenses/Payees';
import ExpensesReport from './components/Expenses/Reports/ExpensesReport';

import EditWastage from './components/wastage/EditWastage';

import StoresBalance from './components/adjustments/StoresBalance';
import StoresAdjustments from './components/adjustments/StoresAdjustments';
import EditAdjustment from './components/adjustments/EditAdjustment';
import PaymentMethodManagement from './components/adjustments/PaymentMethodManagement';
import InhandAdjustments from './components/adjustments/InhandAdjustments';

import DepartmentReturnItemWiseReport from './components/report/DepartmentReturnItemWiseReport';

import LastIssueDateReport from './components/Analysis/LastIssueDateReport';

import CashLedger from './components/Finance/CashLedger';
import CashReceive from './components/Finance/CashReceive';
import BankLedger from './components/Finance/BankLedger';
import BankReceive from './components/Finance/BankReceive';
import FundTransfer from './components/Finance/FundTransfer';

import BankTransfer from './components/Finance/BankTransfer';
import ReceiveTypeManagement from './components/Finance/ReceiveTypeManagement';

import FGRecipes from './components/FGProduction/Recipes';
import FGRecipeReport from './components/FGProduction/FGRecipesReports';

import './App.css';

const RootRedirect = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  return <Navigate to="/login" replace />;
};

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  
  // Always redirect root ("/") to login, regardless of auth status
  if (location.pathname === '/') {
    return <RootRedirect />;
  }

  return token ? children : <Navigate to="/login" state={{ from: location }} replace />;
};

const getStoredUserRole = () => {
  try {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser).role : null;
  } catch (e) {
    return null;
  }
};

const isRestrictedStoreRole = (role) => {
  if (!role) return false;
  return role === 'Store Keeper' || role === 'Stores';
};

// Blocks direct URL navigation into the Adjustments module for Store Keeper
// accounts (the API itself also rejects these requests server-side).
const AdjustmentsRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (isRestrictedStoreRole(getStoredUserRole())) return <Navigate to="/dashboard" replace />;
  return children;
};

// Blocks direct URL navigation into the Finance module for non-Admin/Accountant roles
const FinanceRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  const role = getStoredUserRole();
  if (role !== 'Admin' && role !== 'Accountant') return <Navigate to="/dashboard" replace />;
  return children;
};

// Stores users cannot access the Expenses module directly.
const ExpensesRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (isRestrictedStoreRole(getStoredUserRole())) return <Navigate to="/dashboard" replace />;
  return children;
};

const AuthCheck = () => {
  const token = localStorage.getItem('token');
  return token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
};

// Prevents already-logged-in users from accessing /login or /register.
const PublicOnlyRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  if (token) {
    const searchParams = new URLSearchParams(location.search);
    const redirectTo = searchParams.get('redirect') || '/dashboard';
    return <Navigate to={redirectTo} replace />;
  }
  return children;
};

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path='/register' element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
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
            <Route path="item-types" element={<ItemTypes />} />
            <Route path="departments" element={<Departments />} />
            <Route path="companies" element={<Companies />} />
            <Route path="expense-types-management" element={<ExpenseTypeManagement />} />
            <Route path="expense-payees-management" element={<ExpensePayeeManagement />} />
            <Route path="bank-charges-type-management" element={<BankChargesTypeManagement />} />
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
            <Route path="reports/purchase-report" element={<PurchaseReport />} />
            <Route path="reports/wastage" element={<WastageReport />} />
            <Route path="admin/users" element={<ManageUsers />} />
            <Route path="reports/stock/items" element={<ItemWiseStockReport/>} />

            <Route path="finished-goods/items/add" element={<AddFinishedGoodsItem />} />
            <Route path="finished-goods/items" element={<ViewFinishedGoodsItems />} />
            <Route path="finished-goods/items/edit/:id" element={<EditFinishedGoodsItem />} />
            <Route path="finished-goods/items/view/:id" element={<ViewFinishedGoodsItem />} />
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

            <Route path="finished-goods/reports/stock" element={<FinishedGoodsStockReport />} />
            <Route path="finished-goods/reports/production" element={<ProductionReport />} />
            <Route path="finished-goods/reports/wastage" element={<KitchenWastageReport />} />
            <Route path="finished-goods/reports/transfer" element={<TransferReport />} />

            <Route path="cost-calculator/calculate" element={<CalculateCost />} />
            <Route path="cost-calculator/saved" element={<SavedCosting />} />
            <Route path="/reports/department-usage" element={<DepartmentUsageReport />} />
            <Route path="finished-goods/sales/new" element={<AddFinishedGoodsSale />} />
            <Route path="finished-goods/sales/history" element={<FinishedGoodsSalesHistory />} />

            <Route path="finished-goods/reports/stock/summary" element={<StockSummary />} />
            <Route path="returns/add" element={<AddReturn />} />
            <Route path="returns/history" element={<ReturnsHistory />} />
            <Route path="finished-goods/reports/bakery-stock" element={<BakeryStockReport />} />

            <Route path="cutlery/locations" element={<Locations />} />
            <Route path="cutlery/assets" element={<Assets />} />
            <Route path="cutlery/assets/view/:id" element={<ViewAsset />} />
            <Route path="cutlery/assets/edit/:id" element={<EditAsset />} />
            <Route path="cutlery/transfer" element={<Transfers />} />
            <Route path="cutlery/transfer/view/:id" element={<ViewCutleryTransfer />} />
            <Route path="cutlery/purchasing" element={<Purchases />} />
            <Route path="cutlery/damage" element={<Damages />} />
            <Route path="cutlery/reports/inventory" element={<CutleryStockReport />} />
            <Route path="cutlery/reports/stock" element={<CutleryStockReport />} />

            <Route path="reports/vat" element={<VATReport />} />
            <Route path="purchase-returns/add" element={<AddPurchaseReturn />} />
            <Route path="purchase-returns/history" element={<PurchaseReturnHistory />} />
            <Route path="reports/purchase-vat" element={<PurchaseVATReport />} />

            <Route path="purchase/non-paid" element={<NonPaidPurchases />} />

            <Route path="expenses/petty-cash" element={<ExpensesRoute><PettyCash /></ExpensesRoute>} />
            <Route path="expenses/reimbursement" element={<ExpensesRoute><Reimbursement /></ExpensesRoute>} />
            <Route path="expenses/bank-charges" element={<ExpensesRoute><BankCharges /></ExpensesRoute>} />
            <Route path="expenses/new" element={<ExpensesRoute><NewExpenses /></ExpensesRoute>} />
            <Route path="expenses/bank-details" element={<ExpensesRoute><BankDetails /></ExpensesRoute>} />
            <Route path="expenses/reports" element={<ExpensesRoute><ExpensesReport /></ExpensesRoute>} />

            <Route path="finance/cash" element={<FinanceRoute><CashLedger /></FinanceRoute>} />
            <Route path="finance/cash-receive" element={<FinanceRoute><CashReceive /></FinanceRoute>} />
            <Route path="finance/bank" element={<FinanceRoute><BankLedger /></FinanceRoute>} />
            <Route path="finance/bank-receive" element={<FinanceRoute><BankReceive /></FinanceRoute>} />
            <Route path="finance/transfer" element={<FinanceRoute><FundTransfer /></FinanceRoute>} />
            <Route path="wastage/edit/:id" element={<EditWastage />} />

            <Route path="adjustments/stores-balance" element={<AdjustmentsRoute><StoresBalance /></AdjustmentsRoute>} />
            <Route path="adjustments/stores-adjustments" element={<AdjustmentsRoute><StoresAdjustments /></AdjustmentsRoute>} />
            <Route path="adjustments/edit/:id" element={<AdjustmentsRoute><EditAdjustment /></AdjustmentsRoute>} />
            <Route path="adjustments/payment-methods" element={<PaymentMethodManagement />} />
            <Route path="adjustments/inhand" element={<AdjustmentsRoute><InhandAdjustments /></AdjustmentsRoute>} />
            <Route path="/reports/department-return-item-wise" element={<DepartmentReturnItemWiseReport />} />
            <Route path="/analysis/last-issued-date" element={<LastIssueDateReport />} />
            <Route path="/finance/bank-transfer" element={<FinanceRoute><BankTransfer /></FinanceRoute>} />
            <Route path="/finance/receive-types" element={<FinanceRoute><ReceiveTypeManagement /></FinanceRoute>} />

            <Route path="/fg-production/recipes" element={<FGRecipes />} />
            <Route path="/fg-production/reports" element={<FGRecipeReport />} />

          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;