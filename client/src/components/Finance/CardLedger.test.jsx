import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CardLedger from './CardLedger';
import api from '../../api';
import { PopupProvider } from '../context/PopupContext';

jest.mock('../../api');

const PENDING = [
  { id: 1, transaction_date: '2026-09-10', amount: 10000, reference_number: 'VCP-1', remark: 'Sale receipt R1 14:07 - Cafe - M', status: 'Pending', company_id: 1, company_name: 'JH', bank_id: 1, bank_name: 'Bank A', account_number: '111', department_id: 1, department_name: 'Cafe', shift_no: '0104' },
  { id: 2, transaction_date: '2026-09-11', amount: 5000, reference_number: 'VCP-2', remark: '', status: 'Pending', company_id: 1, company_name: 'JH', bank_id: 1, bank_name: 'Bank A', account_number: '111', department_id: 2, department_name: 'Bakery', shift_no: '0105' },
  { id: 3, transaction_date: '2026-09-11', amount: 20000, reference_number: 'VCP-3', remark: '', status: 'Pending', company_id: 2, company_name: 'RD', bank_id: 3, bank_name: 'Bank C', account_number: '333', department_id: 1, department_name: 'Cafe', shift_no: '0104' },
  { id: 4, transaction_date: '2026-09-12', amount: 30000, reference_number: 'VCP-4', remark: '', status: 'Pending', company_id: 1, company_name: 'JH', bank_id: 2, bank_name: 'Bank B', account_number: '222', department_id: 1, department_name: 'Cafe', shift_no: '0104' },
  { id: 5, transaction_date: '2026-09-12', amount: 1000, reference_number: 'VCP-5', remark: '', status: 'Pending', company_id: 1, company_name: 'JH', bank_id: 1, bank_name: 'Bank A', account_number: '111', department_id: null, department_name: null, shift_no: null }
];
const COMPLETED = [
  {
    id: 9, realise_date: '2026-09-05', total_amount: 10000, realise_amount: 9700, commission_amount: 200, remaining_balance: 100,
    reference_number: 'OLD-1, OLD-2', departments: ['Cafe'],
    cards: [
      { id: 21, transaction_date: '2026-09-01', reference_number: 'OLD-1', amount: 6000 },
      { id: 22, transaction_date: '2026-09-02', reference_number: 'OLD-2', amount: 4000 }
    ]
  },
  { // realised before the commission split: no commission figure
    id: 8, realise_date: '2026-08-05', total_amount: 5000, realise_amount: 4000, commission_amount: null, remaining_balance: 1000,
    reference_number: 'LEGACY', departments: [], cards: [{ id: 20, transaction_date: '2026-08-01', reference_number: 'LEGACY', amount: 5000 }]
  }
];

// Cafe 2 %, Bakery 3 % (what the server answers for a selection).
const RATES = { 1: 2, 2: 3 };
let missingBakeryRate = false;
const commissionFor = ({ ids, departmentId }) => {
  const groups = new Map();
  String(ids).split(',').map(Number).forEach((id) => {
    const row = PENDING.find((r) => r.id === id);
    const dept = row.department_id || (departmentId ? Number(departmentId) : null);
    if (!dept) return;
    const g = groups.get(dept) || { department_id: dept, department_name: dept === 1 ? 'Cafe' : 'Bakery', transaction_count: 0, amount: 0 };
    g.transaction_count += 1; g.amount += row.amount;
    groups.set(dept, g);
  });
  const list = [...groups.values()].map((g) => (missingBakeryRate && g.department_id === 2
    ? { ...g, rate: null, expected_commission: null }
    : { ...g, rate: RATES[g.department_id], expected_commission: (g.amount * RATES[g.department_id]) / 100 }));
  const unassigned = String(ids).split(',').map(Number).filter((id) => !PENDING.find((r) => r.id === id).department_id).length;
  const problems = list.filter((g) => g.rate === null)
    .map((g) => `No active Credit Card Rate is configured for Branch / Department "${g.department_name}".`);
  if (unassigned && !departmentId) problems.push('Card transaction "VCP-5" has no Branch / Department.');
  return { groups: list, problems, unassigned_count: unassigned, expected_commission: problems.length ? null : list.reduce((t, g) => t + g.expected_commission, 0) };
};

const setUser = (role) => localStorage.setItem('user', JSON.stringify({ id: 7, role }));

const mockApi = () => {
  api.get.mockImplementation((url, config) => {
    if (url === '/finance/card-ledger') {
      if (config?.params?.status === 'Completed') {
        return Promise.resolve({ data: { transactions: COMPLETED, totals: { total_amount: 15000, commission_amount: 200, realise_amount: 13700, remaining_balance: 1100 } } });
      }
      return Promise.resolve({ data: { transactions: PENDING, total: 66000 } });
    }
    if (url === '/finance/card-ledger/commission') return Promise.resolve({ data: commissionFor(config.params) });
    if (url === '/departments') return Promise.resolve({ data: [{ id: 1, name: 'Cafe' }, { id: 2, name: 'Bakery' }] });
    if (url === '/purchases/companies') return Promise.resolve({ data: [{ id: 1, name: 'JH' }, { id: 2, name: 'RD' }] });
    if (url === '/finance/bank/accounts/all') {
      return Promise.resolve({ data: [
        { id: 1, company: 'JH', bank_name: 'Bank A', account_number: '111' },
        { id: 2, company: 'JH', bank_name: 'Bank B', account_number: '222' },
        { id: 3, company: 'RD', bank_name: 'Bank C', account_number: '333' }
      ] });
    }
    if (url === '/finance/bank/accounts') {
      return Promise.resolve({ data: config.params.companyId === '1'
        ? [{ id: 1, bank_name: 'Bank A', account_number: '111' }, { id: 2, bank_name: 'Bank B', account_number: '222' }]
        : [{ id: 3, bank_name: 'Bank C', account_number: '333' }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { totals: { realiseAmount: 9700, expectedCommission: 200, bankCharge: 100, remainingBalance: 100 } } });
};

const renderPage = () => render(<PopupProvider><CardLedger /></PopupProvider>);
const checkboxFor = (ref) => screen.getByRole('checkbox', { name: new RegExp(`card transaction ${ref}$`) });
const selectAll = () => screen.getByRole('checkbox', { name: 'Select all card transactions' });
const pendingCalls = () => api.get.mock.calls.filter(([url, c]) => url === '/finance/card-ledger' && c.params.status === 'Pending');

describe('CardLedger page', () => {
  beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); setUser('Accountant'); missingBakeryRate = false; mockApi(); });

  test('Pending: Select All + row checkboxes, Branch / Department and Shift No columns, NO Action column', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['', 'Transaction Date', 'Company', 'Bank Account', 'Branch / Department', 'Shift No', 'Reference No', 'Remark', 'Amount (Rs.)']);
    expect(screen.getAllByRole('checkbox')).toHaveLength(6); // Select All + 5 rows
    const row = screen.getByText('VCP-1').closest('tr');
    expect(within(row).getByText('Cafe')).toBeInTheDocument();
    expect(within(row).getByText('0104')).toBeInTheDocument();
    expect(within(row).getByText('Sale receipt R1 14:07 - Cafe - M')).toBeInTheDocument();
    expect(within(screen.getByText('VCP-5').closest('tr')).getByText('Not assigned')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByRole('button')).not.toBeInTheDocument();
  });

  test('filters: Company, Bank Account (follows Company), Branch / Department and Shift No are sent together', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    // Bank list follows the chosen Company
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: '2' } });
    await waitFor(() => expect(within(screen.getByLabelText('Bank Account')).getAllByRole('option').map((o) => o.textContent.trim()))
      .toEqual(['All bank accounts', 'Bank C  333']));
    fireEvent.change(screen.getByLabelText('Bank Account'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Branch / Department'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Shift No'), { target: { value: '0104' } });

    await waitFor(() => expect(pendingCalls().at(-1)[1].params).toEqual({
      status: 'Pending', companyId: '2', bankId: '3', departmentId: '1', shiftNo: '0104'
    }));
  });

  test('Select All selects only the displayed rows of one Company + Bank Account; clicking again clears', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(selectAll());
    expect(await screen.findByText(/cannot be realised together/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' })); // dismiss the popup
    await waitFor(() => expect(screen.queryByText(/cannot be realised together/)).not.toBeInTheDocument());
    // VCP-1, VCP-2, VCP-5 = JH / Bank A (the first row's group); VCP-3 (RD) and VCP-4 (Bank B) are left out
    expect(checkboxFor('VCP-1')).toBeChecked();
    expect(checkboxFor('VCP-2')).toBeChecked();
    expect(checkboxFor('VCP-5')).toBeChecked();
    expect(checkboxFor('VCP-3')).not.toBeChecked();
    expect(checkboxFor('VCP-4')).not.toBeChecked();
    expect(selectAll()).toBeChecked();

    fireEvent.click(selectAll());
    ['VCP-1', 'VCP-2', 'VCP-3', 'VCP-4', 'VCP-5'].forEach((ref) => expect(checkboxFor(ref)).not.toBeChecked());
  });

  test('Select All extends the CURRENT selection group; individual selection still works', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(checkboxFor('VCP-4')); // JH / Bank B
    expect(selectAll()).toBeChecked(); // the only Bank B row is selected
    fireEvent.click(checkboxFor('VCP-4'));
    expect(selectAll()).not.toBeChecked();

    fireEvent.click(checkboxFor('VCP-3')); // RD / Bank C group
    fireEvent.click(selectAll()); // already all of RD / Bank C -> clears
    expect(checkboxFor('VCP-3')).not.toBeChecked();
  });

  test('selecting a row from another Company or Bank Account is refused with a message', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(checkboxFor('VCP-1'));
    fireEvent.click(checkboxFor('VCP-2')); // same company + bank (other department): allowed
    expect(checkboxFor('VCP-2')).toBeChecked();

    fireEvent.click(checkboxFor('VCP-3')); // other company
    expect(await screen.findByText(/must belong to the same Company/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByText(/must belong to the same Company/)).not.toBeInTheDocument());
    expect(checkboxFor('VCP-3')).not.toBeChecked();

    fireEvent.click(checkboxFor('VCP-4')); // same company, other bank
    expect(await screen.findByText(/must belong to the same Bank Account/)).toBeInTheDocument();
    expect(checkboxFor('VCP-4')).not.toBeChecked();
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
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Credit Card Rate (%)')).not.toHaveValue('Loading...'));
    return dialog;
  };

  test('Realise form: fields in order, rate + commission from Credit Card Rate, calculated fields read-only', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1');

    const order = ['Total Transaction Amount', 'Branch / Department', 'Credit Card Rate \\(%\\)', 'Expected Commission',
      'Realise Date', 'Realise Amount', 'Remaining Balance / Bank Charge']
      .map((name) => within(dialog).getByLabelText(new RegExp(`^${name}`)));
    for (let i = 0; i < order.length - 1; i += 1) {
      // eslint-disable-next-line no-bitwise
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(within(dialog).getByLabelText('Total Transaction Amount')).toHaveValue('10,000.00');
    expect(within(dialog).getByLabelText('Branch / Department')).toHaveValue('Cafe');
    expect(within(dialog).getByLabelText('Credit Card Rate (%)')).toHaveValue('2.00%');
    expect(within(dialog).getByLabelText('Expected Commission')).toHaveValue('200.00');
    ['Total Transaction Amount', 'Branch / Department', 'Credit Card Rate (%)', 'Expected Commission', 'Remaining Balance / Bank Charge']
      .forEach((name) => expect(within(dialog).getByLabelText(name)).toHaveAttribute('readonly'));
    expect(within(dialog).queryByLabelText(/^Bank Charge/)).not.toBeInTheDocument(); // no manual Bank Charge input
    expect(within(dialog).getAllByRole('spinbutton')).toHaveLength(1); // only the Realise Amount is typed
  });

  test('Test Case 1 / 2: Remaining Balance = Total - Realise - Commission; 0 is valid; too much is refused', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1');
    const amount = within(dialog).getByLabelText(/^Realise Amount/);
    const remaining = within(dialog).getByLabelText('Remaining Balance / Bank Charge');

    fireEvent.change(amount, { target: { value: '9700' } });
    expect(remaining).toHaveValue('100.00');
    fireEvent.change(amount, { target: { value: '9800' } });
    expect(remaining).toHaveValue('0.00');
    expect(within(dialog).queryByText(/cannot be more than/)).not.toBeInTheDocument();

    fireEvent.change(amount, { target: { value: '9800.01' } });
    expect(within(dialog).getByText(/cannot be more than Rs\. 9,800\.00/)).toBeInTheDocument();
    expect(remaining).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
    expect(api.post).not.toHaveBeenCalled();

    for (const bad of ['0', '-5']) {
      fireEvent.change(amount, { target: { value: bad } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/greater than zero/);
    }
    expect(api.post).not.toHaveBeenCalled();
  });

  test('Test Case 4: several Branches / Departments - each rate on its own amount, summed', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1', 'VCP-2');
    expect(within(dialog).getByLabelText('Branch / Department')).toHaveValue('Cafe, Bakery');
    expect(within(dialog).getByLabelText('Credit Card Rate (%)')).toHaveValue('Cafe 2.00% · Bakery 3.00%');
    expect(within(dialog).getByLabelText('Expected Commission')).toHaveValue('350.00'); // 200 + 150
    const breakdown = within(dialog).getByRole('list', { name: 'Commission by Branch / Department' });
    expect(within(breakdown).getByText('Rs. 200.00')).toBeInTheDocument();
    expect(within(breakdown).getByText('Rs. 150.00')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Realise Amount/), { target: { value: '14500' } });
    expect(within(dialog).getByLabelText('Remaining Balance / Bank Charge')).toHaveValue('150.00');
  });

  test('Test Case 3: missing Credit Card Rate -> clear error, Confirm does not save', async () => {
    missingBakeryRate = true;
    renderPage();
    const dialog = await openRealiseFor('VCP-2');
    expect(await within(dialog).findByText(/No active Credit Card Rate is configured for Branch \/ Department "Bakery"/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Realise Amount/), { target: { value: '4000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
    await waitFor(() => expect(within(dialog).getAllByRole('alert').length).toBe(2));
    expect(api.post).not.toHaveBeenCalled();
  });

  test('a transaction without Branch / Department needs one chosen; it is sent with the request', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-5');
    fireEvent.change(within(dialog).getByLabelText(/^Realise Amount/), { target: { value: '900' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
    expect(await within(dialog).findByText('Select the Branch / Department of the transactions that have none')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/without one/), { target: { value: '2' } });
    await waitFor(() => expect(within(dialog).getByLabelText('Expected Commission')).toHaveValue('30.00')); // Bakery 3 %
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1]).toMatchObject({ transaction_ids: [5], realise_amount: '900.00', department_id: 2 });
  });

  test('Realise Date is required before Confirm', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1');
    fireEvent.change(within(dialog).getByLabelText(/^Realise Amount/), { target: { value: '9700' } });
    fireEvent.change(within(dialog).getByLabelText(/^Realise Date/), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Realise/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Realise Date is required');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('Confirm sends only ids, the typed Realise Amount and the date (no client totals); success names both expenses', async () => {
    renderPage();
    const dialog = await openRealiseFor('VCP-1');
    fireEvent.change(within(dialog).getByLabelText(/^Realise Date/), { target: { value: '2026-10-02' } });
    fireEvent.change(within(dialog).getByLabelText(/^Realise Amount/), { target: { value: '9700' } });
    const confirm = within(dialog).getByRole('button', { name: /Confirm Realise/ });
    fireEvent.click(confirm);
    fireEvent.click(confirm); // double click: still ONE request

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/finance/card-ledger/realise', {
      transaction_ids: [1], realise_amount: '9700.00', realise_date: '2026-10-02'
    });
    expect(await screen.findByText(/Visa Card Payment commission Rs\. 200\.00; Credit Card Bank Charge Rs\. 100\.00/)).toBeInTheDocument();
  });

  test('Completed tab: new columns incl. Expected Commission and Bank Charge; legacy rows show a dash', async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }));
    await screen.findByText('OLD-1');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Transaction Date', 'Realise Date', 'Reference No', 'Branch / Department', 'Total Transaction Amount',
      'Expected Commission', 'Realise Amount', 'Remaining Balance / Bank Charge']);
    const row = screen.getByText('OLD-2').closest('tr');
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells.slice(1)).toEqual(['05/09/2026', 'OLD-1OLD-2', 'Cafe', '10,000.00', '200.00', '9,700.00', '100.00']);
    const legacy = within(screen.getByText('LEGACY').closest('tr')).getAllByRole('cell').map((c) => c.textContent);
    expect(legacy.slice(3)).toEqual(['—', '5,000.00', '—', '4,000.00', '1,000.00']);

    // Company drives the Bank Account list; Branch / Department + Shift No filter the realisations
    await waitFor(() => expect(within(screen.getByLabelText('Bank Account')).getAllByRole('option').map((o) => o.textContent.trim()))
      .toEqual(['Select Bank Account', 'Bank A  111', 'Bank B  222']));
    fireEvent.change(screen.getByLabelText('Branch / Department'), { target: { value: '2' } });
    await waitFor(() => {
      const last = api.get.mock.calls.filter(([url, c]) => url === '/finance/card-ledger' && c.params.status === 'Completed').at(-1);
      expect(last[1].params).toMatchObject({ companyId: '1', bankId: '1', departmentId: '2' });
    });
  });

  test('View Only users see no checkboxes and no Realise button', async () => {
    setUser('View Only');
    renderPage();
    await screen.findByText('VCP-1');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Realise/ })).not.toBeInTheDocument();
  });

  const openCompleted = async () => {
    renderPage();
    await screen.findByText('VCP-1');
    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }));
    await screen.findByText('OLD-1');
  };

  test('Completed Actions column: Accountant sees neither Reverse nor Edit', async () => {
    setUser('Accountant');
    await openCompleted();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Reverse realisation/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Edit realisation/)).not.toBeInTheDocument();
  });

  test('Completed Actions column: Admin sees only Reverse', async () => {
    setUser('Admin');
    await openCompleted();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Reverse realisation/).length).toBe(2);
    expect(screen.queryByLabelText(/Edit realisation/)).not.toBeInTheDocument();
  });

  test('Completed Actions column: Super Admin sees both Reverse and Edit', async () => {
    setUser('Super Admin');
    await openCompleted();
    expect(screen.getAllByLabelText(/Reverse realisation/).length).toBe(2);
    expect(screen.getAllByLabelText(/Edit realisation/).length).toBe(2);
  });

  test('Reverse: confirms, calls DELETE and refreshes both tabs', async () => {
    setUser('Super Admin');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockResolvedValue({ data: { message: 'Card realisation reversed to Pending' } });
    await openCompleted();

    const before = api.get.mock.calls.length;
    fireEvent.click(screen.getAllByLabelText(/Reverse realisation/)[0]);
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/finance/card-ledger/realisations/9'));
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(before)); // both tabs re-fetched
    expect(await screen.findByText('Card realisation reversed to Pending')).toBeInTheDocument();
  });

  test('Reverse: declining the confirmation sends nothing', async () => {
    setUser('Admin');
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    await openCompleted();
    fireEvent.click(screen.getAllByLabelText(/Reverse realisation/)[0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('Edit: a multi-card realisation keeps Branch / Department and Total Transaction Amount read-only', async () => {
    setUser('Super Admin');
    await openCompleted();
    fireEvent.click(screen.getAllByLabelText(/Edit realisation 9$/)[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Card Realisation' });
    expect(within(dialog).getByLabelText(/^Total Transaction Amount/)).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText('Branch / Department')).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText(/^Expected Commission/)).not.toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText(/^Realise Amount/)).not.toHaveAttribute('readonly');
  });

  test('Edit: a single-card realisation - Remaining Balance recalculates; over-limit is refused; success saves', async () => {
    setUser('Super Admin');
    api.put.mockResolvedValue({ data: { message: 'Card realisation updated' } });
    await openCompleted();
    fireEvent.click(screen.getAllByLabelText(/Edit realisation 8$/)[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Edit Card Realisation' });

    expect(within(dialog).getByLabelText(/^Total Transaction Amount/)).not.toHaveAttribute('readonly');
    const commission = within(dialog).getByLabelText(/^Expected Commission/);
    const remaining = within(dialog).getByLabelText('Remaining Balance / Bank Charge');
    fireEvent.change(commission, { target: { value: '5000' } }); // total 5000, realise 4000 -> would be negative
    expect(remaining).toHaveValue('-4,000.00');
    fireEvent.click(within(dialog).getByRole('button', { name: /Save/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/cannot be more than/);
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.change(commission, { target: { value: '200' } }); // total 5000, realise 4000 -> remaining 800
    expect(remaining).toHaveValue('800.00');
    fireEvent.click(within(dialog).getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/finance/card-ledger/realisations/8', {
      total_amount: '5000', expected_commission: '200', realise_amount: '4000'
    }));
    expect(await screen.findByText('Card realisation updated')).toBeInTheDocument();
  });
});
