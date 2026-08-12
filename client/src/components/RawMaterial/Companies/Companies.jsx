import React from 'react';
import RMManagementList from '../common/RMManagementList';

const Companies = () => {
  return (
    <RMManagementList
      pageTitle="Companies"
      subtitle="Manage your companies"
      apiPath="/companies"
      nameField="name"
      nameColumnLabel="COMPANY"
      createPayloadKey="name"
      addButtonLabel="Add Company"
      formTitle="Add New Company"
      formFieldLabel="Company Name *"
      formPlaceholder="e.g. JH, RR, RD"
      formSubmitLabel="Add Company"
      searchPlaceholder="Search companies..."
      emptyMessage="No companies found. Add your first company to get started."
    />
  );
};

export default Companies;
