import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Modal, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';

import { CustomText } from '../ui/CustomText';
import { CustomButton } from '../ui/CustomButton';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { Spacing, BorderRadius } from '../../constants/theme';
import {
  CategoryConfig,
  DEFAULT_CATEGORIES,
  CATEGORY_COLORS,
  getCategoryConfig,
} from '../../constants/categories';
import { categoriesDb } from '../../db/queries/categories';
import { useAppSelector } from '../../store';
import { nowISO } from '../../utils/dateUtils';
import { ExpenseCategory } from '../../types';

interface CategoryPickerModalProps {
  visible: boolean;
  selected: ExpenseCategory;
  onSelect: (key: ExpenseCategory) => void;
  onClose: () => void;
}

export const CategoryPickerModal: React.FC<CategoryPickerModalProps> = ({
  visible,
  selected,
  onSelect,
  onClose,
}) => {
  const colors = useColors();
  const font = useFont();
  const currentUser = useAppSelector((s) => s.auth.currentUser);

  const [search, setSearch]             = useState('');
  const [customCategories, setCustom]   = useState<CategoryConfig[]>([]);
  const [showAddForm, setShowAddForm]   = useState(false);
  const [newLabel, setNewLabel]         = useState('');
  const [newColor, setNewColor]         = useState(CATEGORY_COLORS[0]);

  // Load custom categories
  useEffect(() => {
    if (visible && currentUser) {
      categoriesDb.findByUser(currentUser.id).then(setCustom);
    }
  }, [visible, currentUser]);

  const allCategories = useMemo(
    () => [...DEFAULT_CATEGORIES, ...customCategories],
    [customCategories],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return allCategories;
    const q = search.toLowerCase();
    return allCategories.filter((c) => c.label.toLowerCase().includes(q));
  }, [allCategories, search]);

  const handleSelect = useCallback(
    (key: ExpenseCategory) => {
      onSelect(key);
      onClose();
      setSearch('');
      setShowAddForm(false);
    },
    [onSelect, onClose],
  );

  const handleAddCustom = useCallback(async () => {
    const label = newLabel.trim();
    if (!label) return;
    if (!currentUser) return;

    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    // Check for duplicates
    if (allCategories.some((c) => c.key === key)) {
      Alert.alert('Already exists', 'A category with that name already exists.');
      return;
    }

    const cat = {
      id: uuid.v4() as string,
      key,
      label,
      icon: 'tag',
      color: newColor,
      createdAt: nowISO(),
    };

    await categoriesDb.insert(currentUser.id, cat);
    const { queuedCategorySync } = await import('../../services/syncProxy');
    queuedCategorySync.insert(currentUser.id, cat);
    const updated = await categoriesDb.findByUser(currentUser.id);
    setCustom(updated);

    // Auto-select the new category
    setNewLabel('');
    setShowAddForm(false);
    handleSelect(key);
  }, [newLabel, newColor, currentUser, allCategories, handleSelect]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <CustomText variant="heading3">Category</CustomText>
          <TouchableOpacity onPress={() => { onClose(); setSearch(''); setShowAddForm(false); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { fontFamily: font.regular, color: colors.textPrimary }]}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category list */}
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.key}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] }}
          ListEmptyComponent={
            <CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.xl }}>
              No matching categories.
            </CustomText>
          }
          ListHeaderComponent={
            customCategories.length > 0 && !search.trim() ? (
              <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: Spacing.sm, marginBottom: Spacing.xs }}>
                Default
              </CustomText>
            ) : null
          }
          renderItem={({ item: c, index }) => {
            const isActive = selected === c.key;
            // Section header for custom categories
            const showCustomHeader =
              !search.trim() &&
              customCategories.length > 0 &&
              index === DEFAULT_CATEGORIES.length;

            return (
              <>
                {showCustomHeader && (
                  <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: Spacing.md, marginBottom: Spacing.xs }}>
                    Custom
                  </CustomText>
                )}
                <TouchableOpacity
                  onPress={() => handleSelect(c.key)}
                  activeOpacity={0.7}
                  style={[
                    styles.row,
                    {
                      backgroundColor: isActive ? colors.primaryLight : colors.surface,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={[styles.iconCircle, { backgroundColor: c.color + '22' }]}>
                    <View style={[styles.colorDot, { backgroundColor: c.color }]} />
                  </View>
                  <CustomText
                    style={{
                      flex: 1,
                      fontFamily: isActive ? font.semiBold : font.regular,
                      fontSize: 15,
                      color: colors.textPrimary,
                      marginLeft: Spacing.sm,
                    }}
                  >
                    {c.label}
                  </CustomText>
                  {isActive && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              </>
            );
          }}
        />

        {/* Add custom category */}
        {!showAddForm ? (
          <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setShowAddForm(true)}
              style={[styles.addBtn, { borderColor: colors.primary }]}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.primary, marginLeft: 6 }}>
                Add Custom Category
              </CustomText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.bottomBar, styles.addForm, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TextInput
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="Category name"
              placeholderTextColor={colors.textMuted}
              style={[styles.addInput, { fontFamily: font.regular, color: colors.textPrimary, borderColor: colors.border }]}
              autoFocus
              maxLength={30}
            />
            {/* Color picker row */}
            <View style={styles.colorRow}>
              {CATEGORY_COLORS.slice(0, 10).map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setNewColor(c)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    newColor === c && { borderWidth: 2.5, borderColor: colors.textPrimary },
                  ]}
                />
              ))}
            </View>
            <View style={styles.addActions}>
              <CustomButton
                title="Cancel"
                variant="outline"
                onPress={() => { setShowAddForm(false); setNewLabel(''); }}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <CustomButton
                title="Add"
                onPress={handleAddCustom}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, marginLeft: Spacing.xs, paddingVertical: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  bottomBar: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  addForm: {
    paddingBottom: Spacing.lg,
  },
  addInput: {
    fontSize: 15,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  addActions: {
    flexDirection: 'row',
  },
});
