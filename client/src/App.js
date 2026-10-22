import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, matchPath } from 'react-router-dom';
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
import VatRateSettings from './components/VatRateSettings/VatRateSettings';
import ExpenseTypeManagement from './components/RawMaterial/ExpenseTypes/ExpenseTypeManagement';
import SubExpenseTypeManagement from './components/RawMaterial/ExpenseTypes/SubExpenseTypeManagement';
import ExpensePayeeManagement from './components/RawMaterial/ExpensePayees/ExpensePayeeManagement';
import BankChargesTypeManagement from './components/RawMaterial/BankChargesType/BankChargesTypeManagement';

import DepartmentUsageReport from './components/report/DepartmentUsageReport';

import AddReturn from './components/returns/AddReturn';
import ReturnsHistory from './components/returns/ReturnsHistory';

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
import VATExemptPurchasingReport from './components/report/VATExemptPurchasingReport';
import DiscountedPurchasesReport from './components/report/DiscountedPurchasesReport';

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
import FundTransfer from './components/Finance/FundTransfer';

import BankTransfer from './components/Finance/BankTransfer';
import ReceiveTypeManagement from './components/Finance/ReceiveTypeManagement';
import OtherLedgerManagement from './components/Finance/OtherLedgerManagement';
import CreditCardRateManagement from './components/Finance/CreditCardRateManagement';
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
import AuditTrail from './components/AuditTrail/AuditTrail';
import PeriodClose from './components/PeriodClose/PeriodClose';
import IncomePage from './components/Income/IncomePage';

import './App.css';
import './styles/pages/purchasing-page-ui.css';
import './styles/pages/fg-finance-ui.css';
// Gives every legacy popup the shared <Modal> look. Its own selectors are
// double-class (e.g. `.sl-modal.sl-modal`) so it wins on specificity, not on
// being imported last - kept last anyway as the conventional place for it.
import './styles/legacy-dialogs.css';
import RouteModal from './components/common/RouteModal';
import useModalRouting, { PageKeyContext } from './components/common/useModalRouting';
import RouteAccessGuard from './components/common/RouteAccessGuard';
import usePermissions from './hooks/usePermissions';

// Living style guide for the shared UI components - development builds only.
const UiPreview = process.env.NODE_ENV === 'development'
  ? React.lazy(() => import('./components/common/ui/UiPreview'))
  : null;

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

// Routes that open as a popup over the current page when a link passes
// state.backgroundLocation (ModalLink, modalRouteState), and as a full page when
// opened directly. Read-only popups may close on a backdrop click.
const POPUP_ROUTES = [
  { path: 'purchase/new', title: 'Add New Purchase', element: <PermittedRoute><AddPurchase /></PermittedRoute> },
  { path: 'purchase/edit/:id', title: 'Edit Purchase', element: <RawMaterialRoute><EditPurchase /></RawMaterialRoute> },
  { path: 'purchase/:id', title: 'Purchase Details', closeOnOverlay: true, element: <RawMaterialRoute><PurchaseDetails /></RawMaterialRoute> },
  { path: 'items/add', title: 'Add New Item', size: 'medium', element: <RawMaterialRoute><AddItem /></RawMaterialRoute> },
  { path: 'items/edit/:id', title: 'Edit Item', size: 'medium', element: <RawMaterialRoute><EditItem /></RawMaterialRoute> },
  { path: 'opening/add', title: 'Add Opening Balance', size: 'medium', element: <RawMaterialRoute><AddOpeningBalance /></RawMaterialRoute> },
  { path: 'issuance/issue', title: 'Add New Issuance', element: <RawMaterialRoute><IssueToDepartment /></RawMaterialRoute> },
  { path: 'issuance/edit/:id', title: 'Edit Issuance', element: <RawMaterialRoute><EditIssuance /></RawMaterialRoute> },
  { path: 'wastage/add', title: 'Add New Wastage', element: <RawMaterialRoute><AddWastage /></RawMaterialRoute> },
  { path: 'returns/add', title: 'Add New Return', element: <RawMaterialRoute><AddReturn /></RawMaterialRoute> },
  { path: 'cutlery/assets/view/:id', title: 'Asset Details', size: 'medium', closeOnOverlay: true, element: <ViewAsset /> },
  { path: 'cutlery/assets/edit/:id', title: 'Edit Asset', element: <EditAsset /> },
  { path: 'cutlery/transfer/view/:id', title: 'Transfer Details', size: 'medium', closeOnOverlay: true, element: <ViewCutleryTransfer /> },
  { path: 'purchase-returns/add', title: 'Add New Purchase Return', element: <RawMaterialRoute><AddPurchaseReturn /></RawMaterialRoute> },
  { path: 'wastage/edit/:id', title: 'Edit Wastage', element: <EditWastage /> },
  { path: 'adjustments/edit/:id', title: 'Edit Adjustment', element: <AdjustmentsRoute><EditAdjustment /></AdjustmentsRoute> },
];

const isPopupPath = (pathname) => POPUP_ROUTES.some(({ path }) => matchPath(`/${path}`, pathname));

export const AppRoutes = () => {
  const modalRouting = useModalRouting();
  const { location, pageKey } = modalRouting;
  // Only a known popup URL is drawn over the page; anything else renders normally.
  const backgroundLocation = modalRouting.backgroundLocation && isPopupPath(location.pathname)
    ? modalRouting.backgroundLocation
    : null;

  return (
      <div className="app">
        <PageKeyContext.Provider value={pageKey}>
        <Routes location={backgroundLocation || location}>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/auth-check" element={<AuthCheck />} />
          {UiPreview && (
            <Route path="/ui-preview" element={<React.Suspense fallback={null}><UiPreview /></React.Suspense>} />
          )}

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
            {POPUP_ROUTES.map(({ path, element }) => <Route key={path} path={path} element={element} />)}
            <Route path="management" element={<ManagementLanding />} />
            <Route path="purchase/history" element={<RawMaterialRoute><PurchaseHistory /></RawMaterialRoute>} />
            <Route path="purchase/orders" element={<RawMaterialRoute><OrdersPage /></RawMaterialRoute>} />
            <Route path="purchase/advance-payment" element={<RawMaterialRoute><AdvancePaymentPage /></RawMaterialRoute>} />
            <Route path="purchase/record-payment" element={<RawMaterialRoute><RecordPaymentPage /></RawMaterialRoute>} />
            <Route path="suppliers" element={<RawMaterialRoute><Suppliers /></RawMaterialRoute>} />
            <Route path="items" element={<PermittedRoute><ViewItems /></PermittedRoute>} />
            <Route path="item-types" element={<RawMaterialRoute><ItemTypes /></RawMaterialRoute>} />
            <Route path="departments" element={<RawMaterialRoute><Departments /></RawMaterialRoute>} />
            <Route path="companies" element={<RawMaterialRoute><Companies /></RawMaterialRoute>} />
            <Route path="vat-rate-settings" element={<PermittedRoute><VatRateSettings /></PermittedRoute>} />
            <Route path="expense-types-management" element={<ExpenseTypeManagement />} />
            <Route path="sub-expense-types-management" element={<SubExpenseTypeManagement />} />
            <Route path="expense-payees-management" element={<ExpensePayeeManagement />} />
            <Route path="bank-charges-type-management" element={<BankChargesTypeManagement />} />
            <Route path="admin/password" element={<ChangePassword />} />
            <Route path="opening/history" element={<RawMaterialRoute><OpeningBalanceHistory /></RawMaterialRoute>} />
            <Route path="issuance/history" element={<RawMaterialRoute><IssuanceHistory /></RawMaterialRoute>} />
            <Route path="wastage/history" element={<RawMaterialRoute><WastageHistory /></RawMaterialRoute>} />
            <Route path="reports/stock" element={<RawMaterialRoute><StockReport /></RawMaterialRoute>} />
            <Route path="reports/department" element={<DepartmentIssuesReport />} />
            <Route path="reports/purchasing" element={<PurchasingReport />} />
            <Route path="reports/purchase-report" element={<PurchaseReport />} />
            <Route path="reports/wastage" element={<WastageReport />} />
            <Route path="admin/employees" element={<PermittedRoute><EmployeeManagement /></PermittedRoute>} />
            <Route path="reports/stock/items" element={<ItemWiseStockReport/>} />

            <Route path="/reports/department-usage" element={<DepartmentUsageReport />} />

            <Route path="returns/history" element={<RawMaterialRoute><ReturnsHistory /></RawMaterialRoute>} />

            <Route path="cutlery/locations" element={<Locations />} />
            <Route path="cutlery/assets" element={<Assets />} />
            <Route path="cutlery/transfer" element={<Transfers />} />
            <Route path="cutlery/purchasing" element={<Purchases />} />
            <Route path="cutlery/damage" element={<Damages />} />
            <Route path="cutlery/reports/inventory" element={<CutleryStockReport />} />
            <Route path="cutlery/reports/stock" element={<CutleryStockReport />} />

            <Route path="reports/vat" element={<VATReport />} />
            <Route path="reports/vat-exempt" element={<VATExemptPurchasingReport />} />
            <Route path="reports/discounted-purchases" element={<DiscountedPurchasesReport />} />
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
            <Route path="finance/bank-receive" element={<Navigate to="/finance/bank" replace />} />
            <Route path="finance/transfer" element={<FinanceRoute><FundTransfer /></FinanceRoute>} />
            <Route path="finance/income" element={<FinanceRoute><IncomePage /></FinanceRoute>} />

            <Route path="adjustments/stores-balance" element={<AdjustmentsRoute><StoresBalance /></AdjustmentsRoute>} />
            <Route path="adjustments/stores-adjustments" element={<AdjustmentsRoute><StoresAdjustments /></AdjustmentsRoute>} />
            <Route path="adjustments/payment-methods" element={<AdjustmentsRoute><PaymentMethodManagement /></AdjustmentsRoute>} />
            <Route path="adjustments/inhand" element={<AdjustmentsRoute><InhandAdjustments /></AdjustmentsRoute>} />
            <Route path="/reports/department-return-item-wise" element={<DepartmentReturnItemWiseReport />} />
            <Route path="/analysis/last-issued-date" element={<LastIssueDateReport />} />
            <Route path="/finance/bank-transfer" element={<FinanceRoute><BankTransfer /></FinanceRoute>} />
            <Route path="/finance/receive-types" element={<FinanceRoute><ReceiveTypeManagement /></FinanceRoute>} />
            <Route path="/other-ledgers-management" element={<FinanceRoute><OtherLedgerManagement /></FinanceRoute>} />
            <Route path="/credit-card-rate-management" element={<FinanceRoute><CreditCardRateManagement /></FinanceRoute>} />
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

            <Route path="/audit-trail" element={<PermittedRoute><AuditTrail /></PermittedRoute>} />
            <Route path="/period-close" element={<PermittedRoute><PeriodClose /></PermittedRoute>} />

            <Route path="/fg-production/recipes" element={<FgProductionRoute><FGRecipes /></FgProductionRoute>} />
            <Route path="/fg-production/reports" element={<FgProductionRoute><FGRecipeReport /></FgProductionRoute>} />

          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </PageKeyContext.Provider>

        {backgroundLocation && (
          <Routes>
            {POPUP_ROUTES.map(({ path, title, size = 'large', closeOnOverlay, element }) => (
              <Route
                key={path}
                path={`/${path}`}
                element={(
                  <ProtectedRoute>
                    <RouteModal title={title} size={size} closeOnOverlay={closeOnOverlay}>
                      {/* Popups render outside Layout, so they need its role check too. */}
                      <RouteAccessGuard>{element}</RouteAccessGuard>
                    </RouteModal>
                  </ProtectedRoute>
                )}
              />
            ))}
          </Routes>
        )}
      </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;