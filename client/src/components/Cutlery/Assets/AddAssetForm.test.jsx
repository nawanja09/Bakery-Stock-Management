import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddAssetForm from './AddAssetForm';

test('opens in the shared dialog with a reachable Add Asset button', () => {
  render(<AddAssetForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

  const dialog = screen.getByRole('dialog', { name: 'Add New Asset' });
  expect(dialog).toHaveClass('ui-modal', 'add-asset-modal');
  expect(dialog.closest('.ui-modal-overlay')).toBeInTheDocument(); // eslint-disable-line testing-library/no-node-access
  expect(screen.getByLabelText('Asset Name *')).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Add Asset' })).toBeDisabled();
});

test('submits once and ignores Escape while the asset is being added', async () => {
  let finish;
  const onSubmit = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const onCancel = jest.fn();
  render(<AddAssetForm onSubmit={onSubmit} onCancel={onCancel} />);

  fireEvent.change(screen.getByLabelText('Asset Name *'), { target: { value: 'Tea spoon' } });
  const add = screen.getByRole('button', { name: 'Add Asset' });
  fireEvent.click(add);
  fireEvent.submit(document.getElementById('add-asset-form'));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith({ asset_name: 'Tea spoon', description: '', image: null });
  expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();

  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onCancel).not.toHaveBeenCalled();

  finish();
  expect(await screen.findByRole('button', { name: 'Add Asset' })).toBeEnabled();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onCancel).toHaveBeenCalledTimes(1);
});
