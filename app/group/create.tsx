import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Switch } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { CustomChip } from '../../components/ui/CustomChip';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing } from '../../constants/theme';
import { GroupType } from '../../types';
import { useGroups } from '../../hooks/useGroups';
import { useAppSelector } from '../../store';

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

export default function CreateGroupScreen() {
  const colors = useColors();
  const { createGroup } = useGroups();
  const currentUser = useAppSelector((s) => s.auth.currentUser);

  const [name, setName]       = useState('');
  const [type, setType]       = useState<GroupType>('other');
  const [tripMode, setTripMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');


  const handleCreate = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    if (!currentUser) return;
    setLoading(true);
    try {
      const newGroup = await createGroup(name.trim(), type, [currentUser.id], currentUser.id);
      if (tripMode) {
        router.replace(`/group/trip-budget?groupId=${newGroup.id}` as any);
      } else {
        router.back();
      }
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
        <CustomText variant="heading3" style={{ marginBottom: Spacing.lg }}>New Group</CustomText>

        <CustomTextInput
          label="Group Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Barcelona Trip, Flat 4B"
          error={error}
        />

        <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Group Type</CustomText>
        <View style={styles.chips}>
          {GROUP_TYPES.map((t) => (
            <CustomChip
              key={t.key}
              label={t.label}
              selected={type === t.key}
              onPress={() => {
                setType(t.key);
                if (t.key === 'trip') setTripMode(true);
              }}
            />
          ))}
        </View>

        {/* Trip Mode Toggle */}
        <View style={styles.tripToggleRow}>
          <View style={{ flex: 1 }}>
            <CustomText variant="label">Trip Mode</CustomText>
            <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
              Set a budget and track spending by category
            </CustomText>
          </View>
          <Switch
            value={tripMode}
            onValueChange={setTripMode}
            trackColor={{ false: colors.border, true: colors.primary + '60' }}
            thumbColor={tripMode ? colors.primary : colors.textMuted}
          />
        </View>

      </ScrollView>

      <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <CustomButton
          title="Create Group"
          onPress={handleCreate}
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
  scroll: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  chips:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.base, gap: Spacing.sm },
  tripToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  stickyBottom: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderTopWidth: 1 },
});
