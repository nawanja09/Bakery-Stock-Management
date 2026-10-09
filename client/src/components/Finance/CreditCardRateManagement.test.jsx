import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CreditCardRateManagement, { validateRate } from './CreditCardRateManagement';
import api from '../../api';
import { PopupProvider } from '../context/PopupContext';

jest.mock('../../api');

const RATES = [
  { id: 1, department_id: 1, department_name: 'Cafe', rate: '2.0000', status: 1 },
  { id: 2, department_id: 2, department_name: 'Bakery', rate: '3.0000', status: 0 }
];

const setUser = (role) => localStorage.setItem('user', JSON.stringify({ id: 7, role }));
const renderPage = () => render(<PopupProvider><CreditCardRateManagement /></PopupProvider>);

describe('Credit Card Rate management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    setUser('Accountant');
    window.confirm = jest.fn(() => true);
    api.get.mockImplementation((url) => {
      if (url === '/credit-card-rates') return Promise.resolve({ data: RATES });
      if (url === '/departments') return Promise.resolve({ data: [{ id: 1, name: 'Cafe' }, { id: 2, name: 'Bakery' }, { id: 3, name: 'Pastry' }] });
      return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValue({ data: { message: 'Credit Card Rate added' } });
    api.put.mockResolvedValue({ data: { message: 'Credit Card Rate updated' } });
    api.patch.mockResolvedValue({ data: { message: 'ok' } });
  });

  test('validateRate: numeric, 0 - 100, at most 2 decimals', () => {
    expect(validateRate('2')).toBe('');
    expect(validateRate('0')).toBe('');
    expect(validateRate('100')).toBe('');
    expect(validateRate('2.25')).toBe('');
    ['', 'abc', '-1', '100.01', '2.255'].forEach((bad) => expect(validateRate(bad)).not.toBe(''));
  });

  test('lists Branch / Department, rate, status and actions', async () => {
    renderPage();
    const row = (await screen.findByText('Cafe')).closest('tr');
    expect(within(row).getByText('2.00%')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(within(screen.getByText('Bakery').closest('tr')).getByText('Inactive')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['BRANCH / DEPARTMENT', 'CREDIT CARD RATE (%)', 'STATUS', 'ACTIONS']);
  });

  test('add: refuses a second active rate for the same department and invalid rates; saves a valid one', async () => {
    renderPage();
    await screen.findByText('Cafe');
    fireEvent.click(screen.getByRole('button', { name: /Add Credit Card Rate/ }));
    const department = screen.getByLabelText('Branch / Department');
    const rate = screen.getByLabelText('Credit Card Rate (%)');

    fireEvent.change(department, { target: { value: '1' } }); // Cafe already active
    fireEvent.change(rate, { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already has an active Credit Card Rate/);

    fireEvent.change(department, { target: { value: '3' } });
    fireEvent.change(rate, { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/between 0 and 100/);
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(rate, { target: { value: '1.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/credit-card-rates', { department_id: 3, rate: '1.75' }));
  });

  test('edit and activate / deactivate call the API', async () => {
    renderPage();
    await screen.findByText('Cafe');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Cafe' }));
    fireEvent.change(screen.getByLabelText('Credit Card Rate (%)'), { target: { value: '2.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/credit-card-rates/1', { department_id: 1, rate: '2.25' }));

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Cafe' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/credit-card-rates/1/deactivate'));
    fireEvent.click(screen.getByRole('button', { name: 'Activate Bakery' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/credit-card-rates/2/activate'));
  });

  test('view-only users see no Add / Edit / Activate actions', async () => {
    setUser('View Only');
    renderPage();
    await screen.findByText('Cafe');
    expect(screen.queryByRole('button', { name: /Add Credit Card Rate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Cafe' })).not.toBeInTheDocument();
  });
});
