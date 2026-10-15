import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Select from 'react-select';
import RouteModal from './RouteModal';

// Jest in this CRA setup cannot load react-router v7, so the router is stubbed
// (same approach as NavigationBar.test.jsx).
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/purchase/new' }),
}), { virtual: true });

const OPTIONS = [{ value: 1, label: 'Wheat Flour' }, { value: 2, label: 'White Sugar' }];

const renderWithSelect = () => render(
  <RouteModal title="Add New Purchase">
    <label htmlFor="item">Item</label>
    <Select inputId="item" options={OPTIONS} menuPortalTarget={document.body} />
  </RouteModal>
);

beforeEach(() => mockNavigate.mockClear());

test('Escape closes the popup', () => {
  renderWithSelect();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(mockNavigate).toHaveBeenCalledWith(-1);
});

test('Escape in an open dropdown closes only the dropdown; the next Escape closes the popup', () => {
  renderWithSelect();
  const input = screen.getByLabelText('Item');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getByText('White Sugar')).toBeInTheDocument();

  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByText('White Sugar')).not.toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  fireEvent.keyDown(input, { key: 'Escape' });
  expect(mockNavigate).toHaveBeenCalledWith(-1);
});
