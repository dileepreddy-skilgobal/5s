import React from 'react';
import { AlertOctagon, Bell, ClipboardCheck, Layers, Newspaper, Tag, Trophy } from 'lucide-react';

export type NotificationFamily = 'action' | 'audit' | 'recognition' | 'digest' | 'redTag' | 'other';

export interface NotificationVisual {
  family: NotificationFamily;
  label: string;
  icon: React.ReactNode;
  color: string;
  background: string;
}

const familyOf = (type: string): NotificationFamily => {
  if (type.startsWith('ACTION_')) return 'action';
  if (type.startsWith('AUDIT_')) return 'audit';
  if (type.startsWith('RED_TAG_')) return 'redTag';
  if (type === 'KUDOS_RECEIVED' || type === 'TROPHY_AWARDED') return 'recognition';
  if (type === 'DAILY_DIGEST' || type === 'MANAGER_DIGEST') return 'digest';
  return 'other';
};

const FAMILY_LABEL: Record<NotificationFamily, string> = {
  action: 'Corrective action',
  audit: 'Audit',
  recognition: 'Recognition',
  digest: 'Daily digest',
  redTag: 'Red tag',
  other: 'Notification',
};

/** Icon and colour for a notification type; anything overdue is shown in red regardless of family. */
export const notificationVisual = (type: string, size = 16): NotificationVisual => {
  const family = familyOf(type || '');
  const label = FAMILY_LABEL[family];
  if (type.endsWith('_OVERDUE') || type.endsWith('_CRITICAL')) {
    return { family, label, icon: <AlertOctagon size={size} />, color: 'var(--color-danger)', background: 'var(--color-danger-bg)' };
  }
  switch (family) {
    case 'action':
      return { family, label, icon: <Layers size={size} />, color: 'var(--color-primary)', background: 'var(--color-primary-light)' };
    case 'audit':
      return { family, label, icon: <ClipboardCheck size={size} />, color: 'var(--color-purple)', background: 'var(--color-purple-bg)' };
    case 'recognition':
      return { family, label, icon: <Trophy size={size} />, color: 'var(--color-warning)', background: 'var(--color-warning-bg)' };
    case 'digest':
      return { family, label, icon: <Newspaper size={size} />, color: 'var(--color-info)', background: 'var(--color-info-bg)' };
    case 'redTag':
      return { family, label, icon: <Tag size={size} />, color: 'var(--color-danger)', background: 'var(--color-danger-bg)' };
    default:
      return { family, label, icon: <Bell size={size} />, color: 'var(--text-secondary)', background: 'var(--bg-surface-subtle)' };
  }
};

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a short date. */
export const relativeTime = (iso: string | null | undefined, now: number = Date.now()): string => {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined });
};

/** In-app links are app paths ("/capa?id=..."); anything else is ignored rather than navigated to. */
export const isAppLink = (link: string | null | undefined): link is string =>
  typeof link === 'string' && link.startsWith('/') && !link.startsWith('//');

// The bell and the notifications page share read state through this window event
const CHANGED_EVENT = '5s:notifications-changed';

export const emitNotificationsChanged = () => {
  window.dispatchEvent(new Event(CHANGED_EVENT));
};

export const onNotificationsChanged = (handler: () => void): (() => void) => {
  window.addEventListener(CHANGED_EVENT, handler);
  return () => window.removeEventListener(CHANGED_EVENT, handler);
};
