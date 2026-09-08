import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OrdersPage from './OrdersPage';
import api from '../../../api';
import { PopupProvider } from '../../context/PopupContext';

jest.mock('../../../api');
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}));

describe('OrdersPage - Low Stock Tab', () => {
  const mockLowStockItems = [
    {
      item_id: 101,
      item_code: 'RM-001',
      item_name: 'Wheat Flour',
      unit: 'kg',
      current_stock: 5,
      buffer_stock: 20,
      required_qty: 15,
      is_ordered: true,
      ordered: 'Yes',
      pending_order_no: 'ORD-2026-00001'
    },
    {
      item_id: 102,
      item_code: 'RM-002',
      item_name: 'White Sugar',
      unit: 'kg',
      current_stock: 2,
      buffer_stock: 10,
      required_qty: 8,
      is_ordered: false,
      ordered: 'No',
      pending_order_no: null
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/suppliers') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/orders/low-stock') {
        return Promise.resolve({ data: mockLowStockItems });
      }
      if (url === '/orders/pending') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('renders Ordered column and does NOT render Supplier column', async () => {
    render(
      <PopupProvider>
        <OrdersPage />
      </PopupProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Wheat Flour')).toBeInTheDocument();
    });

    // Check headers
    expect(screen.getByRole('columnheader', { name: 'Ordered' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /supplier/i })).not.toBeInTheDocument();

    // Check items
    expect(screen.getByText('White Sugar')).toBeInTheDocument();

    // Check Ordered badges: "Yes" for Wheat Flour, "No" for White Sugar
    const yesBadge = screen.getByText('Yes');
    expect(yesBadge).toBeInTheDocument();
    expect(yesBadge).toHaveClass('orders-badge', 'orders-badge-yes');

    const noBadge = screen.getByText('No');
    expect(noBadge).toBeInTheDocument();
    expect(noBadge).toHaveClass('orders-badge', 'orders-badge-no');
  });
});
