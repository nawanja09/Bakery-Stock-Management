import React from 'react';
import RMManagementList from '../common/RMManagementList';

const ItemTypes = () => {
  return (
    <RMManagementList
      pageTitle="RM Type"
      apiPath="/item-types"
      nameField="type_name"
      nameColumnLabel="RM Type Name"
      createPayloadKey="type_name"
      addButtonLabel="Add RM Type"
      formTitle="Add New RM Type"
      formFieldLabel="RM Type Name *"
      formPlaceholder="e.g. Vegetables, Meat, Packing"
      formSubmitLabel="Add RM Type"
      searchPlaceholder="Search RM types..."
      emptyMessage="No RM types found. Add your first RM type to get started."
    />
  );
};

export default ItemTypes;
