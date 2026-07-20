import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomText } from '../ui/CustomText';
import { Colors } from '../../constants/colors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/dateUtils';
import { Settlement } from '../../types';
import { useColors } from '../../hooks/useColors';
import { explorerTxUrl } from '../../web3/anchor';

interface SettlementCardProps {
  settlement: Settlement;
  fromName: string;
  toName: string;
  currentUserId?: string;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
}

export const SettlementCard: React.FC<SettlementCardProps> = ({
  settlement, fromName, toName, currentUserId, onConfirm, onReject,
}) => {
  const colors = useColors();
  const font = useFont();
  const isPending = settlement.status === 'pending';
  const showActions = isPending && currentUserId === settlement.toUserId;

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Top: who pays whom + amount */}
      <View style={s.topRow}>
        <View style={{ flex: 1, marginRight: Spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <CustomText
              numberOfLines={1}
              style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, flexShrink: 1 }}
            >
              {fromName}
            </CustomText>
            <View style={[s.arrowChip, { backgroundColor: colors.background }]}>
              <Ionicons name="arrow-forward" size={11} color={colors.textMuted} />
            </View>
            <CustomText
              numberOfLines={1}
              style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, flexShrink: 1 }}
            >
              {toName}
            </CustomText>
          </View>
          <CustomText style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
            {formatDate(settlement.settledAt)}{settlement.note ? ` · ${settlement.note}` : ''}
          </CustomText>
        </View>
        <CustomText style={{
          fontFamily: font.bold, fontSize: 16, fontVariant: ['tabular-nums'],
          color: isPending ? Colors.warning : settlement.status === 'confirmed' ? Colors.success : Colors.danger,
        }}>
          {formatCurrency(settlement.amount, settlement.currency)}
        </CustomText>
      </View>

      {/* Crypto payment proof — "Verified" only after the server read the chain */}
      {settlement.paymentTxHash && (
        <TouchableOpacity
          style={[s.txRow, { borderColor: colors.success + '55', backgroundColor: colors.success + '12' }]}
          onPress={() => Linking.openURL(explorerTxUrl(settlement.paymentTxHash as `0x${string}`)).catch(() => {})}
          activeOpacity={0.7}
        >
          <Ionicons
            name={settlement.paymentVerified ? 'shield-checkmark' : 'link'}
            size={13}
            color={colors.success}
          />
          <CustomText style={{ fontSize: 12, color: colors.success, marginLeft: 5, flex: 1 }} numberOfLines={1}>
            {settlement.paymentVerified
              ? 'Verified on-chain · view transaction'
              : 'Paid on-chain (unverified) · view transaction'}
          </CustomText>
          <Ionicons name="open-outline" size={13} color={colors.success} />
        </TouchableOpacity>
      )}

      {/* Actions */}
      {showActions && (
        <View style={s.actions}>
          <TouchableOpacity
            style={[s.confirmBtn, { backgroundColor: Colors.success + '15' }]}
            onPress={() => onConfirm?.(settlement.id)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={16} color={Colors.success} />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: Colors.success, marginLeft: 4 }}>
              Confirm
            </CustomText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.rejectBtn, { backgroundColor: Colors.danger + '10' }]}
            onPress={() => onReject?.(settlement.id)}
            activeOpacity={0.7}
          >
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: Colors.danger }}>
              Decline
            </CustomText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  arrowChip: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 6,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.md, borderWidth: 1,
  },
  actions: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md,
  },
  confirmBtn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: BorderRadius.md,
  },
  rejectBtn: {
    paddingHorizontal: Spacing.base, paddingVertical: 8,
    borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center',
  },
});
