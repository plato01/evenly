import React from 'react';
import { TouchableOpacity, StyleSheet, Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomText } from '../ui/CustomText';
import { useColors } from '../../hooks/useColors';
import { explorerTxUrl } from '../../web3/anchor';

interface OnChainBadgeProps {
  /** The anchor tx hash. When absent, nothing renders. */
  txHash?: string;
  /** Compact = icon + short label; full = adds "Verified on-chain". */
  compact?: boolean;
}

/**
 * Small pill shown on records anchored to Monad. Tapping opens the tx on the
 * block explorer — the visible "proof" of on-chain anchoring.
 */
export const OnChainBadge: React.FC<OnChainBadgeProps> = ({ txHash, compact = true }) => {
  const colors = useColors();
  if (!txHash) return null;

  const open = () => Linking.openURL(explorerTxUrl(txHash as `0x${string}`)).catch(() => {});

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={0.7}
      style={[styles.pill, { backgroundColor: colors.success + '18', borderColor: colors.success + '55' }]}
    >
      <Ionicons name="shield-checkmark" size={11} color={colors.success} />
      <CustomText style={[styles.label, { color: colors.success }]}>
        {compact ? 'On-chain' : 'Verified on-chain'}
      </CustomText>
      {!compact && (
        <View style={styles.linkIcon}>
          <Ionicons name="open-outline" size={11} color={colors.success} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
    marginTop: 4,
  },
  label: { fontSize: 10, fontWeight: '600' },
  linkIcon: { marginLeft: 1 },
});
