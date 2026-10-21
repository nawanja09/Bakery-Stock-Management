import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import './ui.css';

/**
 * Shared row-actions menu: a single vertical ⋮ trigger that opens a portaled
 * dropdown of actions, replacing a row of separate icon buttons.
 *
 * items: [{ label, icon, onClick, danger, disabled, divider }]
 * A `divider` entry renders a separator instead of a button; other fields
 * on that entry are ignored.
 */
const ActionMenu = ({ items, ariaLabel = 'More actions', disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const close = () => { setOpen(false); setPosition(null); };

    const handleOutsideClick = (event) => {
      if (dropdownRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      close();
    };
    const handleScrollOrResize = (event) => {
      if (dropdownRef.current?.contains(event.target)) return;
      close();
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const toggle = (event) => {
    event.stopPropagation();
    if (open) { setOpen(false); setPosition(null); return; }

    const rect = event.currentTarget.getBoundingClientRect();
    const visibleCount = items.filter((item) => item && !item.divider).length;
    const dropdownHeight = Math.min(42 * visibleCount + 16, 320);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setPosition({
      top: openUpward ? Math.max(10, rect.top - dropdownHeight - 6) : rect.bottom + 6,
      right: Math.max(12, window.innerWidth - rect.right),
      openUpward
    });
    setOpen(true);
  };

  const menuRoot = document.getElementById('modal-root') || document.body;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`ui-action-trigger ${open ? 'is-open' : ''}`}
        onClick={toggle}
        disabled={disabled}
        title={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <FontAwesomeIcon icon={faEllipsisV} />
      </button>
      {open && position && createPortal(
        <div
          ref={dropdownRef}
          className={`ui-action-dropdown ${position.openUpward ? 'open-upward' : 'open-downward'}`}
          style={{ position: 'fixed', top: `${position.top}px`, right: `${position.right}px` }}
          role="menu"
        >
          {items.filter(Boolean).map((item, index) => (
            item.divider ? (
              <div key={`divider-${index}`} className="ui-action-divider" role="separator" />
            ) : (
              <button
                key={item.label || index}
                type="button"
                role="menuitem"
                className={`ui-action-item ${item.danger ? 'is-danger' : ''}`}
                disabled={item.disabled}
                onClick={() => { setOpen(false); setPosition(null); item.onClick?.(); }}
              >
                {item.icon && <span className="ui-action-item-icon">{item.icon}</span>}
                {item.label}
              </button>
            )
          ))}
        </div>,
        menuRoot
      )}
    </>
  );
};

export default ActionMenu;
