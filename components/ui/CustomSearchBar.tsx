import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { FontSize } from '../../constants/fonts';
import { BorderRadius, Spacing } from '../../constants/theme';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';

interface CustomSearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  debounceMs?: number;
  containerStyle?: ViewStyle;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const CustomSearchBar: React.FC<CustomSearchBarProps> = ({
  placeholder = 'Search…',
  value,
  onChangeText,
  debounceMs = 300,
  containerStyle,
  onFocus,
  onBlur,
}) => {
  const colors = useColors();
  const font = useFont();
  const [localValue, setLocalValue] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (text: string) => {
    setLocalValue(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChangeText(text), debounceMs);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.border }, containerStyle]}>
      <TextInput
        value={localValue}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { fontFamily: font.regular, color: colors.textPrimary }]}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {localValue.length > 0 && (
        <TouchableOpacity onPress={() => handleChange('')} style={styles.clear}>
          {/* X icon placeholder */}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: FontSize.base,
  },
  clear: { padding: 4 },
});
