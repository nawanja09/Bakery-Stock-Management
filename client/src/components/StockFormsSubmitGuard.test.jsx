import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import api from '../api';
import { PopupProvider } from './context/PopupContext';
import AddWastage from './wastage/AddWastage';
import AddReturn from './returns/AddReturn';
import AddOpeningBalance from './OpeningBalance/AddOpeningBalance';

// Jest in this CRA setup cannot load react-router v7, so the router is stubbed
// (same approach as NavigationBar.test.jsx).
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });
jest.mock('../api');

const ITEMS = [{ id: 1, name: 'Wheat Flour', item_code: 'RM-001', unit: 'kg', current_stock: 10 }];

// The POST stays in flight until the test resolves it, like a slow network.
let resolvePost;
const pendingPost = () => new Promise((resolve) => { resolvePost = resolve; });

const pickFirstItem = async (placeholder, optionText) => {
  const input = screen.getByText(placeholder).parentElement.querySelector('input'); // eslint-disable-line testing-library/no-node-access
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const option = await screen.findByText(optionText);
  // Picking an item can start a stock lookup; let it settle inside act.
  await act(async () => { fireEvent.click(option); });
};

const renderForm = (ui) => {
  const view = render(<PopupProvider>{ui}</PopupProvider>);
  // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
  return { ...view, form: view.container.querySelector('form') };
};

const submitTwice = (button, form) => {
  fireEvent.click(button);
  // A second click and an Enter-repeat while the first POST is still pending.
  fireEvent.click(button);
  fireEvent.submit(form);
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  api.post.mockImplementation(pendingPost);
});

test('AddWastage posts once when Save is clicked twice', async () => {
  api.get.mockImplementation((url) => Promise.resolve({
    data: url === '/items' ? ITEMS : { 1: { unit_price: 100 } },
  }));
  const { form } = renderForm(<AddWastage />);
  await pickFirstItem('Select item...', /Wheat Flour/);

  const save = screen.getByRole('button', { name: 'Save Wastage' });
  expect(save).toHaveClass('btn', 'btn-primary');
  submitTwice(save, form);

  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

  await act(async () => resolvePost({ status: 201, data: { wastage_note_number: 'W-1' } }));
  expect(mockNavigate).toHaveBeenCalledWith('/wastage/history');
});

test('AddReturn posts once when Save is clicked twice', async () => {
  localStorage.setItem('user', JSON.stringify({ id: 7, role: 'Storekeeper' }));
  api.get.mockImplementation((url) => Promise.resolve({
    data: url === '/items' ? ITEMS : url === '/departments' ? [{ id: 3, name: 'Kitchen' }] : { current_stock: 12 },
  }));
  const { form } = renderForm(<AddReturn />);
  await pickFirstItem('Search or select item...', /Wheat Flour/);
  await screen.findByText('12'); // current stock re-fetched for the picked item

  const save = screen.getByRole('button', { name: 'Save Return' });
  expect(save).toHaveClass('btn', 'btn-primary');
  submitTwice(save, form);

  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

  await act(async () => resolvePost({ data: { return_number: 'R-1' } }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/returns/history'));
});

test('AddOpeningBalance posts once when Add Balance is clicked twice, and unlocks after a failure', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {}); // the failed save is logged
  api.get.mockResolvedValue({ data: ITEMS });
  const { form } = renderForm(<AddOpeningBalance />);
  await pickFirstItem('Select or search item...', /Wheat Flour/);

  const save = screen.getByRole('button', { name: 'Add Balance' });
  expect(save).toHaveClass('btn', 'btn-primary');
  submitTwice(save, form);

  expect(api.post).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

  // A failed save must let the user try again.
  await act(async () => resolvePost(Promise.reject({ response: { data: { error: 'Duplicate' } } })));
  expect(await screen.findByRole('button', { name: 'Add Balance' })).toBeEnabled();
  expect(mockNavigate).not.toHaveBeenCalled();
  console.error.mockRestore();
});
