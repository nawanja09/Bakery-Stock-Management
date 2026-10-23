import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CategoryAdjustmentPanel from './CategoryAdjustmentPanel';
import api from '../../api';

// Jest in this CRA setup cannot resolve react-router-dom's "react-router/dom"
// subpath (see AppRoutes.test.jsx), and this panel pulls it in transitively
// through EditPurchase / EditIssuance / EditWastage.
jest.mock('react-router-dom', () => {
  const { TextEncoder, TextDecoder } = require('util');
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual('react-router');
}, { virtual: true });
jest.mock('../../api');

// One Pending and one Completed card-sourced Bank Receive row, plus a plain
// (finance-sourced) one - all now "can_edit": 1 from the server.
const BANK_RECEIVE_ROWS = [
  { id: 1, source: 'card', date: '2026-10-01', reference_number: 'VCP-1', company_name: 'JH', bank_name: 'Bank A', account_number: '111', receive_type: 'Visa Card Payment', amount: 5000, remark: '', status: 'Pending', can_edit: 1, created_by_name: 'A' },
  { id: 2, source: 'card', date: '2026-09-01', reference_number: 'VCP-2', company_name: 'JH', bank_name: 'Bank A', account_number: '111', receive_type: 'Visa Card Payment', amount: 9000, remark: '', status: 'Completed', can_edit: 1, created_by_name: 'A' },
  { id: 3, source: 'finance', date: '2026-09-02', reference_number: 'BR-3', company_name: 'JH', bank_name: 'Bank A', account_number: '111', receive_type: 'Bank Deposit', amount: 1200, remark: '', status: 1, can_edit: 1, created_by_name: 'A' }
];

const setUser = (role) => localStorage.setItem('user', JSON.stringify({ id: 1, role }));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  api.get.mockImplementation((url) => {
    if (url === '/adjustments/records/Bank%20Receive') return Promise.resolve({ data: BANK_RECEIVE_ROWS });
    return Promise.resolve({ data: [] });
  });
});

describe('CategoryAdjustmentPanel - Bank Receive (Super Admin only edit)', () => {
  test('Accountant: Edit is disabled for every row, Pending or Completed, with a Super Admin tooltip', async () => {
    setUser('Accountant');
    render(<CategoryAdjustmentPanel category="Bank Receive" />);
    await screen.findByText('VCP-1');
    const buttons = screen.getAllByRole('button', { name: 'Edit' });
    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Only Super Admin can edit this record');
    });
  });

  test('Super Admin: Edit is enabled for every row, including a Completed card receipt', async () => {
    setUser('Super Admin');
    render(<CategoryAdjustmentPanel category="Bank Receive" />);
    await screen.findByText('VCP-1');
    const buttons = screen.getAllByRole('button', { name: 'Edit' });
    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => {
      expect(button).not.toBeDisabled();
      expect(button).not.toHaveAttribute('title');
    });
  });

  test('Admin (not Super Admin): Edit stays disabled too', async () => {
    setUser('Admin');
    render(<CategoryAdjustmentPanel category="Bank Receive" />);
    await screen.findByText('VCP-1');
    screen.getAllByRole('button', { name: 'Edit' }).forEach((button) => expect(button).toBeDisabled());
  });
});
