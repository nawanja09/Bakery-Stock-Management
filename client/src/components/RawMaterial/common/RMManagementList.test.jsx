import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import RMManagementList from './RMManagementList';
import api from '../../../api';
import { PopupProvider } from '../../context/PopupContext';

jest.mock('../../../api');

const renderList = () => render(
  <PopupProvider>
    <RMManagementList
      pageTitle="Department"
      apiPath="/departments"
      nameField="name"
      nameColumnLabel="Department Name"
      createPayloadKey="name"
      addButtonLabel="Add Department"
      formTitle="Add New Department"
      formFieldLabel="Department Name *"
      formPlaceholder="e.g. Bakery"
      formSubmitLabel="Add Department"
      searchPlaceholder="Search departments..."
      emptyMessage="No departments found."
    />
  </PopupProvider>
);

beforeEach(() => {
  jest.resetAllMocks();
  api.get.mockResolvedValue({ data: [{ id: 1, name: 'Bakery' }, { id: 2, name: 'Pastry', status: 'Inactive' }] });
});

test('lists records under the page header with a count and status badges', async () => {
  renderList();
  expect(screen.getByRole('heading', { level: 1, name: 'Department' })).toBeInTheDocument();
  expect(await screen.findByText('Bakery')).toBeInTheDocument();
  expect(screen.getByText('Active')).toHaveClass('tone-success');
  expect(screen.getByText('Inactive')).toHaveClass('tone-neutral');
  expect(screen.getByText('Showing 2 of 2 records')).toBeInTheDocument();
});

test('deletes only after confirming in the dialog', async () => {
  api.delete.mockResolvedValue({ data: { message: 'Deleted' } });
  renderList();
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Bakery' }));

  expect(screen.getByRole('dialog', { name: 'Delete department?' })).toHaveTextContent('will be removed');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.delete).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Delete Bakery' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/departments/1'));
});

test('adds a record through the modal form', async () => {
  api.post.mockResolvedValue({ data: { message: 'Added' } });
  renderList();
  await screen.findByText('Bakery');
  fireEvent.click(screen.getByRole('button', { name: 'Add Department' }));

  const dialog = screen.getByRole('dialog', { name: 'Add New Department' });
  const input = screen.getByLabelText('Department Name *');
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: '  Cafe  ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Department' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/departments', { name: 'Cafe' }));
});

test('shows an empty state with an add action when there are no records', async () => {
  api.get.mockResolvedValue({ data: [] });
  renderList();
  expect(await screen.findByText('No departments found.')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Add Department' })).toHaveLength(2);
});
