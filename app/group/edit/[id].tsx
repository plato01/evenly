import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CustomText } from '../../../components/ui/CustomText';
import { CustomTextInput } from '../../../components/ui/CustomTextInput';
import { CustomButton } from '../../../components/ui/CustomButton';
import { CustomChip } from '../../../components/ui/CustomChip';
import { useColors } from '../../../hooks/useColors';
import { Spacing, BorderRadius } from '../../../constants/theme';
import { GroupType } from '../../../types';
import { useGroups, useGroupById } from '../../../hooks/useGroups';

const GROUP_TYPES: { key: GroupType; label: string }[] = [
  { key: 'home',      label: 'Home'      },
  { key: 'trip',      label: 'Trip'      },
  { key: 'couple',    label: 'Couple'    },
  { key: 'work',      label: 'Work'      },
  { key: 'food',      label: 'Food'      },
  { key: 'sports',    label: 'Sports'    },
  { key: 'party',     label: 'Party'     },
  { key: 'family',    label: 'Family'    },
  { key: 'roommates', label: 'Roommates' },
  { key: 'other',     label: 'Other'     },
];

const GROUP_COLORS = [
  '#7C9CF5', '#C084FC', '#F87171', '#FBBF24', '#4ADE80',
  '#60A5FA', '#FB923C', '#E879F9', '#34D399', '#F472B6',
  '#A78BFA', '#38BDF8', '#FCA5A5', '#86EFAC', '#FDE68A',
  null, // "no color" option
];

export default function EditGroupScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroupById(id);
  const { editGroup } = useGroups();

  const [name, setName]     = useState('');
  const [type, setType]     = useState<GroupType>('other');
  const [color, setColor]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');


  useEffect(() => {
    if (group) {
      setName(group.name);
      setType(group.type);
      setColor(group.color ?? null);
    }
  }, [group]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    setLoading(true);
    try {
      await editGroup(id, {
        name: name.trim(),
        type,
        color: color ?? undefined,
      });
      router.back();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <CustomText variant="heading3" style={{ marginBottom: Spacing.lg }}>Edit Group</CustomText>

        <CustomTextInput
          label="Group Name"
          value={name}
          onChangeText={(v) => { setName(v); setError(''); }}
          placeholder="e.g. Barcelona Trip, Flat 4B"
          error={error}
        />

        <CustomText variant="label" style={{ marginBottom: Spacing.sm, marginTop: Spacing.md }}>
          Group Type
        </CustomText>
        <View style={styles.chips}>
          {GROUP_TYPES.map((t) => (
            <CustomChip
              key={t.key}
              label={t.label}
              selected={type === t.key}
              onPress={() => setType(t.key)}
            />
          ))}
        </View>

        <CustomText variant="label" style={{ marginBottom: Spacing.sm, marginTop: Spacing.md }}>
          Group Color
        </CustomText>
        <View style={styles.colorGrid}>
          {GROUP_COLORS.map((c, i) => {
            const isSelected = c === color || (c === null && color === null);
            return (
              <TouchableOpacity
                key={c ?? 'none'}
                onPress={() => setColor(c)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c ?? colors.surface, borderColor: isSelected ? colors.primary : colors.border },
                  isSelected && { borderWidth: 3 },
                ]}
              >
                {c === null && (
                  <CustomText style={{ fontSize: 12, color: colors.textMuted }}>—</CustomText>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Color preview */}
        {color && (
          <View style={[styles.preview, { backgroundColor: color }]}>
            <Ionicons
              name={({ home: 'home', trip: 'airplane', couple: 'heart', other: 'people' } as const)[type] ?? 'people'}
              size={28}
              color="#FFFFFF"
            />
          </View>
        )}

      </ScrollView>

      <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <CustomButton
          title="Save Changes"
          onPress={handleSave}
          loading={loading}
          fullWidth
        />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: 100 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyBottom: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderTopWidth: 1 },
  preview: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: Spacing.sm,
  },
});
