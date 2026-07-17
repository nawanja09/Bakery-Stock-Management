import React from 'react';
import RMManagementList from '../common/RMManagementList';

const Departments = () => {
  return (
    <RMManagementList
      pageTitle="Department"
      apiPath="/departments"
      nameField="name"
      nameColumnLabel="Department Name"
      createPayloadKey="name"
      addButtonLabel="Add Department"
      formTitle="Add New Department"
      formFieldLabel="Department Name *"
      formPlaceholder="e.g. Bakery, Pastry, Cafe"
      formSubmitLabel="Add Department"
      searchPlaceholder="Search departments..."
      emptyMessage="No departments found. Add your first department to get started."
    />
  );
};

export default Departments;
