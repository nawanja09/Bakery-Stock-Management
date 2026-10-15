import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Modal, ConfirmDialog, PageHeader, StatusBadge, EmptyState, statusTone } from '.';

describe('Modal', () => {
  test('renders title, body and footer in a labelled dialog and locks page scroll', () => {
    const { unmount } = render(
      <Modal title="Edit supplier" subtitle="SUP-001" onClose={() => {}} footer={<button type="button">Save</button>}>
        <input aria-label="Name" />
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit supplier' });
    expect(dialog).toHaveClass('ui-modal-md');
    expect(screen.getByText('SUP-001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  test('closes on Escape and the close button, but not on an overlay click by default', () => {
    const onClose = jest.fn();
    render(<Modal title="Form" onClose={onClose}>body</Modal>);
    // The backdrop has no role, so it is reached through the dialog.
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement); // eslint-disable-line testing-library/no-node-access
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('closes on overlay click when closeOnOverlay is set', () => {
    const onClose = jest.fn();
    render(<Modal title="View" onClose={onClose} closeOnOverlay>body</Modal>);
    // The backdrop has no role, so it is reached through the dialog.
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement); // eslint-disable-line testing-library/no-node-access
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('renders nothing when closed', () => {
    render(<Modal open={false} title="Hidden">body</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ConfirmDialog', () => {
  test('calls confirm and cancel handlers', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmDialog title="Delete item?" message="This cannot be undone." confirmText="Delete" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('disables both buttons while busy', () => {
    render(<ConfirmDialog busy onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /please wait/i })).toBeDisabled();
  });
});

describe('PageHeader', () => {
  test('renders title, subtitle and actions', () => {
    render(<PageHeader title="Suppliers" subtitle="42 suppliers" actions={<button type="button">Add supplier</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Suppliers' })).toBeInTheDocument();
    expect(screen.getByText('42 suppliers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add supplier' })).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  test('maps statuses to one tone each, case-insensitively', () => {
    expect(statusTone('Approved')).toBe('success');
    expect(statusTone('PENDING')).toBe('warning');
    expect(statusTone('rejected')).toBe('danger');
    expect(statusTone('something else')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
  });

  test('renders the label with its tone class', () => {
    render(<StatusBadge status="Paid" />);
    expect(screen.getByText('Paid')).toHaveClass('ui-status-badge', 'tone-success');
  });
});

describe('EmptyState', () => {
  test('renders the message and action', () => {
    render(<EmptyState title="No suppliers yet" description="Add your first supplier." action={<button type="button">Add</button>} />);
    expect(screen.getByRole('status')).toHaveTextContent('No suppliers yet');
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('Modal keyboard handling', () => {
  test('Tab from the last control returns to the first, and Shift+Tab from the first goes to the last', () => {
    render(
      <Modal title="Form" onClose={() => {}} footer={<button type="button">Save</button>}>
        <input aria-label="Name" />
      </Modal>
    );
    const close = screen.getByRole('button', { name: 'Close' }); // header ×, first in the dialog
    const save = screen.getByRole('button', { name: 'Save' });

    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
  });

  test('Tab from outside the dialog is brought back inside', () => {
    render(
      <>
        <button type="button">Page button</button>
        <Modal title="Form" onClose={() => {}}><input aria-label="Name" /></Modal>
      </>
    );
    const outside = screen.getByRole('button', { name: 'Page button', hidden: true });
    outside.focus();
    fireEvent.keyDown(outside, { key: 'Tab' });
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement);
  });

  test('Escape closes only the dialog opened last (e.g. a confirmation over a form)', () => {
    const closeOuter = jest.fn();
    const closeInner = jest.fn();
    const ui = (inner) => (
      <Modal title="Outer" onClose={closeOuter}>
        {inner && <Modal title="Inner" onClose={closeInner}>inner</Modal>}
      </Modal>
    );
    const { rerender } = render(ui(false));
    rerender(ui(true));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  test('a new onClose on every parent render does not move focus back to the first field', () => {
    const { rerender } = render(<Modal title="Form" onClose={() => {}}><input aria-label="Name" /><input aria-label="Notes" /></Modal>);
    screen.getByLabelText('Notes').focus();
    rerender(<Modal title="Form" onClose={() => {}}><input aria-label="Name" /><input aria-label="Notes" /></Modal>);
    expect(screen.getByLabelText('Notes')).toHaveFocus();
  });
});
