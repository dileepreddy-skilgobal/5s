import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for deleting or other actions that can't be undone. */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before an important or irreversible action. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={busy ? () => undefined : onCancel}
    title={title}
    maxWidth="460px"
    footer={
      <>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{message}</div>
  </Modal>
);
