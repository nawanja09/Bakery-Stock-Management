import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import FinancialReceiptAdjustmentEditor from './FinancialReceiptAdjustmentEditor';
import api from '../../api';
import { PopupProvider } from '../context/PopupContext';

jest.mock('../../api');

const COMPANIES = [{ id: 1, name: 'JH' }, { id: 2, name: 'RD' }];
const BANKS_JH = [{ id: 1, bank_name: 'Bank A', account_number: '111' }, { id: 2, bank_name: 'Bank B', account_number: '222' }];
const BANKS_RD = [{ id: 3, bank_name: 'Bank C', account_number: '333' }];

const mockApi = (record) => {
  api.get.mockImplementation((url, config) => {
    if (url.startsWith('/adjustments/records/')) return Promise.resolve({ data: record });
    if (url === '/receive-types') return Promise.resolve({ data: [{ type_name: 'Bank Deposit' }] });
    if (url === '/purchases/companies') return Promise.resolve({ data: COMPANIES });
    if (url === '/finance/bank/accounts') {
      return Promise.resolve({ data: config.params.companyId === '1' ? BANKS_JH : BANKS_RD });
    }
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { message: 'saved' } });
};

const renderEditor = (props) => render(
  <PopupProvider>
    <FinancialReceiptAdjustmentEditor category="Bank Receive" onCancel={() => {}} onSaved={() => {}} {...props} />
  </PopupProvider>
);

beforeEach(() => jest.clearAllMocks());

describe('FinancialReceiptAdjustmentEditor - Company / Bank Account / Receive Type', () => {
  test('Pending card receipt: Company and Bank Account are editable selects; Receive Type stays locked', async () => {
    mockApi({
      id: 5, date: '2026-10-01', company_id: 1, bank_id: 1, bank_name: 'Bank A', account_number: '111',
      receive_type: 'Visa Card Payment', reference_number: 'VCP-1', amount: 5000, remark: '', status: 'Pending'
    });
    renderEditor({ embeddedId: '5', source: 'card' });

    const companySelect = await screen.findByLabelText(/^Company/);
    await waitFor(() => expect(companySelect).toHaveValue('1'));
    expect(companySelect).not.toBeDisabled();
    const bankSelect = screen.getByLabelText(/^Bank Account/);
    await waitFor(() => expect(within(bankSelect).getAllByRole('option').length).toBeGreaterThan(1));
    expect(bankSelect).not.toBeDisabled();
    expect(bankSelect).toHaveValue('1');
    expect(screen.getByLabelText(/^Receive Type/)).toBeDisabled();

    // Switching Company reloads the Bank Account list and clears the selection.
    fireEvent.change(companySelect, { target: { value: '2' } });
    await waitFor(() => expect(within(bankSelect).getAllByText(/Bank C/).length).toBeGreaterThan(0));
    expect(bankSelect).toHaveValue('');
  });

  test('Completed card receipt: Company and Bank Account are locked, with an explanatory note', async () => {
    mockApi({
      id: 9, date: '2026-09-01', company_id: 1, bank_id: 1, bank_name: 'Bank A', account_number: '111',
      receive_type: 'Visa Card Payment', reference_number: 'VCP-2', amount: 9000, remark: '', status: 'Completed'
    });
    renderEditor({ embeddedId: '9', source: 'card' });

    const companySelect = await screen.findByLabelText(/^Company/);
    expect(companySelect).toBeDisabled();
    expect(screen.getByLabelText(/^Bank Account/)).toBeDisabled();
    expect(screen.getByText(/reverse it to Pending in Card Ledger first/)).toBeInTheDocument();
  });

  test('Finance-sourced receipt: Company and Receive Type are both editable; save sends company_id / bank_id', async () => {
    mockApi({
      id: 3, date: '2026-10-01', company_id: 1, bank_id: 1, bank_name: 'Bank A', account_number: '111',
      receive_type: 'Bank Deposit', reference_number: 'BR-3', amount: 1200, remark: '', status: 1
    });
    renderEditor({ embeddedId: '3', source: 'finance' });

    const companySelect = await screen.findByLabelText(/^Company/);
    await waitFor(() => expect(companySelect).toHaveValue('1'));
    expect(companySelect).not.toBeDisabled();
    expect(screen.getByLabelText(/^Receive Type/)).not.toBeDisabled();

    fireEvent.change(companySelect, { target: { value: '2' } });
    const bankSelect = screen.getByLabelText(/^Bank Account/);
    await waitFor(() => expect(within(bankSelect).getAllByText(/Bank C/).length).toBeGreaterThan(0));
    fireEvent.change(bankSelect, { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Adjustment/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/adjustments/records/Bank%20Receive/finance/3', {
      date: '2026-10-01', amount: 1200, receive_type: 'Bank Deposit', reference_number: 'BR-3', remark: null,
      company_id: 2, bank_id: 3
    }));
  });
});
