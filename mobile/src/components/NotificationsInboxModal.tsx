import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, TYPE } from '../constants/theme';
import { ApiService, AppNotification } from '../services/api';
import { getErrorMessage } from '../services/http';
import { useNotifications } from '../context/NotificationsContext';
import { notificationTarget } from '../services/pushService';
import { Button, EmptyState } from './ui';
import { IconButton, InlineMessage, Sheet } from './SheetLayout';

const PAGE_SIZE = 30;

interface NotificationsInboxModalProps {
  /** Opens the screen that matches a notification (same mapping as push notification taps). */
  onOpenTarget: (target: 'audits' | 'locations') => void;
}

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  ACTION_ASSIGNED: 'construct-outline',
  AUDIT_ASSIGNED: 'clipboard-outline',
  AUDIT_OVERDUE: 'alarm-outline',
  AUDIT_SUBMITTED: 'checkmark-done-outline',
  AUDIT_DISPUTED: 'alert-circle-outline',
  RED_TAG_APPROVAL_NEEDED: 'pricetag-outline',
  TRIAL_ENDING: 'card-outline',
  KUDOS_RECEIVED: 'heart-outline',
  TROPHY_AWARDED: 'trophy-outline',
  DAILY_DIGEST: 'newspaper-outline',
};

const timeAgo = (iso: string): string => {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-GB');
};

/** In-app notification inbox: newest first, mark one / all as read. */
export const NotificationsInboxModal: React.FC<NotificationsInboxModalProps> = ({ onOpenTarget }) => {
  const { inboxVisible, closeInbox, setUnreadCount, unreadCount } = useNotifications();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await ApiService.getNotifications(nextPage, PAGE_SIZE);
        setItems((prev) => (nextPage === 1 ? res.items : [...prev, ...res.items.filter((i) => !prev.some((p) => p.id === i.id))]));
        setTotal(res.total);
        setPage(nextPage);
        setUnreadCount(res.unread);
      } catch (err) {
        setError(getErrorMessage(err, 'Notifications could not be loaded.'));
      } finally {
        setLoading(false);
      }
    },
    [setUnreadCount],
  );

  useEffect(() => {
    if (inboxVisible) load(1);
  }, [inboxVisible, load]);

  const markRead = async (n: AppNotification) => {
    if (n.readAt) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt } : i)));
    setUnreadCount(Math.max(0, unreadCount - 1));
    try {
      await ApiService.markNotificationRead(n.id);
    } catch {
      // Marked again on the next successful load
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await ApiService.markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setItems((prev) => prev.map((i) => (i.readAt ? i : { ...i, readAt })));
      setUnreadCount(0);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not mark notifications as read.'));
    } finally {
      setMarkingAll(false);
    }
  };

  const openItem = (n: AppNotification) => {
    markRead(n);
    const target = notificationTarget(n);
    // Items without a matching screen in the app are only marked as read
    if (target === 'inbox') return;
    closeInbox();
    onOpenTarget(target);
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const unread = !item.readAt;
    return (
      // The row and "mark as read" are sibling buttons: nesting one button in another breaks screen readers
      <View style={[styles.item, unread && styles.itemUnread]}>
        {unread ? <View style={styles.unreadBar} /> : null}
        <Pressable
          style={({ pressed }) => [styles.itemMain, pressed && { opacity: 0.85 }]}
          onPress={() => openItem(item)}
          accessibilityRole="button"
          accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}${item.body ? `. ${item.body}` : ''}. ${timeAgo(item.createdAt)}`}
        >
          <View style={[styles.iconWrap, unread && styles.iconWrapUnread]}>
            <Ionicons name={ICONS[item.type] ?? 'notifications-outline'} size={18} color={unread ? COLORS.primary : COLORS.textMedium} />
          </View>
          <View style={styles.itemBody}>
            <Text style={[styles.itemTitle, unread && styles.itemTitleUnread]} numberOfLines={2}>
              {item.title}
            </Text>
            {!!item.body && (
              <Text style={styles.itemText} numberOfLines={3}>
                {item.body}
              </Text>
            )}
            <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
          </View>
        </Pressable>
        {unread && (
          <IconButton
            icon="checkmark-circle-outline"
            tone="plain"
            color={COLORS.primary}
            onPress={() => markRead(item)}
            accessibilityLabel={`Mark "${item.title}" as read`}
          />
        )}
      </View>
    );
  };

  return (
    <Sheet
      visible={inboxVisible}
      onRequestClose={closeInbox}
      title="Notifications"
      subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
      closeLabel="Close notifications"
      scroll={false}
      minHeight="60%"
      headerAction={
        unreadCount > 0 ? (
          <Button label={markingAll ? 'Marking…' : 'Mark all read'} variant="ghost" size="sm" onPress={markAllRead} disabled={markingAll} />
        ) : null
      }
    >
      {error && (
        <View style={styles.errorWrap}>
          <InlineMessage tone="danger" icon="cloud-offline-outline" message={error} />
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading && page === 1 && items.length > 0} onRefresh={() => load(1)} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (!loading && items.length < total) load(page + 1);
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Loading notifications…</Text>
            </View>
          ) : error ? (
            <EmptyState icon="cloud-offline-outline" title="Notifications are not available" message="Check your connection and try again." actionLabel="Try again" onAction={() => load(1)} />
          ) : (
            <EmptyState icon="notifications-off-outline" title="No notifications yet" message="Audit assignments, overdue audits and red tags waiting for you will appear here." />
          )
        }
        ListFooterComponent={loading && page > 1 ? <ActivityIndicator color={COLORS.primary} style={{ margin: SPACING.md }} /> : null}
      />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  errorWrap: { paddingHorizontal: SPACING.screen, paddingTop: SPACING.md },
  list: { paddingHorizontal: SPACING.screen, paddingTop: SPACING.md, paddingBottom: SPACING.xxl, flexGrow: 1 },
  loading: { alignItems: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.md },
  loadingText: { ...TYPE.caption, color: COLORS.textMedium },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  itemUnread: { borderColor: COLORS.primaryBorder, backgroundColor: COLORS.primarySoft },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: COLORS.primary },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.cardSecondary, alignItems: 'center', justifyContent: 'center' },
  iconWrapUnread: { backgroundColor: COLORS.card },
  itemBody: { flex: 1, paddingRight: SPACING.sm },
  itemTitle: { ...TYPE.body, color: COLORS.textDark },
  itemTitleUnread: { fontWeight: '600' },
  itemText: { ...TYPE.caption, fontSize: 13, lineHeight: 18, color: COLORS.textMedium, marginTop: 2 },
  itemTime: { ...TYPE.caption, color: COLORS.textMuted, marginTop: SPACING.xs },
});
