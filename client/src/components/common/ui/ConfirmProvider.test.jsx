import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConfirmProvider, useConfirm } from '.';

const Asker = ({ question }) => {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState('none');
  return (
    <>
      <button type="button" onClick={async () => setAnswer(String(await confirm(question)))}>Ask</button>
      <output>{answer}</output>
    </>
  );
};

test('resolves true on confirm and labels a delete question as a danger action', async () => {
  render(<ConfirmProvider><Asker question='Delete supplier "ABC"?' /></ConfirmProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete this?' });
  expect(dialog).toHaveClass('ui-confirm-danger');
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('true')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('resolves false on cancel', async () => {
  render(<ConfirmProvider><Asker question="Deactivate this rate?" /></ConfirmProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByText('false')).toBeInTheDocument();
});

test('falls back to window.confirm when no provider is mounted', async () => {
  const original = window.confirm;
  window.confirm = jest.fn(() => true);
  render(<Asker question="Void this transaction?" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText('true')).toBeInTheDocument();
  expect(window.confirm).toHaveBeenCalledWith('Void this transaction?');
  window.confirm = original;
});
