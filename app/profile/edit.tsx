import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Platform,
  Pressable, Alert, TextInput,
  Modal, FlatList, StatusBar,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, useSharedValue, useAnimatedStyle,
  withTiming, withDelay, withSequence, withSpring, Easing,
} from 'react-native-reanimated';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { CURRENCIES, CurrencyConfig } from '../../constants/currencies';
import { useAuth } from '../../hooks/useAuth';
import { CustomAvatar, isLegacyPresetUri } from '../../components/ui/CustomAvatar';
import { AvatarGlyph } from '../../components/ui/AvatarGlyph';
import { isValidPhone } from '../../utils/validators';
import * as Haptics from 'expo-haptics';

/** Seed variations offered in the avatar picker grid */
const GLYPH_CHOICES = Array.from({ length: 24 }, (_, i) => i);

function SavedOverlay({ colors, font, onDone }: { colors: any; font: any; onDone: () => void }) {
  const translateY = useSharedValue(80);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 200 });

    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(80, { duration: 280, easing: Easing.in(Easing.ease) });
      setTimeout(onDone, 300);
    }, 900);

    return () => clearTimeout(timer);
  }, []);

  const toastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.savedOverlay} pointerEvents="none">
      <Animated.View style={[styles.savedContent, { backgroundColor: colors.surface, borderColor: colors.border }, toastStyle]}>
        <View style={[styles.savedIconWrap, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
        </View>
        <Animated.Text style={[styles.savedText, { fontFamily: font.semiBold, color: colors.textPrimary }]}>
          Profile saved
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

export default function EditProfileScreen() {
  const colors = useColors();
  const font = useFont();
  const { currentUser, editProfile, isLoading } = useAuth();

  const [name, setName]           = useState(currentUser?.name ?? '');
  const [phone, setPhone]         = useState(currentUser?.phone ?? '');
  // URIs from the retired preset picker render as buddies anyway — treat them
  // as "no avatar" so the remove button doesn't offer a visually no-op action.
  const [avatarUri, setAvatarUri] = useState<string | null>(() => {
    const saved = currentUser?.avatarUrl ?? null;
    return saved && isLegacyPresetUri(saved) ? null : saved;
  });
  // A photo uri that exists but fails to load (stale file:// from an old
  // install) also renders as a buddy — flagged so the remove label is honest.
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => setAvatarBroken(false), [avatarUri]);
  const [currency, setCurrency]   = useState(currentUser?.defaultCurrency ?? 'USD');
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneErr] = useState('');
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const glyphBase = name || currentUser?.email || 'user';

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to change your picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      // Downscale to avatar size once here so every screen renders a crisp,
      // pre-shrunk image instead of downsampling a full-res photo on the fly
      const processed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      setAvatarUri(processed.uri);
    }
  };

  const handleSave = useCallback(async () => {
    let valid = true;
    if (!name.trim())                   { setNameError('Name is required.'); valid = false; }
    if (phone && !isValidPhone(phone))  { setPhoneErr('Enter a valid phone number.'); valid = false; }
    if (!valid) return;

    await editProfile({
      name:            name.trim(),
      phone:           phone.trim() || undefined,
      // '' is the explicit "cleared" value — undefined/null would be skipped by
      // the COALESCE in usersDb.update and dropped from the auth-metadata JSON,
      // silently resurrecting a removed avatar on the next restart.
      avatarUrl:       avatarUri ?? '',
      defaultCurrency: currency,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
  }, [name, phone, avatarUri, currency, editProfile]);

  const selectedCurrency = CURRENCIES.find((c) => c.code === currency);

  const filteredCurrencies = useMemo(() => {
    if (!currencySearch.trim()) return CURRENCIES;
    const q = currencySearch.toLowerCase();
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.symbol.includes(q)
    );
  }, [currencySearch]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Avatar card */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={() => setAvatarPickerOpen(true)} activeOpacity={0.8}>
                <CustomAvatar name={name || currentUser?.email || 'user'} uri={avatarUri} size={88} onLoadError={() => setAvatarBroken(true)} />
                <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
                  <Ionicons name="color-palette-outline" size={14} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <View style={{ alignItems: 'center', marginTop: Spacing.sm }}>
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 16, color: colors.textPrimary }}>
                  {currentUser?.name ?? 'User'}
                </CustomText>
                <CustomText style={{ fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 }}>
                  {currentUser?.email ?? ''}
                </CustomText>
              </View>
              {avatarUri && (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setAvatarUri(null);
                  }}
                  style={{ marginTop: Spacing.xs }}
                >
                  <CustomText style={{ fontSize: 13, color: Colors.danger, fontFamily: font.medium }}>
                    {avatarUri.startsWith('glyph:')
                      ? 'Reset to default buddy'
                      : avatarBroken ? 'Remove broken photo link' : 'Remove photo'}
                  </CustomText>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Avatar Picker Modal */}
          <Modal visible={avatarPickerOpen} animationType="slide" transparent onRequestClose={() => setAvatarPickerOpen(false)}>
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setAvatarPickerOpen(false)} />
              <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, maxHeight: '80%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg }}>
                  <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary }}>Choose Avatar</CustomText>
                  <TouchableOpacity onPress={() => setAvatarPickerOpen(false)} hitSlop={12}>
                    <Ionicons name="close" size={24} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={GLYPH_CHOICES}
                  keyExtractor={(item) => String(item)}
                  numColumns={4}
                  contentContainerStyle={{ paddingBottom: Spacing.xl }}
                  columnWrapperStyle={{ gap: Spacing.md, marginBottom: Spacing.md }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setAvatarUri(`glyph:${glyphBase}#${item}`);
                        setAvatarPickerOpen(false);
                      }}
                      activeOpacity={0.7}
                      style={{ flex: 1, maxWidth: '23%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <AvatarGlyph name={`${glyphBase}#${item}`} size={64} />
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity
                  onPress={() => { setAvatarPickerOpen(false); pickAvatar(); }}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.xl }}
                >
                  <Ionicons name="image-outline" size={18} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.primary, marginLeft: Spacing.sm }}>
                    Upload from Gallery
                  </CustomText>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Personal info card */}
          <CustomText variant="label" style={styles.sectionLabel}>Personal Information</CustomText>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CustomTextInput
              label="Full Name"
              value={name}
              onChangeText={(t) => { setName(t); setNameError(''); }}
              placeholder="Your name"
              autoCapitalize="words"
              error={nameError}
            />
            <CustomTextInput
              label="Phone (optional)"
              value={phone}
              onChangeText={(t) => { setPhone(t); setPhoneErr(''); }}
              placeholder="+1 555 000 0000"
              keyboardType="phone-pad"
              error={phoneError}
            />
          </View>

          {/* Currency picker */}
          <CustomText variant="label" style={styles.sectionLabel}>Preferences</CustomText>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Default Currency</CustomText>

          <TouchableOpacity
            style={[styles.currencyDropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => { setCurrencySearch(''); setCurrencyModalOpen(true); }}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[styles.currencyBadge, { backgroundColor: colors.primaryLight }]}>
                <CustomText style={{ fontSize: 18, fontFamily: font.bold, color: colors.primary }}>
                  {selectedCurrency?.symbol}
                </CustomText>
              </View>
              <View>
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                  {selectedCurrency?.code}
                </CustomText>
                <CustomText style={{ fontFamily: font.regular, fontSize: 12, color: colors.textMuted }}>
                  {selectedCurrency?.name}
                </CustomText>
              </View>
            </View>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Currency picker modal */}
          <Modal visible={currencyModalOpen} animationType="slide" transparent onRequestClose={() => setCurrencyModalOpen(false)}>
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <View style={styles.modalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setCurrencyModalOpen(false)} />
              <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                <View style={styles.modalHeader}>
                  <CustomText variant="heading3">Select Currency</CustomText>
                  <TouchableOpacity onPress={() => setCurrencyModalOpen(false)} hitSlop={12}>
                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { fontFamily: font.regular, color: colors.textPrimary }]}
                    placeholder="Search currency..."
                    placeholderTextColor={colors.textMuted}
                    value={currencySearch}
                    onChangeText={setCurrencySearch}
                    autoFocus
                  />
                  {currencySearch.length > 0 && (
                    <TouchableOpacity onPress={() => setCurrencySearch('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <FlatList
                  data={filteredCurrencies}
                  keyExtractor={(item) => item.code}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }: { item: CurrencyConfig }) => {
                    const active = currency === item.code;
                    return (
                      <TouchableOpacity
                        style={[styles.currencyRow, active && { backgroundColor: colors.primaryLight }]}
                        onPress={() => { setCurrency(item.code); setCurrencyModalOpen(false); }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.currencyRowBadge, { backgroundColor: active ? colors.primary : colors.surface }]}>
                          <CustomText style={{ fontSize: 16, fontFamily: font.bold, color: active ? Colors.white : colors.textPrimary }}>
                            {item.symbol}
                          </CustomText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <CustomText style={{ fontFamily: font.medium, fontSize: 15, color: colors.textPrimary }}>
                            {item.code}
                          </CustomText>
                          <CustomText style={{ fontFamily: font.regular, fontSize: 12, color: colors.textMuted }}>
                            {item.name}
                          </CustomText>
                        </View>
                        {active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  }}
                  ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
                />
              </View>
            </View>
            </KeyboardAvoidingView>
          </Modal>
          </View>

        </ScrollView>

        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <CustomButton
            title="Save Changes"
            onPress={handleSave}
            loading={isLoading}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>

      {/* Success toast */}
      {saved && <SavedOverlay colors={colors} font={font} onDone={() => router.back()} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing['4xl'] },

  card: {
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.lg, marginBottom: Spacing.base,
  },
  sectionLabel: { marginBottom: Spacing.sm, marginTop: Spacing.sm, marginLeft: 4 },
  avatarSection:     { alignItems: 'center' },
  avatarImg:         { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  avatarInitials:    { fontSize: 30, color: Colors.white },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },

  currencyLabel:  { marginBottom: Spacing.sm, marginTop: Spacing.sm },
  currencyDropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: BorderRadius.md, borderWidth: 1,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    marginBottom: Spacing.base,
  },
  currencyBadge: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 20 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    borderRadius: BorderRadius.md, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15 },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
  },
  currencyRowBadge: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.lg + 50 },

  stickyBottom: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderTopWidth: 1 },

  savedOverlay: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 999,
  },
  savedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 100,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  savedIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedText: {
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
