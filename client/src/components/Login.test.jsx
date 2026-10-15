import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Login from './Login';
import api from '../api';
import { PopupProvider } from './context/PopupContext';

// Jest in this CRA setup cannot load react-router v7, so the router is stubbed
// (same approach as NavigationBar.test.jsx).
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/login', search: '', state: null }),
}), { virtual: true });
jest.mock('../api');

test('a rejected login shows the server message and keeps the username', async () => {
  api.post.mockRejectedValue({ response: { status: 401, data: { error: 'Invalid credentials' } } });
  render(<PopupProvider><Login /></PopupProvider>);

  fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'storekeeper1' } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'wrong-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));

  expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledWith('/login', { username: 'storekeeper1', password: 'wrong-password' });
  expect(screen.getByLabelText(/Username/)).toHaveValue('storekeeper1');
  expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled();
  expect(mockNavigate).not.toHaveBeenCalled();
});
