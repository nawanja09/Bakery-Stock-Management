import React from 'react';
import RMManagementList from '../common/RMManagementList';

// Reuses the shared Raw Material management list component so this page
// looks and behaves exactly like Companies / RM Item Types / Departments.
// Backed by the existing /api/expense-types endpoints (the same table that
// powers the "Expenses Type" dropdown on the New Expenses form).
const ExpenseTypeManagement = () => {
  return (
    <RMManagementList
      pageTitle="Expenses Type"
      subtitle="Manage the expense types used on the New Expenses form"
      apiPath="/expense-types"
      nameField="name"
      nameColumnLabel="EXPENSE TYPE"
      createPayloadKey="name"
      addButtonLabel="Add Expense Type"
      formTitle="Add New Expense Type"
      formFieldLabel="Expense Type Name *"
      formPlaceholder="e.g. Utilities, Transport, Office Supplies"
      formSubmitLabel="Add Expense Type"
      searchPlaceholder="Search expense types..."
      emptyMessage="No expense types found. Add your first expense type to get started."
    />
  );
};

export default ExpenseTypeManagement;
