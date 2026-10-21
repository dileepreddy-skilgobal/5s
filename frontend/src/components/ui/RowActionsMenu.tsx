import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  /** Red text, for destructive actions such as delete. */
  danger?: boolean;
  /** Draws a separator above this item. */
  separated?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  /** Accessible name of the trigger, e.g. "More actions for Deepa Krishnan". */
  label: string;
}

const MENU_WIDTH = 200;

/**
 * "More actions" (⋯) button for a table row. The menu is portalled to the body with fixed positioning, so the
 * table's sideways-scroll container cannot clip it; it closes on outside click, Escape, scroll and resize.
 */
export const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ actions, label }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Opens below the trigger, right-aligned; flips above when there is no room underneath
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? actions.length * 40 + 12;
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 6) : below;
    const left = Math.min(Math.max(8, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPos({ top, left });
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onViewportChange = () => close();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [open, close]);

  // Arrow keys move between items; Tab closes the menu
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-sm btn-icon row-actions-trigger"
        aria-label={label}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            className="row-actions-menu animate-fade-in"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH }}
            onKeyDown={onMenuKeyDown}
          >
            {actions.map((a) => (
              <React.Fragment key={a.label}>
                {a.separated && <div className="row-actions-separator" role="separator" />}
                <button
                  type="button"
                  role="menuitem"
                  className={`row-actions-item${a.danger ? ' row-actions-item-danger' : ''}`}
                  onClick={() => {
                    close();
                    a.onSelect();
                  }}
                >
                  {a.icon && <span className="row-actions-icon" aria-hidden="true">{a.icon}</span>}
                  {a.label}
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};
