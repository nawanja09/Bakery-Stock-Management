import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PopupProvider, usePopup } from './PopupContext';
import api from '../../api';

const MESSAGE = 'August 2026 is closed (only the last 2 months are open). An Admin must request a re-open, and the Super Admin must approve it, before this can be changed.';
const refuseWith = (status, data) => {
  api.defaults.adapter = (config) => Promise.reject({ config, response: { status, data } });
};

// A page that, like many in the app, answers any failure with a fixed text.
const Page = () => {
  const { showPopup } = usePopup();
  return (
    <button type="button" onClick={() => api.put('/issuances/1', {}).catch(() => showPopup('error', 'Failed to update issuance'))}>
      Save
    </button>
  );
};

const save = async () => {
  render(<PopupProvider><Page /></PopupProvider>);
  await act(async () => { screen.getByRole('button', { name: 'Save' }).click(); });
};

test('a change refused because the month is closed always shows the reason, replacing the page\'s fixed text', async () => {
  refuseWith(409, { error: MESSAGE, code: 'PERIOD_CLOSED', closed_before: '2026-09-01' });
  await save();
  expect(await screen.findByText('Cannot save: period closed')).toBeInTheDocument();
  expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText('Failed to update issuance')).toBeNull();
});

test('other failures keep the page\'s own message', async () => {
  refuseWith(409, { error: 'This order has already been processed' });
  await save();
  expect(await screen.findByText('Failed to update issuance')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Cannot save: period closed')).toBeNull());
});
