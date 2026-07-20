import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getDatabaseSafe } from '../db';
import { storage } from './storage';
import { StorageKeys } from '../constants/storageKeys';
import { getCurrencySymbol } from '../constants/currencies';

export type NudgeFrequency = 'off' | 'weekly' | 'smart';

interface OutstandingDebt {
  friendId: string;
  friendName: string;
  amount: number;
  currency: string;
  oldestExpenseDate: string;
  expenseDescription: string;
}

// ─── Notification setup ─────────────────────────────────────────────────────

export async function setupNotifications(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('nudges', {
      name: 'Payment Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('general', {
      name: 'General',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  return true;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export async function getNudgeFrequency(): Promise<NudgeFrequency> {
  const val = await storage.get(StorageKeys.NUDGE_FREQUENCY);
  if (val === 'off' || val === 'weekly' || val === 'smart') return val;
  return 'smart'; // default
}

export async function setNudgeFrequency(freq: NudgeFrequency): Promise<void> {
  await storage.set(StorageKeys.NUDGE_FREQUENCY, freq);
  if (freq === 'off') {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}

export async function getMutedFriends(): Promise<string[]> {
  const val = await storage.get(StorageKeys.NUDGE_MUTED_FRIENDS);
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

export async function setMutedFriends(ids: string[]): Promise<void> {
  await storage.set(StorageKeys.NUDGE_MUTED_FRIENDS, JSON.stringify(ids));
}

export async function toggleMuteFriend(friendId: string): Promise<boolean> {
  const muted = await getMutedFriends();
  const idx = muted.indexOf(friendId);
  if (idx >= 0) {
    muted.splice(idx, 1);
    await setMutedFriends(muted);
    return false; // now unmuted
  } else {
    muted.push(friendId);
    await setMutedFriends(muted);
    return true; // now muted
  }
}

// ─── Debt query ──────────────────────────────────────────────────────────────

async function getOutstandingDebts(currentUserId: string): Promise<OutstandingDebt[]> {
  const db = await getDatabaseSafe();

  // Get what current user owes others (splits where user owes minus what they paid)
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
       u.id as friend_id,
       u.name as friend_name,
       SUM(es.amount) as total_owed,
       e.currency,
       MIN(e.date) as oldest_date,
       e.description
     FROM expense_splits es
     JOIN expenses e ON e.id = es.expense_id AND e.deleted_at IS NULL
     JOIN users u ON u.id = e.paid_by
     WHERE es.user_id = ? AND e.paid_by != ?
     GROUP BY u.id, e.currency
     HAVING total_owed > 0`,
    [currentUserId, currentUserId]
  );

  // Subtract confirmed settlements
  const debts: OutstandingDebt[] = [];

  for (const row of rows) {
    const friendId = row.friend_id as string;
    const totalOwed = row.total_owed as number;
    const currency = (row.currency as string) || 'USD';

    const settled = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT COALESCE(SUM(amount), 0) as total_settled
       FROM settlements
       WHERE from_user_id = ? AND to_user_id = ? AND status = 'confirmed'`,
      [currentUserId, friendId]
    );
    const totalSettled = (settled?.total_settled as number) || 0;
    const remaining = totalOwed - totalSettled;

    if (remaining > 0.01) {
      debts.push({
        friendId,
        friendName: row.friend_name as string,
        amount: Math.round(remaining * 100) / 100,
        currency,
        oldestExpenseDate: row.oldest_date as string,
        expenseDescription: row.description as string,
      });
    }
  }

  return debts;
}

// ─── Nudge message generation ────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86_400_000);
}

function buildNudgeMessage(debt: OutstandingDebt): { title: string; body: string } {
  const sym = getCurrencySymbol(debt.currency);
  const amount = `${sym}${debt.amount.toFixed(2)}`;
  const days = daysSince(debt.oldestExpenseDate);

  if (days < 7) {
    // Day 3 — gentle
    return {
      title: 'Friendly reminder',
      body: `Hey, you owe ${debt.friendName} ${amount} for ${debt.expenseDescription}`,
    };
  } else if (days < 14) {
    // Day 7 — contextual
    return {
      title: 'Time to settle up?',
      body: `${debt.friendName} covered ${debt.expenseDescription} last week. Want to settle the ${amount}?`,
    };
  } else {
    // Day 14+ — escalating
    return {
      title: 'Overdue payment',
      body: `You've owed ${debt.friendName} ${amount} for ${days} days. Time to settle up!`,
    };
  }
}

// ─── Schedule nudges ─────────────────────────────────────────────────────────

export async function scheduleNudges(currentUserId: string): Promise<number> {
  // Respect the global notifications toggle
  const globalEnabled = await storage.get(StorageKeys.NOTIFICATIONS_ENABLED);
  if (globalEnabled === 'false') return 0;

  const frequency = await getNudgeFrequency();
  if (frequency === 'off') return 0;

  // Don't schedule more than once per day
  const lastScheduled = await storage.get(StorageKeys.NUDGE_LAST_SCHEDULED);
  const today = new Date().toISOString().split('T')[0];
  if (lastScheduled === today) return 0;

  const mutedFriends = await getMutedFriends();
  const debts = await getOutstandingDebts(currentUserId);

  // Filter muted friends
  const activeDebts = debts.filter((d) => !mutedFriends.includes(d.friendId));

  // Cancel previously scheduled nudges
  await Notifications.cancelAllScheduledNotificationsAsync();

  let scheduled = 0;

  for (const debt of activeDebts) {
    const days = daysSince(debt.oldestExpenseDate);

    // Smart mode: only nudge at day 3, 7, 14+
    if (frequency === 'smart' && days < 3) continue;

    // Weekly mode: only nudge if 7+ days
    if (frequency === 'weekly' && days < 7) continue;

    const { title, body } = buildNudgeMessage(debt);

    // Schedule for 10 AM tomorrow
    const trigger = new Date();
    trigger.setDate(trigger.getDate() + 1);
    trigger.setHours(10, 0, 0, 0);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { friendId: debt.friendId, type: 'nudge' },
        ...(Platform.OS === 'android' ? { channelId: 'nudges' } : {}),
      },
      trigger: { date: trigger, type: Notifications.SchedulableTriggerInputTypes.DATE },
    });

    scheduled++;
  }

  await storage.set(StorageKeys.NUDGE_LAST_SCHEDULED, today);
  return scheduled;
}

// ─── Recurring expense reminders ─────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function intervalLabel(interval: string): string {
  switch (interval) {
    case 'weekly':      return 'weekly';
    case 'fortnightly': return 'fortnightly';
    case 'monthly':     return 'monthly';
    case 'yearly':      return 'yearly';
    default:            return 'recurring';
  }
}

export async function scheduleRecurringReminders(currentUserId: string): Promise<number> {
  const globalEnabled = await storage.get(StorageKeys.NOTIFICATIONS_ENABLED);
  if (globalEnabled === 'false') return 0;

  // Only run once per day — use a separate key so it doesn't collide with nudges
  const lastRun = await storage.get(StorageKeys.RECURRING_REMINDERS_LAST_SCHEDULED);
  const today = new Date().toISOString().split('T')[0];
  if (lastRun === today) return 0;

  const { recurringTemplatesDb } = await import('../db/queries/recurringTemplates');
  const templates = await recurringTemplatesDb.findActive(currentUserId);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('recurring', {
      name: 'Recurring Expense Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  let scheduled = 0;

  for (const template of templates) {
    const days = daysUntil(template.nextDue);

    // Only notify at exactly 5 days and 2 days before
    if (days !== 5 && days !== 2) continue;

    const sym = getCurrencySymbol(template.currency);
    const amount = `${sym}${template.totalAmount.toFixed(2)}`;
    const label = intervalLabel(template.interval ?? 'monthly');

    const title = days === 2
      ? `${template.description} renews in 2 days`
      : `Upcoming ${label} charge`;

    const body = days === 2
      ? `${amount} will be auto-added on ${template.nextDue}. Cancel now if you don't want it.`
      : `${template.description} (${amount}) is due in 5 days. Tap to manage.`;

    // Schedule for 9 AM today (user opens app in morning, reminder fires during day)
    const trigger = new Date();
    trigger.setHours(9, 0, 0, 0);
    // If 9 AM already passed, fire in 1 minute instead
    if (trigger.getTime() <= Date.now()) trigger.setTime(Date.now() + 60_000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'recurring', templateId: template.id, screen: '/recurring' },
        ...(Platform.OS === 'android' ? { channelId: 'recurring' } : {}),
      },
      trigger: { date: trigger, type: Notifications.SchedulableTriggerInputTypes.DATE },
    });

    scheduled++;
  }

  await storage.set(StorageKeys.RECURRING_REMINDERS_LAST_SCHEDULED, today);
  return scheduled;
}
