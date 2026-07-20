import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomAvatar } from '../ui/CustomAvatar';
import { CustomText } from '../ui/CustomText';
import { Colors } from '../../constants/colors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useColors } from '../../hooks/useColors';

interface MemberChipProps {
  name: string;
  avatarUri?: string;
  onRemove?: () => void;
  onToggle?: () => void;
  isCurrentUser?: boolean;
  excluded?: boolean;
}

export const MemberChip: React.FC<MemberChipProps> = ({
  name,
  avatarUri,
  onRemove,
  onToggle,
  isCurrentUser = false,
  excluded = false,
}) => {
  const colors = useColors();
  const font = useFont();

  const Wrapper = onToggle ? TouchableOpacity : View;
  const wrapperProps = onToggle ? { onPress: onToggle, activeOpacity: 0.7 } : {};

  return (
    <Wrapper
      {...wrapperProps as any}
      style={[
        styles.chip,
        { backgroundColor: excluded ? colors.border : colors.primaryLight },
        excluded && { opacity: 0.5 },
      ]}
    >
      <CustomAvatar name={name} uri={avatarUri} size={28} />
      <CustomText
        style={{
          fontFamily: font.medium,
          fontSize: 13,
          color: excluded ? colors.textMuted : colors.textPrimary,
          marginLeft: 6,
          textDecorationLine: excluded ? 'line-through' : 'none',
        }}
      >
        {isCurrentUser ? 'You' : name}
      </CustomText>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.remove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={12} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </Wrapper>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  remove: { marginLeft: 6 },
});
