import React from 'react';
import { View, TextInput, StyleSheet, ViewStyle } from 'react-native';
import { CustomText } from './CustomText';
import { FontSize } from '../../constants/fonts';
import { getCurrencySymbol } from '../../constants/currencies';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';

interface CustomAmountInputProps {
  value: string;
  onChangeText: (text: string) => void;
  currency?: string;
  placeholder?: string;
  style?: ViewStyle;
}

export const CustomAmountInput: React.FC<CustomAmountInputProps> = ({
  value,
  onChangeText,
  currency = 'USD',
  placeholder = '0.00',
  style,
}) => {
  const colors = useColors();
  const font = useFont();
  const symbol = getCurrencySymbol(currency);

  const handleChange = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    onChangeText(cleaned);
  };

  // Format with commas for display (e.g. 50000 → 50,000)
  const formatWithCommas = (v: string): string => {
    if (!v) return '';
    const [whole, decimal] = v.split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimal !== undefined ? `${withCommas}.${decimal}` : withCommas;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      <View style={[styles.currencyBadge, { backgroundColor: colors.primary + '18' }]}>
        <CustomText style={[styles.symbol, { fontFamily: font.bold, color: colors.primary }]}>{symbol}</CustomText>
      </View>
      <TextInput
        value={formatWithCommas(value)}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        style={[styles.input, { fontFamily: font.bold, color: colors.textPrimary }]}
        maxLength={15}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  currencyBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  symbol: {
    fontSize: FontSize.lg,
  },
  input: {
    fontSize: FontSize['2xl'],
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
});
