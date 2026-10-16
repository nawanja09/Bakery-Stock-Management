import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuditTrail from './AuditTrail';
import api from '../../api';

jest.mock('../../api');

const SESSION = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ROWS = [
  {
    id: 7, occurred_at: '2026-10-16 09:15:02', user_id: 8, username: 'stores', user_name: 'Store Keeper',
    user_role: 'Store Keeper', session_id: SESSION, event_type: 'CHANGE', action: 'CREATE', module: 'Issue to Department',
    entity_id: null, record_type: 'Issue note', record_label: 'Issue note #55', method: 'POST', path: '/api/issuances',
    status_code: 201, outcome: 'SUCCESS', message: 'Issuance created successfully!', ip_address: '192.168.1.20', duration_ms: 41
  },
  {
    id: 6, occurred_at: '2026-10-16 09:14:40', user_id: null, username: 'stores2', user_name: null,
    user_role: null, session_id: null, event_type: 'AUTH', action: 'LOGIN_FAILED', module: 'Sign-in',
    entity_id: null, record_type: null, record_label: null, method: 'POST', path: '/api/login', status_code: 401,
    outcome: 'FAILED', message: 'Unknown username', ip_address: '192.168.1.20', duration_ms: 90
  },
  {
    id: 5, occurred_at: '2026-10-15 16:00:00', user_id: 8, username: 'stores', user_name: 'Store Keeper',
    user_role: 'Store Keeper', session_id: null, event_type: 'CHANGE', action: 'UPDATE', module: 'Wastage',
    entity_id: '12', record_type: null, record_label: null, method: 'PUT', path: '/api/wastages/12',
    status_code: 200, outcome: 'SUCCESS', message: null, ip_address: '192.168.1.20', duration_ms: 30
  }
];

const PLAIN_BASE = {
  when: '16 Oct 2026, 09:15', module: 'Issue to Department', result: 'Successful', resultMessage: 'Issuance created successfully!',
  device: 'Chrome on Windows', ip: '192.168.1.20', changes: [], deleted: false, deletedValues: [], lineItems: [],
  enteredValues: [], sync: null, createdAt: null, approver: null, reason: null
};

const DETAILS = {
  7: {
    ...ROWS[0], query_string: null, user_agent: 'Mozilla/5.0 Test', forwarded_for: null,
    request_body: { department_id: 3, received_by: 'Chef', items: [{ item_id: 4, quantity: 2 }] },
    response_body: { message: 'Issuance created successfully!', issuance_id: 55 },
    plain: {
      ...PLAIN_BASE,
      headline: 'Store Keeper created Issue note #55.',
      who: { name: 'Store Keeper', role: 'Store Keeper' },
      action: 'created', record: 'Issue note #55', createdBy: 'Store Keeper', createdAt: '16 Oct 2026, 09:15',
      approver: 'Sampath', reason: 'Morning',
      enteredValues: [{ field: 'department_id', label: 'Department', value: 'Bakery' }, { field: 'received_by', label: 'Received by', value: 'Chef' }]
    }
  },
  9: {
    ...ROWS[0], id: 9, action: 'UPDATE', module: 'Purchasing', record_label: 'Purchase invoice INV-1024',
    request_body: { total_with_vat: 1200 }, response_body: { message: 'Purchase updated successfully!' },
    plain: {
      ...PLAIN_BASE,
      headline: 'Store Keeper edited Purchase invoice INV-1024.',
      who: { name: 'Store Keeper', role: 'Store Keeper' }, action: 'edited', record: 'Purchase invoice INV-1024',
      module: 'Purchasing', createdBy: 'Accountant 1', createdAt: '8 Oct 2026', reason: 'Supplier corrected the price',
      changes: [{ field: 'total_with_vat', label: 'Total (with VAT)', before: '1,000.00', after: '1,200.00' }],
      lineItems: [{ kind: 'changed', text: 'Invoice item changed: Flour - quantity 2 -> 3' }]
    }
  },
  10: {
    ...ROWS[0], id: 10, event_type: 'SYNC', action: 'SYNC', module: 'Collection - RAVON POS', outcome: 'FAILED',
    record_label: 'RAVON POS collections 2026-10-10 to 2026-10-16', request_body: {}, response_body: {},
    plain: {
      ...PLAIN_BASE,
      headline: 'Accountant imported collections from RAVON POS.', who: { name: 'Accountant', role: 'Accountant' },
      module: 'Collection - RAVON POS', result: 'Failed', resultMessage: '12 fetched, 8 new, 2 updated, 1 rejected, 0 unmapped',
      sync: { fetched: 12, created: 8, updated: 2, rejected: 1, unmapped: 0, error: null,
        rejectedRecords: [{ source: 'Shift', record: 4, reason: 'The total is missing' }] }
    }
  }
};

const mockApi = (rows = ROWS) => {
  api.get.mockImplementation((url) => {
    if (url === '/audit-logs/filters') {
      return Promise.resolve({ data: { users: [{ id: 8, name: 'Store Keeper', role: 'Store Keeper' }], modules: ['Issue to Department', 'Sign-in'] } });
    }
    if (url === '/audit-logs/summary') {
      return Promise.resolve({ data: { total: rows.length, logins: 0, failedLogins: 1, changes: 1, failedChanges: 0, denied: 0, failedSyncs: 2, users: 1 } });
    }
    if (url === '/audit-logs') return Promise.resolve({ data: { rows, total: rows.length, page: 1, limit: 50 } });
    const id = Number(url.split('/').pop());
    if (DETAILS[id]) return Promise.resolve({ data: DETAILS[id] });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApi();
});

test('lists audit events with who, what, the record by name, result and where', async () => {
  render(<AuditTrail />);

  const table = await screen.findByRole('table');
  await waitFor(() => expect(within(table).getByText('Created')).toBeInTheDocument());
  expect(within(table).getByText('Issue note #55')).toBeInTheDocument();
  expect(within(table).getByText('Record no. 12')).toBeInTheDocument();
  expect(within(table).getByText('Sign-in failed')).toBeInTheDocument();
  expect(within(table).getByText('Not signed in')).toBeInTheDocument();
  expect(within(table).getByText('Unknown username')).toBeInTheDocument();

  expect(screen.getByText('Failed sign-ins').parentElement).toHaveClass('is-alert'); // eslint-disable-line testing-library/no-node-access
  expect(screen.getByText('Sync problems')).toBeInTheDocument();
  expect(screen.getByText('1-3 of 3')).toBeInTheDocument();
});

test('the detail view explains a new record in plain words', async () => {
  render(<AuditTrail />);
  fireEvent.click(await screen.findByRole('button', { name: 'View details of event 7' }));
  const dialog = await screen.findByRole('dialog');

  expect(await within(dialog).findByText('Store Keeper created Issue note #55.')).toBeInTheDocument();
  const facts = (label) => within(dialog).getByText(label).nextSibling; // eslint-disable-line testing-library/no-node-access
  expect(facts('Time')).toHaveTextContent('16 Oct 2026, 09:15');
  expect(facts('Done by')).toHaveTextContent('Store Keeper (Store Keeper)');
  expect(facts('Record')).toHaveTextContent('Issue note #55');
  expect(facts('Who created it')).toHaveTextContent('Store Keeper, 16 Oct 2026, 09:15');
  expect(facts('Approver')).toHaveTextContent('Sampath');
  expect(facts('Reason / note')).toHaveTextContent('Morning');
  expect(facts('Computer used')).toHaveTextContent('Chrome on Windows - IP 192.168.1.20');
  expect(within(dialog).getByText('What was entered')).toBeInTheDocument();
  expect(facts('Department')).toHaveTextContent('Bakery');

  // Raw data only under the technical details.
  expect(within(dialog).getByText('Technical details (for IT support)')).toBeInTheDocument();
  expect(within(dialog).getByText(/"received_by": "Chef"/)).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: /Show everything this user did in this sign-in/ }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit-logs', { params: { sessionId: SESSION, page: 1, limit: 50 } }));
  expect(screen.getByText(SESSION)).toBeInTheDocument();
});

test('an edit shows who created it, who edited it, and each previous and new value', async () => {
  mockApi([{ ...ROWS[0], id: 9, action: 'UPDATE', record_label: 'Purchase invoice INV-1024' }]);
  render(<AuditTrail />);
  fireEvent.click(await screen.findByRole('button', { name: 'View details of event 9' }));
  const dialog = await screen.findByRole('dialog');

  expect(await within(dialog).findByText('Store Keeper edited Purchase invoice INV-1024.')).toBeInTheDocument();
  expect(within(dialog).getByText('Who edited it')).toBeInTheDocument();
  expect(within(dialog).getByText('Accountant 1, 8 Oct 2026')).toBeInTheDocument();
  expect(within(dialog).getByText('Supplier corrected the price')).toBeInTheDocument();
  expect(within(dialog).getByText('Not recorded')).toBeInTheDocument(); // no approver

  const changes = within(dialog).getByRole('table', { name: 'Changed values' });
  expect(within(changes).getByRole('columnheader', { name: 'Previous value' })).toBeInTheDocument();
  expect(within(changes).getByRole('columnheader', { name: 'New value' })).toBeInTheDocument();
  const row = within(changes).getByRole('row', { name: /Total \(with VAT\)/ });
  expect(row).toHaveTextContent('1,000.00');
  expect(row).toHaveTextContent('1,200.00');
  expect(within(dialog).getByText('Invoice item changed: Flour - quantity 2 -> 3')).toBeInTheDocument();
});

test('a POS import shows its counts and the rejected records with the reason', async () => {
  mockApi([{ ...ROWS[0], id: 10, event_type: 'SYNC', action: 'SYNC', outcome: 'FAILED' }]);
  render(<AuditTrail />);
  fireEvent.click(await screen.findByRole('button', { name: 'View details of event 10' }));
  const dialog = await screen.findByRole('dialog');

  expect(await within(dialog).findByText('Import result')).toBeInTheDocument();
  const items = within(dialog).getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual(expect.arrayContaining(['12 records read', '8 new', '2 updated', '1 rejected']));
  expect(within(dialog).getByText('Shift record 4: The total is missing')).toBeInTheDocument();
  expect(within(dialog).getByText(/Why it did not go through/)).toBeInTheDocument();
});

test('applies filters to the list and the summary', async () => {
  render(<AuditTrail />);
  await screen.findByRole('table');

  expect(screen.getByRole('option', { name: 'POS / Restaurant sync' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Event'), { target: { value: 'DENIED' } });
  fireEvent.change(screen.getByLabelText('Result'), { target: { value: 'FAILED' } });
  fireEvent.click(screen.getByRole('button', { name: /Apply/ }));

  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit-logs/summary', {
    params: expect.objectContaining({ eventType: 'DENIED', outcome: 'FAILED' })
  }));
  expect(api.get).toHaveBeenCalledWith('/audit-logs', {
    params: expect.objectContaining({ eventType: 'DENIED', outcome: 'FAILED', page: 1, limit: 50 })
  });
});
