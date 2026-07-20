export type ActivityType =
  | 'expense_added'
  | 'expense_edited'
  | 'expense_deleted'
  | 'settlement_created'
  | 'member_added'
  | 'member_removed'
  | 'group_created'
  | 'comment_added'
  | 'friend_added'
  | 'friend_request'
  | 'friend_request_accepted'
  | 'wallet_requested';

export interface Activity {
  id: string;
  type: ActivityType;
  entityId: string;
  entityType: 'expense' | 'settlement' | 'group' | 'comment' | 'user';
  userId: string;
  userName?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  read: boolean;
}
