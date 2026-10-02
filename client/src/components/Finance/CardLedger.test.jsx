import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CardLedger from './CardLedger';
import api from '../../api';
import { PopupProvider } from '../context/PopupContext';

jest.mock('../../api');

const PENDING = [
  { id: 1, transaction_date: '2026-09-10', amount: 100000, reference_number: 'VCP-1', remark: '', status: 'Pending', company_id: 1, company_name: 'JH', bank_id: 1, bank_name: 'Bank A', account_number: '111' },
  { id: 2, transaction_date: '2026-09-11', amount: 50000, reference_number: 'VCP-2', remark: '', status: 'Pending', company_id: 1, company_name: 'JH', bank_id: 1, bank_name: 'Bank A', account_number: '111' },
  { id: 3, transaction_date: '2026-09-11', amount: 20000, reference_number: 'VCP-3', remark: '', status: 'Pending', company_id: 2, company_name: 'RD', bank_id: 3, bank_name: 'Bank C', account_number: '333' },
  { id: 4, transaction_date: '2026-09-12', amount: 30000, reference_number: 'VCP-4', remark: '', status: 'Pending', company_id: 1, company_name: 'JH', bank_id: 2, bank_name: 'Bank B', account_number: '222' }
];
const COMPLETED = [
  {
    id: 9, realise_date: '2026-09-05', total_amount: 100000, realise_amount: 70000, remaining_balance: 30000,
    reference_number: 'OLD-1, OLD-2',
    cards: [
      { id: 21, transaction_date: '2026-09-01', reference_number: 'OLD-1', amount: 60000 },
      { id: 22, transaction_date: '2026-09-02', reference_number: 'OLD-2', amount: 40000 }
    ]
  }
];

const setUser = (role) => localStorage.setItem('user', JSON.stringify({ id: 7, role }));

const mockApi = () => {
  api.get.mockImplementation((url, config) => {
    if (url === '/finance/card-ledger') {
      if (config?.params?.status === 'Completed') {
        return Promise.resolve({ data: { transactions: COMPLETED, totals: { total_amount: 100000, realise_amount: 70000, remaining_balance: 30000 } } });
      }
      return Promise.resolve({ data: { transactions: PENDING, total: 200000 } });
    }
    if (url === '/purchases/companies') return Promise.resolve({ data: [{ id: 1, name: 'JH' }, { id: 2, name: 'RD' }] });
    if (url === '/finance/bank/accounts') {
      return Promise.resolve({ data: config.params.companyId === '1'
        ? [{ id: 1, bank_name: 'Bank A', account_number: '111' }, { id: 2, bank_name: 'Bank B', account_number: '222' }]
        : [{ id: 3, bank_name: 'Bank C', account_number: '333' }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { totals: { realiseAmount: 70000, remainingBalance: 30000 }, results: [] } });
};

const renderPage = () => render(<PopupProvider><CardLedger /></PopupProvider>);
const checkboxFor = (ref) => screen.getByRole('checkbox', { name: new RegExp(ref) });

describe('CardLedger page', () => {
  beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); setUser('Accountant'); mockApi(); });

  test('Pending has checkboxes and NO Action column; Realise button sits below the table', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Action');
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Realise/ }) && screen.getAllByRole('button', { name: /Realise/ }).length).toBe(1);
    const table = screen.getByRole('table');
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });

  test('selecting a row from another Company or Bank Account is refused with a message', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(checkboxFor('VCP-1'));
    fireEvent.click(checkboxFor('VCP-2')); // same company + bank: allowed
    expect(checkboxFor('VCP-2')).toBeChecked();

    fireEvent.click(checkboxFor('VCP-3')); // other company
    expect(await screen.findByText(/must belong to the same Company/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // dismiss the popup
    await waitFor(() => expect(screen.queryByText(/must belong to the same Company/)).not.toBeInTheDocument());
    expect(checkboxFor('VCP-3')).not.toBeChecked();

    fireEvent.click(checkboxFor('VCP-4')); // same company, other bank
    expect(await screen.findByText(/must belong to the same Bank Account/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByText(/must belong to the same Bank Account/)).not.toBeInTheDocument());
    expect(checkboxFor('VCP-4')).not.toBeChecked();
    expect(checkboxFor('VCP-1')).toBeChecked();
    expect(checkboxFor('VCP-2')).toBeChecked();
  });

  test('Realise with nothing selected shows a message and does not open the dialog', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(screen.getByRole('button', { name: /Realise/ }));
    expect(await screen.findByText(/select at least one card transaction/i)).toBeInTheDocument();
    expect(screen.queryByText('Realise Card Transaction')).not.toBeInTheDocument();
  });

  const openRealiseFor = async (...refs) => {
    await screen.findByText('VCP-1');
    refs.forEach((ref) => fireEvent.click(checkboxFor(ref)));
    fireEvent.click(screen.getByRole('button', { name: /^Realise$/ }));
    return screen.findByRole('dialog');
  };

  test('Realise page lists each selected transaction, then Total (read-only), Realise Amount, Remaining (read-only), Realise Date', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1', 'VCP-2');

    // Selected transactions shown separately with Date | Reference | Amount - and NO per-row amount input
    const headers = within(dialog).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Transaction Date', 'Reference No', 'Amount']);
    const rows = within(dialog).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('10/09/2026')).toBeInTheDocument();
    expect(within(rows[0]).getByText('VCP-1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('100,000.00')).toBeInTheDocument();
    expect(within(rows[1]).getByText('VCP-2')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('spinbutton')).toHaveLength(1); // only the one Realise Amount

    // Field order: Total -> Realise Amount -> Remaining -> Realise Date
    const order = ['Total Transaction Amount', 'Realise Amount', 'Remaining Balance', 'Realise Date']
      .map((name) => within(dialog).getByLabelText(new RegExp(`^${name}`)));
    for (let i = 0; i < order.length - 1; i += 1) {
      // eslint-disable-next-line no-bitwise
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    const total = within(dialog).getByLabelText('Total Transaction Amount');
    expect(total).toHaveAttribute('readonly');
    expect(total).toHaveValue('150,000.00'); // 100,000 + 50,000
    expect(within(dialog).getByLabelText('Remaining Balance')).toHaveAttribute('readonly');
  });

  test('Remaining Balance updates immediately; invalid Realise Amounts show a message and block confirm', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1', 'VCP-2');
    const amount = within(dialog).getByLabelText(/^Realise Amount/);
    const remaining = within(dialog).getByLabelText('Remaining Balance');

    fireEvent.change(amount, { target: { value: '70000' } });
    expect(remaining).toHaveValue('80,000.00');
    fireEvent.change(amount, { target: { value: '120000.5' } });
    expect(remaining).toHaveValue('29,999.50');

    for (const bad of ['150000', '150001']) { // equal to / above the Total
      fireEvent.change(amount, { target: { value: bad } });
      expect(within(dialog).getByText(/must be less than the Total Transaction Amount/)).toBeInTheDocument();
      expect(remaining).toHaveValue('');
      fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
      expect(api.post).not.toHaveBeenCalled();
    }

    for (const bad of ['0', '-5']) {
      fireEvent.change(amount, { target: { value: bad } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/greater than zero/);
    }
    fireEvent.change(amount, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Realise Amount is required');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('Realise Date is required before Confirm', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1');
    fireEvent.change(within(dialog).getByLabelText(/^Realise Amount/), { target: { value: '70000' } });
    fireEvent.change(within(dialog).getByLabelText(/^Realise Date/), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Realise Date is required');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('Confirm sends only the selected ids, the typed Realise Amount and the date (no client totals)', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1', 'VCP-2');
    fireEvent.change(within(dialog).getByLabelText(/^Realise Date/), { target: { value: '2026-10-02' } });
    fireEvent.change(within(dialog).getByLabelText(/^Realise Amount/), { target: { value: '70000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/finance/card-ledger/realise', {
      transaction_ids: [1, 2],
      realise_amount: '70000.00',
      realise_date: '2026-10-02'
    });
  });

  test('Completed tab: Company filter drives the Bank Account list and shows the 6 columns', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }));
    await screen.findByText('OLD-1');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Transaction Date', 'Realise Date', 'Reference No', 'Total Transaction Amount', 'Realise Amount', 'Remaining Balance']);
    expect(headers).not.toContain('Debit');
    expect(headers).not.toContain('Credit');
    // a realisation that covered two card transactions lists both (stacked) in one row
    const row = screen.getByText('OLD-2').closest('tr');
    expect(within(row).getByText('OLD-1')).toBeInTheDocument();
    expect(within(row).getByText('01/09/2026')).toBeInTheDocument();
    expect(within(row).getByText('02/09/2026')).toBeInTheDocument();
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells.slice(1)).toEqual(['05/09/2026', 'OLD-1OLD-2', '100,000.00', '70,000.00', '30,000.00']);

    const bank = screen.getByLabelText('Bank Account');
    await waitFor(() => expect(within(bank).getAllByRole('option').map((o) => o.textContent.trim())).toEqual(['Select Bank Account', 'Bank A  111', 'Bank B  222']));

    fireEvent.change(screen.getByLabelText('Company'), { target: { value: '2' } });
    await waitFor(() => expect(within(screen.getByLabelText('Bank Account')).getAllByRole('option').map((o) => o.textContent.trim())).toEqual(['Select Bank Account', 'Bank C  333']));
  });

  test('View Only users see no checkboxes and no Realise button', async () => {
    setUser('View Only');
    renderPage();
    await screen.findByText('VCP-1');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Realise/ })).not.toBeInTheDocument();
  });
});
