import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import OtherLedgerManagement from './OtherLedgerManagement';
import api from '../../api';
import { PopupProvider } from '../context/PopupContext';

jest.mock('../../api');

const LEDGERS = [
  {
    id: 3, name: 'Director', status: 1, is_system: false, normal_balance: 'DEBIT', balance: 0,
    companies: [{ id: 1, name: 'JH' }, { id: 2, name: 'RD' }],
    company_balances: [{ company_id: 1, company_name: 'JH', balance: 0 }, { company_id: 2, company_name: 'RD', balance: 0 }]
  },
  {
    id: 20, name: 'AR Account', status: 1, is_system: true, normal_balance: 'DEBIT', balance: 500,
    companies: [{ id: 1, name: 'JH' }],
    company_balances: [{ company_id: 1, company_name: 'JH', balance: 500 }]
  }
];

const setUser = (role) => localStorage.setItem('user', JSON.stringify({ id: 1, role }));

const mockApi = () => {
  api.get.mockImplementation((url) => {
    if (url === '/other-ledgers') return Promise.resolve({ data: LEDGERS });
    if (url === '/purchases/companies') return Promise.resolve({ data: [{ id: 1, name: 'JH' }, { id: 2, name: 'RD' }] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { message: 'Opening balance set successfully', balance: 5000 } });
};

const renderPage = () => render(<PopupProvider><OtherLedgerManagement /></PopupProvider>);

beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); setUser('Accountant'); mockApi(); });

describe('OtherLedgerManagement - Opening Balance', () => {
  test('Set Opening Balance is offered for every linked ledger, including system accounts', async () => {
    renderPage();
    await screen.findByText('Director');
    expect(screen.getAllByTitle('Set Opening Balance')).toHaveLength(2); // Director + AR Account (both linked)
  });

  test('submits company_id, date and amount to the ledger-specific endpoint', async () => {
    renderPage();
    await screen.findByText('Director');
    fireEvent.click(screen.getAllByTitle('Set Opening Balance')[0]);
    await screen.findByText(/Opening balance for:/);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } }); // RD
    fireEvent.change(screen.getByLabelText('Opening balance date'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByPlaceholderText('Opening amount'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/other-ledgers/3/opening-balance', {
      company_id: '2', date: '2026-01-01', amount: 5000
    }));
    expect(await screen.findByText('Opening balance set for "Director"')).toBeInTheDocument();
  });

  test('server refusal (date not earlier than an existing entry) surfaces as an error popup', async () => {
    api.post.mockRejectedValue({ response: { data: { error: '"Director" has an entry dated 2026-09-15 for this Company - the opening balance date must be earlier than that.' } } });
    renderPage();
    await screen.findByText('Director');
    fireEvent.click(screen.getAllByTitle('Set Opening Balance')[0]);
    await screen.findByText(/Opening balance for:/);
    fireEvent.change(screen.getByLabelText('Opening balance date'), { target: { value: '2026-09-20' } });
    fireEvent.change(screen.getByPlaceholderText('Opening amount'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/the opening balance date must be earlier than that/)).toBeInTheDocument();
  });

  test('a negative amount is rejected client-side; nothing is sent', async () => {
    renderPage();
    await screen.findByText('Director');
    fireEvent.click(screen.getAllByTitle('Set Opening Balance')[0]);
    await screen.findByText(/Opening balance for:/);
    fireEvent.change(screen.getByPlaceholderText('Opening amount'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a valid opening balance')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('a ledger with no linked companies gets no Opening Balance button', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/other-ledgers') return Promise.resolve({ data: [{ ...LEDGERS[0], companies: [], company_balances: [] }] });
      if (url === '/purchases/companies') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await screen.findByText('Director');
    expect(screen.queryByTitle('Set Opening Balance')).not.toBeInTheDocument();
  });

  test('View Only (read-only) users see no Opening Balance button', async () => {
    setUser('View Only');
    renderPage();
    await screen.findByText('Director');
    expect(screen.queryByTitle('Set Opening Balance')).not.toBeInTheDocument();
  });
});
