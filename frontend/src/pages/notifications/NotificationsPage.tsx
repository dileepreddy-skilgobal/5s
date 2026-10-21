import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, ExternalLink, Mail, RefreshCw, Smartphone } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { AppNotification, NotificationPreferences } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState, LoadingState, EmptyState } from '../../components/ui/StateViews';
import { Toggle } from '../settings/SettingsFields';
import {
  emitNotificationsChanged,
  isAppLink,
  notificationVisual,
  onNotificationsChanged,
} from '../../components/notifications/notificationMeta';
import { useI18n } from '../../i18n';

const PAGE_SIZE = 20;

type Filter = 'all' | 'unread';

export const NotificationsPage: React.FC = () => {
  const { addToast } = useApp();
  const navigate = useNavigate();
  const { t, formatRelative, formatDateTime, formatNumber } = useI18n();

  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [savingPref, setSavingPref] = useState<keyof NotificationPreferences | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getNotifications({ unreadOnly: filter === 'unread', page, pageSize: PAGE_SIZE });
      const list = Array.isArray(res?.items) ? res.items : [];
      const count = Number(res?.total) || 0;
      // The last page can empty out after marking items read in the Unread view
      if (list.length === 0 && count > 0 && page > 1) {
        setPage(Math.max(1, Math.ceil(count / PAGE_SIZE)));
        return;
      }
      setItems(list);
      setTotal(count);
      setUnread(Number(res?.unread) || 0);
    } catch (err) {
      setError(getApiErrorMessage(err, t('notifications.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [filter, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Read state changed from the header bell (events this page raises itself are ignored; dispatch is synchronous)
  const selfEmit = useRef(false);
  const announceChange = () => {
    selfEmit.current = true;
    try {
      emitNotificationsChanged();
    } finally {
      selfEmit.current = false;
    }
  };
  useEffect(
    () =>
      onNotificationsChanged(() => {
        if (!selfEmit.current) load();
      }),
    [load],
  );

  useEffect(() => {
    api
      .getNotificationPreferences()
      .then((p) => setPrefs(p ? { emailNotifications: p.emailNotifications !== false, pushNotifications: p.pushNotifications !== false } : null))
      .catch((err) => setPrefsError(getApiErrorMessage(err, t('notifications.prefs.loadFailed'))));
  }, [t]);

  const changeFilter = (next: string) => {
    setFilter(next === 'unread' ? 'unread' : 'all');
    setPage(1);
  };

  const markRead = async (n: AppNotification) => {
    if (n.readAt) return;
    try {
      await api.markNotificationRead(n.id);
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: now } : i)));
      setUnread((u) => Math.max(0, u - 1));
      announceChange();
    } catch (err) {
      addToast({ type: 'error', title: t('notifications.title'), message: getApiErrorMessage(err, t('notifications.markReadFailed')) });
    }
  };

  const openNotification = async (n: AppNotification) => {
    await markRead(n);
    if (isAppLink(n.link)) navigate(n.link);
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const res = await api.markAllNotificationsRead();
      announceChange();
      addToast({
        type: 'success',
        title: t('notifications.title'),
        message: res?.marked ? t('notifications.markedCount', { count: Number(res.marked) }) : t('notifications.alreadyRead'),
      });
      if (page === 1) await load();
      else setPage(1);
    } catch (err) {
      addToast({ type: 'error', title: t('notifications.title'), message: getApiErrorMessage(err, t('notifications.markAllFailed')) });
    } finally {
      setMarkingAll(false);
    }
  };

  const updatePref = async (key: keyof NotificationPreferences, value: boolean) => {
    if (!prefs || savingPref) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSavingPref(key);
    try {
      const saved = await api.updateNotificationPreferences({ [key]: value });
      if (saved) setPrefs({ emailNotifications: saved.emailNotifications !== false, pushNotifications: saved.pushNotifications !== false });
      addToast({
        type: 'success',
        title: t('notifications.prefs.saved'),
        message:
          key === 'emailNotifications'
            ? t(value ? 'notifications.prefs.emailOn' : 'notifications.prefs.emailOff')
            : t(value ? 'notifications.prefs.pushOn' : 'notifications.prefs.pushOff'),
      });
    } catch (err) {
      setPrefs(previous);
      addToast({ type: 'error', title: t('notifications.prefs.title'), message: getApiErrorMessage(err, t('notifications.prefs.saveFailed')) });
    } finally {
      setSavingPref(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page - 1) * PAGE_SIZE + items.length);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title={t('notifications.title')}
        meta={
          unread > 0 ? (
            <Badge variant="info" icon={<Bell size={12} aria-hidden="true" />}>
              {formatNumber(unread)} {t('notifications.unread').toLowerCase()}
            </Badge>
          ) : undefined
        }
        description={t('notifications.pageSubtitle')}
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => load()} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button variant="primary" icon={<CheckCheck size={16} />} onClick={markAll} loading={markingAll} disabled={unread === 0}>
              {t('notifications.markAllRead')}
            </Button>
          </>
        }
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 480px', minWidth: 0 }}>
          <Card noPadding>
            <div style={{ padding: '0 12px' }}>
              <Tabs
                ariaLabel={t('notifications.inbox')}
                tabs={[
                  { id: 'all', label: t('notifications.all') },
                  { id: 'unread', label: t('notifications.unread'), badge: formatNumber(unread) },
                ]}
                activeTab={filter}
                onChange={changeFilter}
              />
            </div>

            {error && !loading ? (
              <ErrorState message={`${t('notifications.loadFailedTitle')}: ${error}`} onRetry={() => load()} />
            ) : loading && items.length === 0 ? (
              <LoadingState label={t('notifications.loadingList')} />
            ) : items.length === 0 ? (
              <EmptyState
                icon={<Bell size={28} />}
                title={filter === 'unread' ? t('notifications.noUnread') : t('notifications.noneYet')}
                description={filter === 'unread' ? t('notifications.allCaughtUp') : t('notifications.noneYetHint')}
              />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, opacity: loading ? 0.6 : 1, transition: 'opacity var(--transition-fast)' }}>
                {items.map((n) => {
                  const visual = notificationVisual(n.type, 18);
                  const isUnread = !n.readAt;
                  const familyLabel = t(`notifications.family.${visual.family}`);
                  return (
                    <li
                      key={n.id}
                      style={{
                        display: 'flex',
                        gap: '12px',
                        padding: '16px 20px',
                        borderTop: '1px solid var(--border-subtle)',
                        background: isUnread ? 'var(--bg-pale)' : 'transparent',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: '36px',
                          height: '36px',
                          flexShrink: 0,
                          borderRadius: 'var(--radius-full)',
                          background: visual.background,
                          color: visual.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {visual.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
                        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {isUnread && (
                              <span
                                aria-hidden="true"
                                style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-full)', background: 'var(--color-primary)', flexShrink: 0 }}
                              />
                            )}
                            <span style={{ fontSize: '14px', fontWeight: isUnread ? 600 : 500, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                              {isUnread && <span className="sr-only">{t('notifications.unread')}: </span>}
                              {n.title}
                            </span>
                            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>· {familyLabel}</span>
                          </div>
                          {n.body && (
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}>{n.body}</div>
                          )}
                          <div style={{ fontSize: '12.5px', color: 'var(--text-tertiary)', marginTop: '6px' }} title={formatDateTime(n.createdAt) || undefined}>
                            {formatRelative(n.createdAt)}
                            {n.readAt ? ` · ${t('notifications.read')}` : ''}
                          </div>
                        </div>
                        {(isUnread || isAppLink(n.link)) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {isUnread && (
                              <Button variant="ghost" size="sm" icon={<Check size={16} />} onClick={() => markRead(n)} title={t('notifications.markAsRead')}>
                                {t('notifications.markRead')}
                              </Button>
                            )}
                            {isAppLink(n.link) && (
                              <Button variant="secondary" size="sm" icon={<ExternalLink size={16} />} onClick={() => openNotification(n)}>
                                {t('common.open')}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {total > 0 && !error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t('common.showingRange', { start: rangeStart, end: rangeEnd, total })}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ChevronLeft size={16} />}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={loading || page <= 1}
                  >
                    {t('common.previous')}
                  </Button>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t('common.pageOf', { page, pages: totalPages })}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={loading || page >= totalPages}>
                    {t('common.next')} <ChevronRight size={16} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <Card title={t('notifications.prefs.title')} subtitle={t('notifications.prefs.subtitle')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{t('notifications.prefs.intro')}</p>
              {prefsError ? (
                <div role="alert" className="form-error" style={{ margin: 0 }}>
                  {prefsError}
                </div>
              ) : !prefs ? (
                <LoadingState label={t('notifications.prefs.loading')} compact />
              ) : (
                <>
                  <Toggle
                    id="pref-email"
                    checked={prefs.emailNotifications}
                    onChange={(v) => updatePref('emailNotifications', v)}
                    label={t('notifications.prefs.email')}
                    description={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Mail size={14} aria-hidden="true" /> {savingPref === 'emailNotifications' ? t('common.saving') : t('notifications.prefs.emailHint')}
                      </span>
                    }
                  />
                  <Toggle
                    id="pref-push"
                    checked={prefs.pushNotifications}
                    onChange={(v) => updatePref('pushNotifications', v)}
                    label={t('notifications.prefs.push')}
                    description={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Smartphone size={14} aria-hidden="true" /> {savingPref === 'pushNotifications' ? t('common.saving') : t('notifications.prefs.pushHint')}
                      </span>
                    }
                  />
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
