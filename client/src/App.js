import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AddPurchase from './components/purchase/NewPurchase';
import EditPurchase from './components/purchase/EditPurchase';
import PurchaseHistory from './components/purchase/PurchaseHistory';
import PurchaseDetails from './components/purchase/PurchaseDetails';
import OrdersPage from './components/purchase/Orders/OrdersPage';
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
import DepartmentIssuesReport from './components/report/DepartmentIssuesReport';
import PurchasingReport from './components/report/PurchasingReport/PurchasingReport';
import PurchaseReport from './components/report/PurchaseReport/PurchaseReport';
import WastageReport from './components/report/WastageReport/WastageReport';
import ItemWiseStockReport from './components/report/StockReportByRangeAndItem';
import EmployeeManagement from './components/Employees/EmployeeManagement';

import ItemTypes from './components/RawMaterial/ItemTypes/ItemTypes';
import Departments from './components/RawMaterial/Departments/Departments';
import Companies from './components/RawMaterial/Companies/Companies';
import ExpenseTypeManagement from './components/RawMaterial/ExpenseTypes/ExpenseTypeManagement';
import SubExpenseTypeManagement from './components/RawMaterial/ExpenseTypes/SubExpenseTypeManagement';
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
import AddProductionWastage from './components/FinishedGoods/Production Wastage/AddProductionWastage';
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
import AdvancePaymentPage from './components/purchase/AdvancePaymentPage';
import RecordPaymentPage from './components/purchase/RecordPaymentPage';

import PettyCash from './components/Expenses/PettyCash';
import Reimbursement from './components/Expenses/Reimbursement';
import NewExpenses from './components/Expenses/NewExpenses';
import BankCharges from './components/Expenses/BankCharges';
import CashExpenses from './components/Expenses/CashExpenses';
import HiddenExpenses from './components/Expenses/HiddenExpenses';


import BankDetails from './components/Expenses/BankDetails';
import Payees from './components/Expenses/Payees';
import ExpensesReport from './components/Expenses/Reports/ExpensesReport';
import ExpenseSummaryReport from './components/Expenses/Reports/ExpenseSummaryReport';

import EditWastage from './components/wastage/EditWastage';

import StoresBalance from './components/adjustments/StoresBalance';
import StoresAdjustments from './components/adjustments/StoresAdjustments';
import EditAdjustment from './components/adjustments/EditAdjustment';
import PaymentMethodManagement from './components/adjustments/PaymentMethodManagement';
import InhandAdjustments from './components/adjustments/InhandAdjustments';

import DepartmentReturnItemWiseReport from './components/report/DepartmentReturnItemWiseReport';

import LastIssueDateReport from './components/Analysis/LastIssueDateReport';

import CashLedger from './components/Finance/CashLedger';
import BankLedger from './components/Finance/BankLedger';
import BankReceive from './components/Finance/BankReceive';
import FundTransfer from './components/Finance/FundTransfer';

import BankTransfer from './components/Finance/BankTransfer';
import ReceiveTypeManagement from './components/Finance/ReceiveTypeManagement';
import OtherLedgerManagement from './components/Finance/OtherLedgerManagement';
import OtherLedgers from './components/Finance/OtherLedgers';
import ExpensesChequeRegistry from './components/Finance/ExpensesChequeRegistry';
import StaffLoans from './components/Finance/StaffLoans';
import CardLedger from './components/Finance/CardLedger';
import Collection from './components/Collection/Collection';
import IntercompanyTransaction from './components/Finance/IntercompanyTransaction';

import FGRecipes from './components/FGProduction/Recipes';
import FGRecipeReport from './components/FGProduction/FGRecipesReports';
import AnalystPage from './components/Analyst/AnalystPage';
import AnalystIncomePage from './components/Analyst/AnalystIncomePage';
import IncomePage from './components/Income/IncomePage';

import './App.css';
import './css/page-design-system.css';
import './css/purchasing-page-ui.css';
import './css/fg-finance-ui.css';
import RouteModal from './components/common/RouteModal';
import RouteAccessGuard from './components/common/RouteAccessGuard';
import usePermissions from './hooks/usePermissions';

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

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
};

// Route wrappers. Every role rule lives in config/rolePermissions.js (the same
// table the sidebar and the API use): a wrapper only checks that the user is
// logged in and then asks the central rules whether this role may open the
// current URL. The named wrappers are kept so the route table below is unchanged.
const PermittedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return <RouteAccessGuard>{children}</RouteAccessGuard>;
};

const AnalystRoute = PermittedRoute;
const RawMaterialRoute = PermittedRoute;
const FgProductionRoute = PermittedRoute;
const AdjustmentsRoute = PermittedRoute;
const FinanceRoute = PermittedRoute;
const ExpensesRoute = PermittedRoute;

const AuthCheck = () => {
  const token = localStorage.getItem('token');
  return token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
};

const ManagementLanding = () => {
  const { getModuleLanding } = usePermissions();
  return <Navigate to={getModuleLanding('management') || '/dashboard'} replace />;
};

// Prevents already-logged-in users from accessing /login.
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

const ModalRoute = ({ children, title, size = 'large' }) => {
  const location = useLocation();
  return location.state?.backgroundLocation
    ? <RouteModal title={title} size={size}>{children}</RouteModal>
    : children;
};

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
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
            <Route path="management" element={<ManagementLanding />} />
            <Route path="purchase/new" element={<PermittedRoute><ModalRoute title="Add New Purchase"><AddPurchase /></ModalRoute></PermittedRoute>} />
            <Route path="purchase/edit/:id" element={<RawMaterialRoute><ModalRoute title="Edit Purchase"><EditPurchase /></ModalRoute></RawMaterialRoute>} />
            <Route path="purchase/history" element={<RawMaterialRoute><PurchaseHistory /></RawMaterialRoute>} />
            <Route path="purchase/orders" element={<RawMaterialRoute><OrdersPage /></RawMaterialRoute>} />
            <Route path="purchase/advance-payment" element={<RawMaterialRoute><AdvancePaymentPage /></RawMaterialRoute>} />
            <Route path="purchase/record-payment" element={<RawMaterialRoute><RecordPaymentPage /></RawMaterialRoute>} />
            <Route path="purchase/:id" element={<RawMaterialRoute><ModalRoute title="Purchase Details"><PurchaseDetails /></ModalRoute></RawMaterialRoute>} />
            <Route path="suppliers" element={<RawMaterialRoute><Suppliers /></RawMaterialRoute>} />
            <Route path="items/add" element={<RawMaterialRoute><ModalRoute title="Add New Item" size="medium"><AddItem /></ModalRoute></RawMaterialRoute>} />
            <Route path="items" element={<PermittedRoute><ViewItems /></PermittedRoute>} />
            <Route path="items/edit/:id" element={<RawMaterialRoute><ModalRoute title="Edit Item" size="medium"><EditItem /></ModalRoute></RawMaterialRoute>} />
            <Route path="item-types" element={<RawMaterialRoute><ItemTypes /></RawMaterialRoute>} />
            <Route path="departments" element={<RawMaterialRoute><Departments /></RawMaterialRoute>} />
            <Route path="companies" element={<RawMaterialRoute><Companies /></RawMaterialRoute>} />
            <Route path="expense-types-management" element={<ExpenseTypeManagement />} />
            <Route path="sub-expense-types-management" element={<SubExpenseTypeManagement />} />
            <Route path="expense-payees-management" element={<ExpensePayeeManagement />} />
            <Route path="bank-charges-type-management" element={<BankChargesTypeManagement />} />
            <Route path="admin/password" element={<ChangePassword />} />
            <Route path="opening/add" element={<RawMaterialRoute><ModalRoute title="Add Opening Balance" size="medium"><AddOpeningBalance /></ModalRoute></RawMaterialRoute>} />
            <Route path="opening/history" element={<RawMaterialRoute><OpeningBalanceHistory /></RawMaterialRoute>} />
            <Route path="issuance/issue" element={<RawMaterialRoute><ModalRoute title="Add New Issuance"><IssueToDepartment /></ModalRoute></RawMaterialRoute>} />
            <Route path="issuance/edit/:id" element={<RawMaterialRoute><ModalRoute title="Edit Issuance"><EditIssuance /></ModalRoute></RawMaterialRoute>} />
            <Route path="issuance/history" element={<RawMaterialRoute><IssuanceHistory /></RawMaterialRoute>} />
            <Route path="wastage/add" element={<RawMaterialRoute><ModalRoute title="Add New Wastage"><AddWastage /></ModalRoute></RawMaterialRoute>} />
            <Route path="wastage/history" element={<RawMaterialRoute><WastageHistory /></RawMaterialRoute>} />
            <Route path="reports/stock" element={<RawMaterialRoute><StockReport /></RawMaterialRoute>} />
            <Route path="reports/department" element={<DepartmentIssuesReport />} />
            <Route path="reports/purchasing" element={<PurchasingReport />} />
            <Route path="reports/purchase-report" element={<PurchaseReport />} />
            <Route path="reports/wastage" element={<WastageReport />} />
            <Route path="admin/employees" element={<PermittedRoute><EmployeeManagement /></PermittedRoute>} />
            <Route path="reports/stock/items" element={<ItemWiseStockReport/>} />

            <Route path="finished-goods/items/add" element={<ModalRoute title="Add New Finished Goods Item"><AddFinishedGoodsItem /></ModalRoute>} />
            <Route path="finished-goods/items" element={<ViewFinishedGoodsItems />} />
            <Route path="finished-goods/items/edit/:id" element={<ModalRoute title="Edit Finished Goods Item"><EditFinishedGoodsItem /></ModalRoute>} />
            <Route path="finished-goods/items/view/:id" element={<ModalRoute title="Finished Goods Details" size="medium"><ViewFinishedGoodsItem /></ModalRoute>} />
            <Route path="finished-goods/opening/add" element={<ModalRoute title="Add Finished Goods Opening Balance" size="medium"><AddFinishedGoodsOpeningBalance /></ModalRoute>} />
            <Route path="finished-goods/opening/history" element={<FinishedGoodsOpeningBalanceHistory />} />
            <Route path="finished-goods/production" element={<FgProductionRoute><ProductionManagement /></FgProductionRoute>} />
            <Route path="finished-goods/production/view/:id" element={<ModalRoute title="Production Details" size="medium"><ViewProduction /></ModalRoute>} />
            <Route path="finished-goods/production/edit/:id" element={<ModalRoute title="Edit Production"><EditProduction /></ModalRoute>} />
            <Route path="finished-goods/transfer" element={<TransfersManagement />} />
            <Route path="finished-goods/transfer/view/:id" element={<ModalRoute title="Transfer Details" size="medium"><ViewTransfer /></ModalRoute>} />
            <Route path="finished-goods/transfer/edit/:id" element={<ModalRoute title="Edit Transfer"><EditTransfer /></ModalRoute>} />
            <Route path="finished-goods/transfer/add" element={<ModalRoute title="Add New Transfer"><AddTransferPopup /></ModalRoute>} />
            <Route path="finished-goods/wastage/kitchen" element={<ModalRoute title="Add Finished Goods Wastage"><AddFinishedGoodsWastage /></ModalRoute>} />
            <Route path="finished-goods/wastage/production/add" element={<ModalRoute title="Add Production Wastage"><AddProductionWastage /></ModalRoute>} />
            <Route path="finished-goods/wastage/history" element={<FinishedGoodsWastageHistory />} />

            <Route path="finished-goods/reports/stock" element={<FinishedGoodsStockReport />} />
            <Route path="finished-goods/reports/production" element={<ProductionReport />} />
            <Route path="finished-goods/reports/wastage" element={<KitchenWastageReport />} />
            <Route path="finished-goods/reports/transfer" element={<TransferReport />} />

            <Route path="cost-calculator/calculate" element={<CalculateCost />} />
            <Route path="cost-calculator/saved" element={<SavedCosting />} />
            <Route path="/reports/department-usage" element={<DepartmentUsageReport />} />
            <Route path="finished-goods/sales/new" element={<ModalRoute title="Add Finished Goods Sale"><AddFinishedGoodsSale /></ModalRoute>} />
            <Route path="finished-goods/sales/history" element={<FinishedGoodsSalesHistory />} />

            <Route path="finished-goods/reports/stock/summary" element={<StockSummary />} />
            <Route path="returns/add" element={<RawMaterialRoute><ModalRoute title="Add New Return"><AddReturn /></ModalRoute></RawMaterialRoute>} />
            <Route path="returns/history" element={<RawMaterialRoute><ReturnsHistory /></RawMaterialRoute>} />
            <Route path="finished-goods/reports/bakery-stock" element={<BakeryStockReport />} />

            <Route path="cutlery/locations" element={<Locations />} />
            <Route path="cutlery/assets" element={<Assets />} />
            <Route path="cutlery/assets/view/:id" element={<ModalRoute title="Asset Details" size="medium"><ViewAsset /></ModalRoute>} />
            <Route path="cutlery/assets/edit/:id" element={<ModalRoute title="Edit Asset"><EditAsset /></ModalRoute>} />
            <Route path="cutlery/transfer" element={<Transfers />} />
            <Route path="cutlery/transfer/view/:id" element={<ModalRoute title="Transfer Details" size="medium"><ViewCutleryTransfer /></ModalRoute>} />
            <Route path="cutlery/purchasing" element={<Purchases />} />
            <Route path="cutlery/damage" element={<Damages />} />
            <Route path="cutlery/reports/inventory" element={<CutleryStockReport />} />
            <Route path="cutlery/reports/stock" element={<CutleryStockReport />} />

            <Route path="reports/vat" element={<VATReport />} />
            <Route path="purchase-returns/add" element={<RawMaterialRoute><ModalRoute title="Add New Purchase Return"><AddPurchaseReturn /></ModalRoute></RawMaterialRoute>} />
            <Route path="purchase-returns/history" element={<RawMaterialRoute><PurchaseReturnHistory /></RawMaterialRoute>} />
            <Route path="reports/purchase-vat" element={<PurchaseVATReport />} />

            <Route path="purchase/non-paid" element={<NonPaidPurchases />} />

            <Route path="expenses/petty-cash" element={<ExpensesRoute><PettyCash /></ExpensesRoute>} />
            <Route path="expenses/reimbursement" element={<ExpensesRoute><Reimbursement /></ExpensesRoute>} />
            <Route path="expenses/bank-charges" element={<ExpensesRoute><BankCharges /></ExpensesRoute>} />
            <Route path="expenses/new" element={<ExpensesRoute><NewExpenses /></ExpensesRoute>} />
            <Route path="expenses/bank-details" element={<ExpensesRoute><BankDetails /></ExpensesRoute>} />
            <Route path="expenses/reports" element={<ExpensesRoute><ExpensesReport /></ExpensesRoute>} />
            <Route path="expenses/summary-report" element={<ExpensesRoute><ExpenseSummaryReport /></ExpensesRoute>} />
            <Route path="expenses/cash-expenses" element={<ExpensesRoute><CashExpenses /></ExpensesRoute>} />
            <Route path="expenses/hidden" element={<ExpensesRoute><HiddenExpenses /></ExpensesRoute>} />


            <Route path="finance/cash" element={<FinanceRoute><CashLedger /></FinanceRoute>} />
            <Route path="finance/cash-receive" element={<Navigate to="/finance/cash" replace />} />
            <Route path="finance/bank" element={<FinanceRoute><BankLedger /></FinanceRoute>} />
            <Route path="finance/bank-receive" element={<FinanceRoute><BankReceive /></FinanceRoute>} />
            <Route path="finance/transfer" element={<FinanceRoute><FundTransfer /></FinanceRoute>} />
            <Route path="finance/income" element={<FinanceRoute><IncomePage /></FinanceRoute>} />
            <Route path="wastage/edit/:id" element={<ModalRoute title="Edit Wastage"><EditWastage /></ModalRoute>} />

            <Route path="adjustments/stores-balance" element={<AdjustmentsRoute><StoresBalance /></AdjustmentsRoute>} />
            <Route path="adjustments/stores-adjustments" element={<AdjustmentsRoute><StoresAdjustments /></AdjustmentsRoute>} />
            <Route path="adjustments/edit/:id" element={<ModalRoute title="Edit Adjustment"><AdjustmentsRoute><EditAdjustment /></AdjustmentsRoute></ModalRoute>} />
            <Route path="adjustments/payment-methods" element={<AdjustmentsRoute><PaymentMethodManagement /></AdjustmentsRoute>} />
            <Route path="adjustments/inhand" element={<AdjustmentsRoute><InhandAdjustments /></AdjustmentsRoute>} />
            <Route path="/reports/department-return-item-wise" element={<DepartmentReturnItemWiseReport />} />
            <Route path="/analysis/last-issued-date" element={<LastIssueDateReport />} />
            <Route path="/finance/bank-transfer" element={<FinanceRoute><BankTransfer /></FinanceRoute>} />
            <Route path="/finance/receive-types" element={<FinanceRoute><ReceiveTypeManagement /></FinanceRoute>} />
            <Route path="/other-ledgers-management" element={<FinanceRoute><OtherLedgerManagement /></FinanceRoute>} />
            <Route path="/finance/other-ledgers" element={<FinanceRoute><OtherLedgers /></FinanceRoute>} />
            <Route path="/finance/cheque-registry" element={<FinanceRoute><ExpensesChequeRegistry /></FinanceRoute>} />
            <Route path="/finance/staff-loans" element={<FinanceRoute><StaffLoans /></FinanceRoute>} />
            <Route path="/finance/card-ledger" element={<FinanceRoute><CardLedger /></FinanceRoute>} />
            <Route path="/collection" element={<PermittedRoute><Collection /></PermittedRoute>} />
            <Route path="/finance/intercompany" element={<FinanceRoute><IntercompanyTransaction /></FinanceRoute>} />

            <Route path="analyst/income" element={<AnalystRoute><AnalystIncomePage /></AnalystRoute>} />
            <Route path="analyst/incomes" element={<AnalystRoute><AnalystIncomePage /></AnalystRoute>} />
            <Route path="analyst/expenses" element={<AnalystRoute><AnalystPage /></AnalystRoute>} />
            <Route path="analyst/balance-sheet" element={<AnalystRoute><AnalystPage /></AnalystRoute>} />

            <Route path="/fg-production/recipes" element={<FgProductionRoute><FGRecipes /></FgProductionRoute>} />
            <Route path="/fg-production/reports" element={<FgProductionRoute><FGRecipeReport /></FgProductionRoute>} />

          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;