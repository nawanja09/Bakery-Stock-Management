import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NavigationBar from './NavigationBar';

// Jest in this CRA setup cannot load react-router v7, so the router is stubbed
// (same approach as OrdersPage.test.jsx); `mockPath` drives useLocation.
let mockPath = '/dashboard';
jest.mock('react-router-dom', () => ({
  NavLink: ({ to, children, className }) => (
    <a href={to} className={typeof className === 'function' ? className({ isActive: false }) : className}>{children}</a>
  ),
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: mockPath }),
}), { virtual: true });
jest.mock('../hooks/useIntegrationAccess', () => () => ({ access: null }));
jest.mock('../api');

const sidebar = () => screen.getByRole('button', { name: 'Toggle navigation' }).parentElement; // eslint-disable-line testing-library/no-node-access

const renderAt = (width) => {
  window.innerWidth = width;
  mockPath = '/dashboard';
  return render(<NavigationBar />);
};

test('phones get a menu button outside the sidebar that opens it as a drawer with a backdrop', () => {
  renderAt(375);
  const open = screen.getByRole('button', { name: 'Open navigation' });
  expect(sidebar()).not.toHaveClass('mobile-open');

  fireEvent.click(open);
  expect(sidebar()).toHaveClass('mobile-open');
  expect(open).toHaveAttribute('aria-expanded', 'true');

  // On phones the in-sidebar toggle closes the drawer (no desktop "collapsed" state).
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  expect(sidebar()).not.toHaveClass('mobile-open');
  expect(sidebar()).not.toHaveClass('collapsed');
});

test('the phone drawer closes after moving to another page', () => {
  const { rerender } = renderAt(375);
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  expect(sidebar()).toHaveClass('mobile-open');
  mockPath = '/suppliers';
  rerender(<NavigationBar />);
  expect(sidebar()).not.toHaveClass('mobile-open');
});

test('tablets and desktops keep the collapse toggle', () => {
  renderAt(1024);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  expect(sidebar()).toHaveClass('collapsed');
  expect(sidebar()).not.toHaveClass('mobile-open');
});

test('tablets start with the icon-only sidebar, laptops and desktops with the full one', () => {
  const { unmount } = renderAt(800);
  expect(sidebar()).toHaveClass('collapsed');
  unmount();
  renderAt(1280);
  expect(sidebar()).not.toHaveClass('collapsed');
});
