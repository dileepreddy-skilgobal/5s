import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiService } from '../services/api';
import { Connectivity } from '../services/connectivity';
import { useUser } from './UserContext';

/** Unread badge refresh interval while the app is in the foreground. */
const POLL_INTERVAL_MS = 60000;

interface NotificationsContextValue {
  unreadCount: number;
  /** Re-reads the unread count from the server (silently ignored when offline). */
  refreshUnread: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  inboxVisible: boolean;
  openInbox: () => void;
  closeInbox: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

/** In-app notification badge (polled while the app is foregrounded) and the inbox visibility. */
export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useUser();
  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxVisible, setInboxVisible] = useState(false);
  const inFlight = useRef(false);

  const refreshUnread = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (!(await Connectivity.isOnline())) return;
      const { unread } = await ApiService.getUnreadNotificationCount();
      setUnreadCount(typeof unread === 'number' ? unread : 0);
    } catch {
      // The badge is informational: keep the last known count
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      refreshUnread();
      if (!timer) timer = setInterval(refreshUnread, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [refreshUnread, currentUser.id]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      unreadCount,
      refreshUnread,
      setUnreadCount,
      inboxVisible,
      openInbox: () => setInboxVisible(true),
      closeInbox: () => setInboxVisible(false),
    }),
    [unreadCount, refreshUnread, inboxVisible],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = (): NotificationsContextValue => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
};
