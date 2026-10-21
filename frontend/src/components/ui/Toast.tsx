import React from 'react';
import { useApp } from '../../context/AppContext';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={18} color="var(--color-success)" />;
      case 'error':
        return <AlertCircle size={18} color="var(--color-danger)" />;
      case 'warning':
        return <AlertTriangle size={18} color="var(--color-warning)" />;
      default:
        return <Info size={18} color="var(--color-info)" />;
    }
  };

  return (
    // Always mounted so screen readers announce toasts as they arrive
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: 'min(380px, calc(100vw - 48px))',
        pointerEvents: toasts.length ? 'auto' : 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-fade-in"
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ marginTop: '2px' }}>{getIcon(t.type)}</div>
          <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {t.title && <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</div>}
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{t.message}</div>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => removeToast(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: '2px',
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
