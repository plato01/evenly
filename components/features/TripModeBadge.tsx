import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomText } from '../ui/CustomText';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';

interface TripModeBadgeProps {
  daysLeft?: number;
}

export const TripModeBadge: React.FC<TripModeBadgeProps> = ({ daysLeft }) => {
  const colors = useColors();
  const font = useFont();

  const label = daysLeft != null ? `Trip \u00B7 ${daysLeft}d left` : 'Trip';

  return (
    <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
      <Ionicons name="airplane" size={12} color={colors.primary} />
      <CustomText
        style={{
          fontFamily: font.semiBold,
          fontSize: 10,
          color: colors.primary,
          marginLeft: 4,
        }}
      >
        {label}
      </CustomText>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
});
