import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import dayjs from 'dayjs';
import PeriodClose, { lastClosedMonth, monthsText, timeLeft } from './PeriodClose';
import { PopupProvider } from '../context/PopupContext';
import { ConfirmProvider } from '../common/ui';
import api from '../../api';

jest.mock('../../api');

const STATUS = { open_months: 2, today: '2026-10-16', closed_before: '2026-09-01', reopened: [] };

const REQUESTS = [
  {
    id: 3, from_month: '2026-07', to_month: '2026-07', reason: 'Late supplier invoice found for July', status: 'Pending', is_active: false,
    requested_by: 4, requested_by_name: 'Admin', requested_at: '2026-10-16 09:00:00'
  },
  {
    id: 2, from_month: '2026-05', to_month: '2026-06', reason: 'Wrong payment date on two cheques', status: 'Approved', is_active: true,
    requested_by_name: 'Admin', requested_at: '2026-10-15 10:00:00', decided_by_name: 'Super Admin', decided_at: '2026-10-15 10:30:00',
    decision_note: 'Go ahead', expires_at: dayjs().add(5, 'hour').toISOString()
  },
  {
    id: 1, from_month: '2026-03', to_month: '2026-03', reason: 'Not needed any more here', status: 'Rejected', is_active: false,
    requested_by_name: 'Admin', requested_at: '2026-10-01 10:00:00', decided_by_name: 'Super Admin', decided_at: '2026-10-01 11:00:00',
    decision_note: 'Use April'
  }
];

const mockApi = (requests = REQUESTS) => {
  api.get.mockImplementation((url) => {
    if (url === '/period-close/status') return Promise.resolve({ data: STATUS });
    if (url === '/period-close/requests') return Promise.resolve({ data: requests });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
  api.post.mockResolvedValue({ data: { message: 'Done' } });
};

const renderAs = (role) => {
  localStorage.setItem('user', JSON.stringify({ role }));
  return render(
    <PopupProvider><ConfirmProvider><PeriodClose /></ConfirmProvider></PopupProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockApi();
});

test('helpers: the last closed month, month text and the time left', () => {
  expect(lastClosedMonth('2026-09-01')).toBe('2026-08');
  expect(lastClosedMonth('2026-01-01')).toBe('2025-12');
  expect(lastClosedMonth(undefined)).toBe('');
  expect(monthsText('2026-07', '2026-07')).toBe('Jul 2026');
  expect(monthsText('2026-05', '2026-06')).toBe('May 2026 - Jun 2026');
  const now = dayjs('2026-10-16T10:00:00');
  expect(timeLeft(now.add(125, 'minute'), now)).toBe('2h 5m left');
  expect(timeLeft(now.add(40, 'minute'), now)).toBe('40m left');
  expect(timeLeft(now.subtract(1, 'minute'), now)).toBe('expired');
});

test('shows the open window, the tiles and every request with its status', async () => {
  renderAs('Super Admin');
  const table = await screen.findByRole('table');
  expect(await screen.findByText(/Only the last 2 months are open \(from 01 Sep 2026\)/)).toBeInTheDocument();

  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(within(rows[0]).getByText('Jul 2026')).toBeInTheDocument();
  expect(within(rows[0]).getByText('Pending')).toBeInTheDocument();
  expect(within(rows[1]).getByText('May 2026 - Jun 2026')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Approved')).toBeInTheDocument();
  expect(within(rows[1]).getByText(/h \d+m left|\d+m left/)).toBeInTheDocument();
  expect(within(rows[2]).getByText('Rejected')).toBeInTheDocument();
  expect(within(rows[2]).getByText('Use April')).toBeInTheDocument();

  expect(screen.getByText('Re-opened now').parentElement).toHaveTextContent('1'); // eslint-disable-line testing-library/no-node-access
  expect(screen.getByText('Waiting for approval').parentElement).toHaveTextContent('1'); // eslint-disable-line testing-library/no-node-access
});

test('an Expired approval is listed as Expired', async () => {
  mockApi([{ ...REQUESTS[1], status: 'Expired', is_active: false }]);
  renderAs('Admin');
  const table = await screen.findByRole('table');
  expect(within(table).getByText('Expired')).toBeInTheDocument();
  expect(within(table).queryByRole('button', { name: /Close request/ })).toBeNull();
});

test('only the Super Admin sees Approve and Reject; an Admin sees that the request is waiting', async () => {
  renderAs('Admin');
  await screen.findByRole('table');
  expect(screen.queryByRole('button', { name: 'Approve request 3' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reject request 3' })).toBeNull();
  expect(screen.getByText('Waiting for the Super Admin')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close request 2 again' })).toBeInTheDocument();
});

test('the Super Admin sees Approve and Reject on a pending request only', async () => {
  renderAs('Super Admin');
  await screen.findByRole('table');
  expect(screen.getByRole('button', { name: 'Approve request 3' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reject request 3' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve request 2' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Approve request 1' })).toBeNull();
});

test('sends a request for a closed month, only newer months than the window cannot be picked', async () => {
  renderAs('Admin');
  await screen.findByRole('table');
  const from = screen.getByLabelText('From month');
  expect(from).toHaveAttribute('max', '2026-08');

  fireEvent.change(from, { target: { value: '2026-07' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Late supplier invoice found for July' } });
  fireEvent.click(screen.getByRole('button', { name: /Send request/ }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/period-close/requests', {
    from_month: '2026-07', to_month: '2026-07', reason: 'Late supplier invoice found for July'
  }));
  await waitFor(() => expect(api.get.mock.calls.filter(([url]) => url === '/period-close/requests').length).toBeGreaterThan(1));
});

test('a range is sent as typed; a too short reason is not sent', async () => {
  renderAs('Admin');
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('From month'), { target: { value: '2026-05' } });
  fireEvent.change(screen.getByLabelText('To month (optional)'), { target: { value: '2026-06' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'short' } });
  fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
  expect(await screen.findByText(/Give the reason \(at least 10 characters\)/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Two cheques were dated wrongly' } });
  fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/period-close/requests', {
    from_month: '2026-05', to_month: '2026-06', reason: 'Two cheques were dated wrongly'
  }));
});

test('the server\'s reason is shown when a request is refused', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: 'August 2026 is still open - only closed months can be re-opened' } } });
  renderAs('Admin');
  await screen.findByRole('table');
  fireEvent.change(screen.getByLabelText('From month'), { target: { value: '2026-07' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Late supplier invoice found for July' } });
  fireEvent.click(screen.getByRole('button', { name: /Send request/ }));
  expect(await screen.findByText(/only closed months can be re-opened/)).toBeInTheDocument();
});

test('the Super Admin approves for a chosen number of hours', async () => {
  renderAs('Super Admin');
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Approve request 3' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(/Late supplier invoice found for July/)).toBeInTheDocument();

  const hours = within(dialog).getByLabelText(/Keep it open for/);
  expect(hours).toHaveValue(24);
  fireEvent.change(hours, { target: { value: '48' } });
  fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Fix it today' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/period-close/approve', { id: 3, hours: 48, note: 'Fix it today' }));
  await waitFor(() => expect(screen.queryByText('Approve the re-open')).toBeNull()); // the success pop-up is also a dialog
});

test('approving for more than a week is not sent', async () => {
  renderAs('Super Admin');
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Approve request 3' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Keep it open for/), { target: { value: '200' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
  expect(await screen.findByText(/Open it for 1 to 168 hours/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('rejecting needs a reason', async () => {
  renderAs('Super Admin');
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Reject request 3' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
  expect(await screen.findByText(/Give a reason for rejecting the request/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.change(within(dialog).getByLabelText('Reason for rejecting'), { target: { value: 'Use next month' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/period-close/reject', { id: 3, note: 'Use next month' }));
});

test('closing a re-opened month again asks first', async () => {
  renderAs('Admin');
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name: 'Close request 2 again' }));
  const confirmDialog = await screen.findByRole('dialog');
  expect(within(confirmDialog).getByText(/May 2026 - Jun 2026 will be closed right away/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();

  fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Close again' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/period-close/close', { id: 2 }));
});

test('shows why the page could not load', async () => {
  api.get.mockRejectedValue({ response: { data: { error: 'You do not have permission to access this module' } } });
  renderAs('Admin');
  expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to access this module');
});

test('an empty list says every older month is closed', async () => {
  mockApi([]);
  renderAs('Admin');
  expect(await screen.findByText('No requests yet')).toBeInTheDocument();
});
