import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import StaffLoans from './StaffLoans';
import api from '../../api';
import { PopupProvider } from '../context/PopupContext';

jest.mock('../../api');

const LOANS = [
  { id: 1, employee_id: 1, employee_name: 'Employee A', loan_amount: 50000, balance: 40000, total_received: 10000, issued_date: '2026-09-21', cheque_details: 'CHQ 1', status: 'Active' },
  { id: 2, employee_id: 2, employee_name: 'Employee B', loan_amount: 30000, balance: 0, total_received: 30000, issued_date: '2026-09-18', cheque_details: null, status: 'Settled' }
];

const setUser = (role) => localStorage.setItem('user', JSON.stringify({ id: 7, role }));

const mockApi = () => {
  api.get.mockImplementation((url) => {
    if (url === '/staff-loans') return Promise.resolve({ data: LOANS });
    if (url === '/staff-loans/form-options') {
      return Promise.resolve({ data: {
        employees: [{ id: 1, employee_code: 'EMP-001', employee_name: 'Employee A' }],
        companies: [{ id: 1, name: 'JH' }]
      } });
    }
    if (url === '/staff-loans/1/repayments') {
      return Promise.resolve({ data: { loan: LOANS[0], repayments: [{ id: 5, amount: 10000, received_date: '2026-09-10', balance_after: 40000 }] } });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { loan: { ...LOANS[0], balance: 30000 } } });
};

const renderPage = () => render(<PopupProvider><StaffLoans /></PopupProvider>);

describe('StaffLoans page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    setUser('Accountant');
    mockApi();
  });

  test('shows exactly the five loan columns, dd/mm/yyyy dates and formatted amounts', async () => {
    renderPage();
    await screen.findByText('Employee B');

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(0, 5)).toEqual(['Issue Date', 'Employee Name', 'Loan Amount', 'Balance', 'Action']);

    const row = screen.getByText('Employee A', { selector: 'td' }).closest('tr');
    expect(within(row).getByText('21/09/2026')).toBeInTheDocument();
    expect(within(row).getByText('50,000.00')).toBeInTheDocument();
    expect(within(row).getByText('40,000.00')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Receive Cash' })).toBeInTheDocument();
  });

  test('a settled loan shows "Settled" and has no Receive Cash button', async () => {
    renderPage();
    const row = (await screen.findByText('Employee B', { selector: 'td' })).closest('tr');
    expect(within(row).getByText('Settled')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Receive Cash' })).not.toBeInTheDocument();
  });

  test('create form blocks zero / negative / missing values before calling the API', async () => {
    renderPage();
    await screen.findByText('Employee A', { selector: 'td' });
    await screen.findByRole('option', { name: /Employee A \(EMP-001\)/ });

    fireEvent.click(screen.getByRole('button', { name: 'Create Loan' }));
    expect(await screen.findByText('Please select an employee')).toBeInTheDocument();
    expect(screen.getByText('Loan Amount is required')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Employee Name/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Loan Amount/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Loan' }));
    expect(await screen.findByText('Loan Amount must be greater than zero')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Loan Amount/), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Loan' }));
    expect(await screen.findByText('Loan Amount must be greater than zero')).toBeInTheDocument();

    expect(api.post).not.toHaveBeenCalled();
  });

  test('creating a loan posts the entered values and reloads the list from the API', async () => {
    renderPage();
    await screen.findByRole('option', { name: /Employee A/ });

    fireEvent.change(screen.getByLabelText(/Employee Name/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Loan Amount/), { target: { value: '50000' } });
    fireEvent.change(screen.getByLabelText(/Issued Date/), { target: { value: '2026-09-21' } });
    fireEvent.change(screen.getByLabelText(/Issued Cheque Details/), { target: { value: 'CHQ 000123' } });
    const loadsBefore = api.get.mock.calls.filter(([url]) => url === '/staff-loans').length;
    fireEvent.click(screen.getByRole('button', { name: 'Create Loan' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/staff-loans', {
      employee_id: 1, company_id: 1, loan_amount: '50000', issued_date: '2026-09-21', cheque_details: 'CHQ 000123'
    }));
    await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/staff-loans').length).toBe(loadsBefore + 1));
    expect(await screen.findByText('Staff loan created successfully')).toBeInTheDocument();
  });

  test('Receive Cash modal shows employee, loan amount and balance, and rejects amounts above the balance', async () => {
    renderPage();
    const row = (await screen.findByText('Employee A', { selector: 'td' })).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Receive Cash' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Employee A')).toBeInTheDocument();
    expect(within(dialog).getByText('Rs. 50,000.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Rs. 40,000.00')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '40000.01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Receive Cash/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('cannot exceed the outstanding balance of Rs. 40,000.00');
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '10000' } });
    fireEvent.change(within(dialog).getByLabelText(/Date/), { target: { value: '2026-09-21' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Receive Cash/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/staff-loans/1/repayments', {
      amount: '10000', received_date: '2026-09-21'
    }));
    // The Receive Cash modal closes (the success notification is a separate dialog).
    await waitFor(() => expect(document.getElementById('sl-receive-title')).toBeNull());
    expect(await screen.findByText(/Received Rs\. 10,000\.00 from Employee A\. Loan balance is now Rs\. 30,000\.00\./)).toBeInTheDocument();
  });

  test('a server-side rejection is shown inside the modal and the modal stays open', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'This loan is already fully settled. No further cash can be received.' } } });
    renderPage();
    const row = (await screen.findByText('Employee A', { selector: 'td' })).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Receive Cash' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '100' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Receive Cash/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already fully settled');
  });

  test('history modal lists repayments from the API', async () => {
    renderPage();
    const row = (await screen.findByText('Employee A', { selector: 'td' })).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: /repayment history/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('10/09/2026')).toBeInTheDocument();
    expect(within(dialog).getAllByText('10,000.00').length).toBeGreaterThan(0);
  });

  test('View Only users see the loans but no create form and no Receive Cash button', async () => {
    setUser('View Only');
    renderPage();
    await screen.findByText('Employee A', { selector: 'td' });
    expect(screen.queryByText('Create Staff Loan')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Receive Cash' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/staff-loans/form-options');
  });
});
