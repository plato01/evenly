import React from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomText } from './CustomText';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';

/**
 * Bottom-sheet single-select picker: dimmed backdrop, header with close
 * button, one bordered row per option with the active row highlighted and
 * checkmarked. The caller only supplies the row body via `renderRow` — the
 * sheet chrome, active styling, and checkmark are drawn here so every picker
 * (theme, font, reminders, …) stays visually in lockstep.
 */
export function PickerSheet<O extends { key: string }>({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
  renderRow,
}: {
  visible: boolean;
  title: string;
  options: readonly O[];
  selectedKey: string;
  onSelect: (key: O['key']) => void;
  onClose: () => void;
  renderRow: (option: O, active: boolean) => React.ReactNode;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.content, { backgroundColor: colors.background }]}>
          <View style={st.header}>
            <CustomText variant="heading3">{title}</CustomText>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm }}>
            {options.map((opt) => {
              const active = opt.key === selectedKey;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[st.row, {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary + '10' : colors.surface,
                  }]}
                  onPress={() => onSelect(opt.key as O['key'])}
                  activeOpacity={0.7}
                >
                  {renderRow(opt, active)}
                  {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
});
