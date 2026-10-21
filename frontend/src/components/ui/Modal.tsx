import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

/** Open modals, innermost last: Escape and the focus trap act on the top one only. */
const openStack: string[] = [];
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, footer, maxWidth = '580px' }) => {
  const id = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    openStack.push(id);
    document.body.classList.add('modal-open');
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the dialog: its first field, else the dialog itself
    const focusTimer = window.setTimeout(() => {
      const card = cardRef.current;
      if (!card || card.contains(document.activeElement)) return;
      const first = card.querySelector<HTMLElement>(FOCUSABLE.map((s) => `.modal-body ${s}`).join(', '));
      (first ?? card).focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Keep keyboard focus inside the dialog
      if (e.key === 'Tab' && cardRef.current) {
        const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE.join(', '))).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      const at = openStack.lastIndexOf(id);
      if (at >= 0) openStack.splice(at, 1);
      if (openStack.length === 0) document.body.classList.remove('modal-open');
      previouslyFocused?.focus();
    };
  }, [isOpen, id]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={subtitle ? `${id}-subtitle` : undefined}
        tabIndex={-1}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header no-print">
          <div style={{ minWidth: 0 }}>
            <h3 id={`${id}-title`} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {title}
            </h3>
            {subtitle && (
              <p id={`${id}-subtitle`} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="no-print"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer no-print">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
