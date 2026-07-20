import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReAnimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CustomAvatar } from '../ui/CustomAvatar';
import { CustomText } from '../ui/CustomText';
import { Colors } from '../../constants/colors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useColors } from '../../hooks/useColors';
import { formatCurrency } from '../../utils/currency';

interface FriendCardProps {
  name: string;
  email?: string;
  avatarUri?: string;
  balance: number;
  currency?: string;
  onPress?: () => void;
}

const SPRING = { damping: 15, stiffness: 150 };

export const FriendCard: React.FC<FriendCardProps> = ({
  name,
  email,
  avatarUri,
  balance,
  currency = 'USD',
  onPress,
}) => {
  const colors = useColors();
  const font = useFont();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isOwed = balance > 0;
  const isSettled = balance === 0;

  const balanceColor = isSettled ? colors.textMuted : isOwed ? Colors.owed : Colors.owe;
  const badgeBg = isSettled
    ? (colors.textMuted + '12')
    : isOwed
      ? (Colors.owed + '12')
      : (Colors.owe + '12');

  const formatted = isSettled ? '' : formatCurrency(Math.abs(balance), currency);

  return (
    <ReAnimated.View style={animStyle}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, SPRING); }}
        onPressOut={() => { scale.value = withSpring(1, SPRING); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        style={[styles.card, { backgroundColor: colors.surface }]}
      >
        <CustomAvatar name={name} uri={avatarUri} size={44} />
        <View style={styles.info}>
          <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }} numberOfLines={1}>
            {name}
          </CustomText>
          {email ? (
            <CustomText style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>
              {email}
            </CustomText>
          ) : null}
        </View>
        {isSettled ? (
          <View style={[styles.pill, { backgroundColor: badgeBg }]}>
            <Ionicons name="checkmark" size={12} color={colors.textMuted} />
            <CustomText style={{ fontFamily: font.medium, fontSize: 11, color: colors.textMuted, marginLeft: 3 }}>
              Settled
            </CustomText>
          </View>
        ) : (
          <View style={[styles.pill, { backgroundColor: badgeBg }]}>
            <Ionicons name={isOwed ? 'arrow-down' : 'arrow-up'} size={11} color={balanceColor} />
            <CustomText
              style={{
                fontFamily: font.bold, fontSize: 13, color: balanceColor,
                fontVariant: ['tabular-nums'], marginLeft: 3,
              }}
            >
              {formatted}
            </CustomText>
          </View>
        )}
      </Pressable>
    </ReAnimated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 13,
    marginHorizontal: Spacing.base,
    marginBottom: 2,
    borderRadius: BorderRadius.lg,
  },
  info: { flex: 1, marginLeft: Spacing.md, marginRight: Spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
});
