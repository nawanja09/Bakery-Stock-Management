import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PopupProvider, usePopup } from './PopupContext';

const Trigger = () => {
  const { showPopup } = usePopup();

  return (
    <button type="button" onClick={() => showPopup('success', 'Successful')}>
      Show popup
    </button>
  );
};

test('shows a success popup in a body-level modal root and locks the page scroll while it is open', async () => {
  render(
    <PopupProvider>
      <Trigger />
    </PopupProvider>
  );

  fireEvent.click(screen.getByRole('button', { name: /show popup/i }));

  const modalRoot = document.getElementById('modal-root');
  expect(modalRoot).not.toBeNull();
  expect(modalRoot).toContainElement(document.querySelector('.notification-overlay'));
  expect(document.body.style.overflow).toBe('hidden');
  expect(await screen.findByText(/successful/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /continue/i }));

  await waitFor(() => {
    expect(document.body.style.overflow).toBe('');
  });
});
