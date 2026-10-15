import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import api from './api';
import { AppRoutes } from './App';
import { PopupProvider } from './components/context/PopupContext';
import { ConfirmProvider } from './components/common/ui';

// Jest in this CRA setup cannot resolve react-router-dom's "react-router/dom"
// subpath, so the DOM package is served from react-router itself (it exports
// the same router API); react-router needs TextEncoder in jsdom.
jest.mock('react-router-dom', () => {
  const { TextEncoder, TextDecoder } = require('util');
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual('react-router');
}, { virtual: true });
jest.mock('./api');

const ITEMS = [{ id: 1, name: 'Wheat Flour', item_code: 'RM-001', unit: 'kg', item_type: 'Raw Material', status: 1, is_active: 1 }];

const renderAt = (entry) => render(
  <PopupProvider>
    <ConfirmProvider>
      <MemoryRouter initialEntries={[entry]}>
        <AppRoutes />
      </MemoryRouter>
    </ConfirmProvider>
  </PopupProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('user', JSON.stringify({ id: 1, role: 'Super Admin', username: 'tester' }));
  api.get.mockImplementation((url) => Promise.resolve({ data: url.startsWith('/items') ? ITEMS : [] }));
});

const itemListLoads = () => api.get.mock.calls.filter(([url]) => url.startsWith('/items?')).length;

test('a route popup opens over the page, and the page stays mounted while it is open and after it closes', async () => {
  renderAt('/items');
  const list = await screen.findByRole('heading', { name: 'Items Management' });
  await screen.findByText('Wheat Flour');
  expect(itemListLoads()).toBe(1);

  fireEvent.click(screen.getByRole('button', { name: /Add New Item/ }));
  const popup = await screen.findByRole('dialog', { name: 'Add New Item' });

  // Same page element, still in the document, not reloaded.
  expect(list).toBeInTheDocument();
  expect(screen.getByText('Wheat Flour')).toBeInTheDocument();
  expect(itemListLoads()).toBe(1);

  // The popup's own × (the form inside has a second one - UI-024).
  fireEvent.click(within(popup).getAllByRole('button', { name: 'Close' })[0]);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'Items Management' })).toBe(list);
  expect(itemListLoads()).toBe(1);
});

test('leaving a popup by navigating forward (as after Save) reloads the page behind it', async () => {
  renderAt('/items');
  await screen.findByText('Wheat Flour');
  fireEvent.click(screen.getByRole('button', { name: /Add New Item/ }));
  const popup = await screen.findByRole('dialog', { name: 'Add New Item' });

  // The form's own Cancel does navigate('/items'), like its Save does.
  fireEvent.click(within(popup).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(itemListLoads()).toBe(2));
  expect(await screen.findByText('Wheat Flour')).toBeInTheDocument();
});

test('a route popup the role may not open shows Access Denied instead of its content', async () => {
  // Stores can open /items but holds no Cutlery module.
  localStorage.setItem('user', JSON.stringify({ id: 2, role: 'Store Keeper', username: 'stores' }));
  renderAt({ pathname: '/cutlery/assets/view/1', state: { backgroundLocation: { pathname: '/items' } } });

  const popup = await screen.findByRole('dialog', { name: 'Asset Details' });
  expect(within(popup).getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
  expect(api.get.mock.calls.some(([url]) => url.includes('cutlery'))).toBe(false);
  expect(await screen.findByText('Wheat Flour')).toBeInTheDocument();
});

test('a route popup URL opened directly renders as a full page', async () => {
  renderAt('/items/add');
  expect(await screen.findByRole('heading', { name: 'Add New Item' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Items Management' })).not.toBeInTheDocument();
});
