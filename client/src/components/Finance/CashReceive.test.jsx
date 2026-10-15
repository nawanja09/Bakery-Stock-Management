import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CashReceive from './CashReceive';
import api from '../../api';

jest.mock('../../api');

const mockApi = (companies = [{ id: 1, name: 'JH' }]) => {
  api.get.mockImplementation((url) => {
    if (url === '/purchases/companies') return Promise.resolve({ data: companies });
    if (url === '/receive-types') return Promise.resolve({ data: [{ id: 1, type_name: 'Sales' }] });
    if (url.startsWith('/finance/cash/balance/')) return Promise.resolve({ data: { balance: 1000 } });
    return Promise.resolve({ data: [] });
  });
};

const renderPopup = (props = {}) => render(<CashReceive modal onClose={jest.fn()} onSaved={jest.fn()} {...props} />);
// The backdrop has no role, so it is reached through the dialog.
const backdropOf = (dialog) => dialog.parentElement; // eslint-disable-line testing-library/no-node-access

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ id: 7, role: 'Accountant' }));
});

test('a click on the backdrop keeps the popup and what was typed; Escape still closes it', async () => {
  mockApi();
  const onClose = jest.fn();
  renderPopup({ onClose });
  const dialog = screen.getByRole('dialog', { name: /Cash Received/ });
  const amount = screen.getByPlaceholderText('0.00');
  fireEvent.change(amount, { target: { value: '2500' } });

  fireEvent.mouseDown(backdropOf(dialog));
  fireEvent.click(backdropOf(dialog));

  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: /Cash Received/ })).toBeInTheDocument();
  expect(amount).toHaveValue(2500);

  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a validation error is shown at the top of the form and marks the field', async () => {
  mockApi([]); // no company preselected
  renderPopup();
  fireEvent.click(screen.getByRole('button', { name: /Save Receipt/ }));

  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent('Please select a company');
  // The selects have no programmatic label yet (UI-013), so they are found by name.
  const company = document.querySelector('select[name="company_id"]'); // eslint-disable-line testing-library/no-node-access
  expect(company).toHaveAttribute('aria-invalid', 'true');
  expect(company).toHaveAttribute('aria-describedby', error.id);
  // The message comes before the first field, so it is not below the fold.
  expect(error.compareDocumentPosition(company) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // eslint-disable-line no-bitwise
  expect(api.post).not.toHaveBeenCalled();
});

test('the amount is marked when it is the invalid field', async () => {
  mockApi();
  renderPopup();
  await waitFor(() => expect(document.querySelector('select[name="company_id"]')).toHaveValue('1')); // eslint-disable-line testing-library/no-node-access
  fireEvent.click(screen.getByRole('button', { name: /Save Receipt/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Amount must be greater than 0');
  expect(screen.getByPlaceholderText('0.00')).toHaveAttribute('aria-invalid', 'true');
  expect(document.querySelector('select[name="company_id"]')).not.toHaveAttribute('aria-invalid'); // eslint-disable-line testing-library/no-node-access
});
