import React from 'react';
import RMManagementList from '../common/RMManagementList';

const BankChargesTypeManagement = () => {
  return (
    <RMManagementList
      pageTitle="Bank Charges Types"
      apiPath="/bank-charges-types"
      nameField="type_name"
      nameColumnLabel="TYPE"
      createPayloadKey="type_name"
      addButtonLabel="Add Type"
      formTitle="Add New Bank Charges Type"
      formFieldLabel="Type Name *"
      formPlaceholder="e.g. Service Charge, Cheque Return"
      formSubmitLabel="Add Type"
      searchPlaceholder="Search bank charges types..."
      emptyMessage="No bank charges types found. Add your first type to get started."
    />
  );
};

export default BankChargesTypeManagement;
