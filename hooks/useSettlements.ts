import { useCallback } from 'react';
import { useAppDispatch, useAppSelector, store } from '../store';
import {
  setSettlements, addSettlement, setLoading, setError,
  setPendingForMe, setPendingSentByMe, updateSettlementStatus,
} from '../store/slices/settlementsSlice';
import { settlementsDb } from '../db/database';
import { queuedSettlementSync as settlementSync } from '../services/syncProxy';
import { pushNotify } from '../services/pushNotifications';
import { Settlement } from '../types';
import { nowISO } from '../utils/dateUtils';
import uuid from 'react-native-uuid';

export const useSettlements = () => {
  const dispatch = useAppDispatch();
  const settlements = useAppSelector((s) => s.settlements.items);
  const pendingForMe = useAppSelector((s) => s.settlements.pendingForMe);
  const pendingSentByMe = useAppSelector((s) => s.settlements.pendingSentByMe);
  const isLoading = useAppSelector((s) => s.settlements.isLoading);

  const loadSettlements = async (groupId: string) => {
    dispatch(setLoading(true));
    try {
      const data = await settlementsDb.findByGroup(groupId);
      dispatch(setSettlements(data));
    } catch (err: unknown) {
      dispatch(setError((err as Error).message));
    }
  };

  const settleUp = async (params: {
    fromUserId: string;
    toUserId: string;
    amount: number;
    currency: string;
    groupId?: string;
    note?: string;
    paymentTxHash?: string;
    paymentChainId?: number;
  }): Promise<Settlement> => {
    const settlement: Settlement = {
      id: uuid.v4() as string,
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      amount: params.amount,
      currency: params.currency,
      groupId: params.groupId,
      note: params.note,
      status: 'pending',
      settledAt: nowISO(),
      createdAt: nowISO(),
      paymentTxHash: params.paymentTxHash,
      paymentChainId: params.paymentChainId,
    };
    await settlementsDb.insert(settlement);
    settlementSync.insert(settlement).catch(() => {});
    dispatch(addSettlement(settlement));
    // Push notification to recipient (fire-and-forget)
    const currentUser = store.getState().auth.currentUser;
    pushNotify.settlementRequested({
      fromName: currentUser?.name ?? 'Someone',
      amount: params.amount,
      currency: params.currency,
      toUserId: params.toUserId,
      settlementId: settlement.id,
    });
    return settlement;
  };

  const loadPendingSettlements = useCallback(async (userId: string) => {
    const forMe = await settlementsDb.findPendingForUser(userId);
    dispatch(setPendingForMe(forMe));
    const byMe = await settlementsDb.findPendingByUser(userId);
    dispatch(setPendingSentByMe(byMe));
  }, [dispatch]);

  const confirmSettlement = async (settlementId: string, settlement?: Settlement) => {
    await settlementsDb.updateStatus(settlementId, 'confirmed');
    settlementSync.updateStatus(settlementId, 'confirmed').catch(() => {});
    dispatch(updateSettlementStatus({ id: settlementId, status: 'confirmed' }));
    // Push notification to the requester (fire-and-forget)
    if (settlement) {
      const currentUser = store.getState().auth.currentUser;
      pushNotify.settlementConfirmed({
        byName: currentUser?.name ?? 'Someone',
        amount: settlement.amount,
        currency: settlement.currency,
        fromUserId: settlement.fromUserId,
        settlementId,
      });
    }
  };

  const rejectSettlement = async (settlementId: string, settlement?: Settlement) => {
    await settlementsDb.updateStatus(settlementId, 'rejected');
    settlementSync.updateStatus(settlementId, 'rejected').catch(() => {});
    dispatch(updateSettlementStatus({ id: settlementId, status: 'rejected' }));
    // Push notification to the requester (fire-and-forget)
    if (settlement) {
      const currentUser = store.getState().auth.currentUser;
      pushNotify.settlementRejected({
        byName: currentUser?.name ?? 'Someone',
        amount: settlement.amount,
        currency: settlement.currency,
        fromUserId: settlement.fromUserId,
        settlementId,
      });
    }
  };

  return {
    settlements,
    pendingForMe,
    pendingSentByMe,
    isLoading,
    loadSettlements,
    settleUp,
    loadPendingSettlements,
    confirmSettlement,
    rejectSettlement,
  };
};
