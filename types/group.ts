import { User } from './user';

export type GroupType = 'home' | 'trip' | 'couple' | 'work' | 'food' | 'sports' | 'party' | 'family' | 'roommates' | 'other';

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  avatarUrl?: string;
  color?: string;
  createdBy: string;
  archived: boolean;
  createdAt: string;
  members?: GroupMember[];
  totalBalance?: number;
  /** web3: tx hash that anchored this group on-chain (if anchored). */
  chainTxHash?: string;
  /** web3: ISO timestamp of the on-chain anchor. */
  chainAnchoredAt?: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: string;
  user?: User;
  balance?: number;
}

export interface GroupBalance {
  userId: string;
  userName: string;
  amount: number; // positive = owed to user, negative = user owes
}
