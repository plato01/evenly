import React from 'react';
import { StyleSheet } from 'react-native';
import { CustomText } from '../ui/CustomText';
import { Colors } from '../../constants/colors';
import { formatBalance } from '../../utils/currency';
import { useFont } from '../../hooks/useFont';

interface BalanceLabelProps {
  amount: number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = { sm: 12, md: 14, lg: 18 };

export const BalanceLabel: React.FC<BalanceLabelProps> = ({
  amount,
  currency = 'USD',
  size = 'md',
}) => {
  const font = useFont();
  const { text, isPositive } = formatBalance(amount, currency);
  const color = amount === 0 ? Colors.settled : isPositive ? Colors.owed : Colors.owe;

  return (
    <CustomText
      style={{
        fontFamily: font.semiBold,
        fontSize: sizeMap[size],
        color,
        fontVariant: ['tabular-nums'],
      }}
    >
      {text}
    </CustomText>
  );
};
