import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { AppNotification } from '../../types';
import {
  emitNotificationsChanged,
  isAppLink,
  notificationVisual,
  onNotificationsChanged,
} from '../notifications/notificationMeta';
import { useI18n } from '../../i18n';

const POLL_MS = 60_000;
const PANEL_SIZE = 15;

/** Header bell: unread badge (polled every minute and on window focus) and a dropdown of the latest notifications. */
export const NotificationBell: React.FC = () => {
  const { isAuthenticated, addToast } = useApp();
  const navigate = useNavigate();
  const { t, formatRelative, formatNumber } = useI18n();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await api.getUnreadNotificationCount());
    } catch {
      // Badge is best effort; the next poll retries
    }
  }, []);

  const loadPanel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.getNotifications({ page: 1, pageSize: PANEL_SIZE });
      setItems(Array.isArray(page?.items) ? page.items : []);
      setUnread(Number(page?.unread) || 0);
    } catch (err) {
      setError(getApiErrorMessage(err, t('notifications.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Poll only while signed in; focus and changes made elsewhere (e.g. the notifications page) refresh immediately
  useEffect(() => {
    if (!isAuthenticated) {
      setUnread(0);
      setItems([]);
      setOpen(false);
      return;
    }
    refreshCount();
    const timer = window.setInterval(refreshCount, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    const offChanged = onNotificationsChanged(refreshCount);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      offChanged();
    };
  }, [isAuthenticated, refreshCount]);

  useEffect(() => {
    if (open) loadPanel();
  }, [open, loadPanel]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleItemClick = async (n: AppNotification) => {
    setOpen(false);
    if (!n.readAt) {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: now } : i)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api.markNotificationRead(n.id);
        emitNotificationsChanged();
      } catch {
        refreshCount();
      }
    }
    if (isAppLink(n.link)) navigate(n.link);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await api.markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => (i.readAt ? i : { ...i, readAt: now })));
      setUnread(0);
      emitNotificationsChanged();
    } catch (err) {
      addToast({ type: 'error', title: t('notifications.title'), message: getApiErrorMessage(err, t('notifications.markAllFailed')) });
    } finally {
      setMarkingAll(false);
    }
  };

  if (!isAuthenticated) return null;

  const badgeText = unread > 99 ? `${formatNumber(99)}+` : formatNumber(unread);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t('notifications.bellLabel')}
        aria-label={unread > 0 ? t('notifications.bellLabelUnread', { count: unread }) : t('notifications.bellLabel')}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          position: 'relative',
          background: open ? 'var(--bg-surface-hover)' : 'var(--bg-surface-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '8px',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-6px',
              right: '-6px',
              minWidth: '18px',
              height: '18px',
              padding: '0 5px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-danger)',
              color: '#FFFFFF',
              fontSize: '10px',
              fontWeight: 700,
              lineHeight: '18px',
              textAlign: 'center',
              border: '2px solid var(--bg-surface)',
              boxSizing: 'content-box',
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div
          className="animate-fade-in"
          role="dialog"
          aria-label={t('notifications.bellLabel')}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('notifications.title')}
              {unread > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('notifications.unreadCount', { count: unread })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll || unread === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                color: unread === 0 ? 'var(--text-tertiary)' : 'var(--color-primary)',
                cursor: markingAll || unread === 0 ? 'default' : 'pointer',
                padding: 0,
              }}
            >
              <CheckCheck size={14} /> {t('notifications.markAllRead')}
            </button>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
            {loading && items.length === 0 ? (
              <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <RefreshCw size={14} className="animate-spin" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                {t('common.loading')}
              </div>
            ) : error ? (
              <div role="alert" style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--color-danger)' }}>
                <div>{error}</div>
                <button
                  type="button"
                  onClick={loadPanel}
                  style={{ marginTop: '8px', background: 'transparent', border: 'none', color: 'var(--color-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <Bell size={22} style={{ color: 'var(--text-tertiary)', marginBottom: '6px' }} />
                <div>{t('notifications.allCaughtUp')}</div>
              </div>
            ) : (
              items.map((n) => {
                const visual = notificationVisual(n.type);
                const isUnread = !n.readAt;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleItemClick(n)}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      width: '100%',
                      textAlign: 'left',
                      padding: '11px 14px',
                      border: 'none',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isUnread ? 'var(--color-primary-light)' : 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isUnread ? 'var(--color-primary-light)' : 'transparent';
                    }}
                  >
                    <span
                      style={{
                        width: '30px',
                        height: '30px',
                        flexShrink: 0,
                        borderRadius: 'var(--radius-full)',
                        background: visual.background,
                        color: visual.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={t(`notifications.family.${visual.family}`)}
                    >
                      {visual.icon}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: '13px',
                            fontWeight: isUnread ? 700 : 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.title}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{formatRelative(n.createdAt)}</span>
                      </span>
                      {n.body && (
                        <span
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            marginTop: '2px',
                            lineHeight: 1.4,
                          }}
                        >
                          {n.body}
                        </span>
                      )}
                    </span>
                    {isUnread && (
                      <span
                        aria-label={t('notifications.unread')}
                        style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0, marginTop: '6px' }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            style={{
              padding: '10px 14px',
              border: 'none',
              background: 'var(--bg-surface-subtle)',
              color: 'var(--color-primary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('notifications.viewAll')}
          </button>
        </div>
      )}
    </div>
  );
};
