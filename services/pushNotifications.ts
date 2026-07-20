import { supabase } from './supabase';
import { getCurrencySymbol } from '../constants/currencies';

// ─── Types ──────────────────────────────────────────────────────────────────

type NotificationType =
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'settlement_requested'
  | 'settlement_confirmed'
  | 'settlement_rejected'
  | 'added_to_group'
  | 'friend_request'
  | 'friend_request_accepted'
  | 'wallet_requested';

interface PushPayload {
  targetUserIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ─── Send push via Supabase Edge Function ───────────────────────────────────

export async function sendPush(payload: PushPayload): Promise<void> {
  if (!payload.targetUserIds.length) return;

  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: payload,
    });
    if (error) console.warn('[push] send failed:', error.message);
  } catch (err) {
    console.warn('[push] send failed:', err);
  }
}

// ─── Message builders ───────────────────────────────────────────────────────

function fmtAmount(amount: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  return `${sym}${amount.toFixed(2)}`;
}

export const pushNotify = {
  /** Notify split members when a new expense is added */
  expenseAdded(params: {
    payerName: string;
    amount: number;
    currency: string;
    description: string;
    groupName?: string;
    expenseId: string;
    groupId?: string;
    targetUserIds: string[];
  }) {
    const amt = fmtAmount(params.amount, params.currency);
    sendPush({
      targetUserIds: params.targetUserIds,
      title: params.groupName ? `New expense in ${params.groupName}` : 'New expense',
      body: `${params.payerName} added "${params.description}" for ${amt}`,
      data: {
        type: 'expense_added',
        expenseId: params.expenseId,
        ...(params.groupId ? { groupId: params.groupId } : {}),
      },
    }).catch(() => {});
  },

  /** Notify the recipient when a settlement is requested */
  settlementRequested(params: {
    fromName: string;
    amount: number;
    currency: string;
    toUserId: string;
    settlementId: string;
  }) {
    const amt = fmtAmount(params.amount, params.currency);
    sendPush({
      targetUserIds: [params.toUserId],
      title: 'Settlement request',
      body: `${params.fromName} wants to settle ${amt} with you`,
      data: {
        type: 'settlement_requested',
      },
    }).catch(() => {});
  },

  /** Notify the requester when their settlement is confirmed */
  settlementConfirmed(params: {
    byName: string;
    amount: number;
    currency: string;
    fromUserId: string;
    settlementId: string;
  }) {
    const amt = fmtAmount(params.amount, params.currency);
    sendPush({
      targetUserIds: [params.fromUserId],
      title: 'Settlement confirmed',
      body: `${params.byName} confirmed your ${amt} payment`,
      data: {
        type: 'settlement_confirmed',
      },
    }).catch(() => {});
  },

  /** Notify the requester when their settlement is rejected */
  settlementRejected(params: {
    byName: string;
    amount: number;
    currency: string;
    fromUserId: string;
    settlementId: string;
  }) {
    const amt = fmtAmount(params.amount, params.currency);
    sendPush({
      targetUserIds: [params.fromUserId],
      title: 'Settlement rejected',
      body: `${params.byName} declined your ${amt} settlement`,
      data: {
        type: 'settlement_rejected',
      },
    }).catch(() => {});
  },

  /** Notify a user someone sent them a friend request */
  friendRequest(params: { fromName: string; targetUserId: string }) {
    sendPush({
      targetUserIds: [params.targetUserId],
      title: 'Friend request',
      body: `${params.fromName} wants to be friends on Evenly`,
      data: { type: 'friend_request' },
    }).catch(() => {});
  },

  /** Notify the sender their friend request was accepted */
  friendRequestAccepted(params: { byName: string; targetUserId: string }) {
    sendPush({
      targetUserIds: [params.targetUserId],
      title: 'Request accepted',
      body: `${params.byName} accepted your friend request`,
      data: { type: 'friend_request_accepted' },
    }).catch(() => {});
  },

  /** Notify a user that a friend wants their crypto receiving address */
  walletRequested(params: { fromName: string; targetUserId: string }) {
    sendPush({
      targetUserIds: [params.targetUserId],
      title: 'Crypto address requested',
      body: `${params.fromName} wants to pay you crypto — add a receiving address in Account`,
      data: { type: 'wallet_requested' },
    }).catch(() => {});
  },

  /** Notify a user they were added to a group */
  addedToGroup(params: {
    adderName: string;
    groupName: string;
    groupId: string;
    targetUserIds: string[];
  }) {
    sendPush({
      targetUserIds: params.targetUserIds,
      title: `Added to ${params.groupName}`,
      body: `${params.adderName} added you to "${params.groupName}"`,
      data: {
        type: 'added_to_group',
        groupId: params.groupId,
      },
    }).catch(() => {});
  },
};
