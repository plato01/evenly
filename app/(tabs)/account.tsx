import React, { useState, useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity, Pressable, Alert, Switch, Modal, FlatList, Platform, TextInput, ActivityIndicator, Image } from 'react-native';
import Constants from 'expo-constants';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CustomText } from '../../components/ui/CustomText';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { CustomButton } from '../../components/ui/CustomButton';
import { PickerSheet } from '../../components/ui/PickerSheet';
import { Colors } from '../../constants/colors';
import { Expense } from '../../types';
import { expensesDb } from '../../db/queries/expenses';
import { groupsDb } from '../../db/queries/groups';
import { usersDb } from '../../db/queries/users';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/dateUtils';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { SUPPORTED_CHAINS, DEFAULT_CHAIN, DEFAULT_STABLECOIN, isValidAddressForChain, addressPlaceholder, addressFormatHint, chainName, chainStablecoins, resolveStablecoin, walletQrValue, type StableSymbol } from '../../web3/chains';
import { ChainLogo } from '../../web3/ChainLogo';
import QRCode from 'react-native-qrcode-svg';
import { useFont } from '../../hooks/useFont';
import { getCurrencySymbol, CURRENCIES } from '../../constants/currencies';
import { StorageKeys } from '../../constants/storageKeys';
import { useAuth } from '../../hooks/useAuth';
import { useAppDispatch, useAppSelector } from '../../store';
import { setNotificationsEnabled, setFontFamily, ThemeMode } from '../../store/slices/uiSlice';
import { FONT_FAMILIES, FontFamilyId } from '../../constants/fonts';
import { storage } from '../../services/storage';
import { useThemeTransition } from '../../components/ui/ThemeTransition';
import { getNudgeFrequency, setNudgeFrequency, NudgeFrequency } from '../../services/nudgeService';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function AccountScreen() {
  const colors = useColors();
  const font = useFont();
  const { currentUser, signOut, editProfile } = useAuth();
  const dispatch = useAppDispatch();
  const { switchTheme } = useThemeTransition();
  const themeMode = useAppSelector((s) => s.ui.themeMode);
  const notificationsEnabled = useAppSelector((s) => s.ui.notificationsEnabled);
  const fontFamilyId = useAppSelector((s) => s.ui.fontFamily);

  const currencySymbol = getCurrencySymbol(currentUser?.defaultCurrency ?? 'USD');

  // ─── Currency Picker ───────────────────────────────────────────────────────
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [deletedExpenses, setDeletedExpenses] = useState<Expense[]>([]);
  const loadDeleted = async () => {
    const items = await expensesDb.findDeleted();
    setDeletedExpenses(items);
  };
  const handleRestore = async (id: string) => {
    await expensesDb.restore(id);
    setDeletedExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const handleExportCSV = async () => {
    try {
      const expenses = await expensesDb.findAll();
      if (expenses.length === 0) {
        Alert.alert('No Data', 'No expenses to export.');
        return;
      }
      const header = 'Date,Description,Amount,Currency,Category,Split Type,Personal,Tags,Notes\n';
      const rows = expenses.map((e) =>
        [
          e.date,
          `"${e.description.replace(/"/g, '""')}"`,
          e.totalAmount,
          e.currency,
          e.category,
          e.splitType,
          e.isPersonal ? 'Yes' : 'No',
          `"${(e.tags ?? '').replace(/"/g, '""')}"`,
          `"${(e.notes ?? '').replace(/"/g, '""')}"`,
        ].join(',')
      ).join('\n');
      const csv = header + rows;
      const file = new File(Paths.cache, 'evenly-expenses.csv');
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export Expenses' });
    } catch {
      Alert.alert('Export Failed', 'Could not export expenses.');
    }
  };
  const [currencySearch, setCurrencySearch] = useState('');
  const filteredCurrencies = useMemo(() => {
    if (!currencySearch.trim()) return CURRENCIES;
    const q = currencySearch.toLowerCase();
    return CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.symbol.includes(q)
    );
  }, [currencySearch]);

  const selectCurrency = async (code: string) => {
    setCurrencySaving(true);
    await editProfile({ defaultCurrency: code });
    setCurrencySaving(false);
    setCurrencyModalOpen(false);
  };

  // ─── Crypto receiving address ────────────────────────────────────────────
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletDraft, setWalletDraft] = useState('');
  const [walletChainDraft, setWalletChainDraft] = useState<number>(DEFAULT_CHAIN.id);
  const [walletTokenDraft, setWalletTokenDraft] = useState<StableSymbol>(DEFAULT_STABLECOIN);
  const [walletSaving, setWalletSaving] = useState(false);

  const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'Not set');

  const openWalletModal = () => {
    setWalletDraft(currentUser?.walletAddress ?? '');
    const chainId = currentUser?.walletChainId ?? DEFAULT_CHAIN.id;
    setWalletChainDraft(chainId);
    setWalletTokenDraft(resolveStablecoin(chainId, currentUser?.walletToken));
    setWalletModalOpen(true);
  };

  // Switching chains may drop an unsupported token — keep the selection valid.
  const selectWalletChain = (chainId: number) => {
    setWalletChainDraft(chainId);
    setWalletTokenDraft((t) => resolveStablecoin(chainId, t));
  };

  const saveWallet = () => {
    const addr = walletDraft.trim();
    if (!addr) { Alert.alert('No address', 'Enter a wallet address to save.'); return; }
    if (!isValidAddressForChain(walletChainDraft, addr)) {
      Alert.alert('Invalid address', `That doesn't look like ${addressFormatHint(walletChainDraft)} for ${chainName(walletChainDraft)}.`);
      return;
    }
    const isUpdating = !!currentUser?.walletAddress;
    // Verify-before-lock: sending crypto to a wrong address is irreversible.
    Alert.alert(
      isUpdating ? 'Update receiving address?' : 'Add receiving address?',
      `Please verify this is correct — payments are sent here:\n\n${addr}\n${walletTokenDraft} on ${chainName(walletChainDraft)}\n\n⚠️ Crypto sent to a wrong address is lost forever and cannot be recovered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isUpdating ? 'Yes, update' : 'Yes, add',
          onPress: async () => {
            setWalletSaving(true);
            await editProfile({ walletAddress: addr, walletChainId: walletChainDraft, walletToken: walletTokenDraft });
            // Address added — any "X requested your crypto address" notices
            // are satisfied now; clear them from the dashboard bell.
            if (currentUser) {
              import('../../services/notificationService')
                .then(({ notificationService }) => notificationService.markAllRead(currentUser.id, ['wallet_requested']))
                .catch(() => {});
            }
            setWalletSaving(false);
            setWalletModalOpen(false);
          },
        },
      ],
    );
  };

  // ─── Theme ──────────────────────────────────────────────────────────────────
  const THEME_OPTIONS: { key: ThemeMode; label: string; icon: IoniconName }[] = [
    { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
    { key: 'light', label: 'Light', icon: 'sunny-outline' },
    { key: 'dark', label: 'Dark', icon: 'moon-outline' },
    { key: 'midnight', label: 'Midnight Soft', icon: 'sparkles-outline' },
    { key: 'dreamhaze', label: 'Dream Haze', icon: 'color-wand-outline' },
    { key: 'aquarave', label: 'Aqua Rave', icon: 'water-outline' },
  ];
  const [themeOpen, setThemeOpen] = useState(false);
  const selectTheme = (mode: ThemeMode) => { switchTheme(mode); setThemeOpen(false); };

  // ─── Font ───────────────────────────────────────────────────────────────────
  const FONT_OPTIONS: { key: FontFamilyId; label: string }[] = [
    { key: 'inter', label: 'Inter' },
    { key: 'raleway', label: 'Raleway' },
    { key: 'worksans', label: 'Work Sans' },
  ];
  const [fontOpen, setFontOpen] = useState(false);
  const selectFont = async (id: FontFamilyId) => {
    dispatch(setFontFamily(id));
    await storage.set(StorageKeys.FONT_FAMILY, id);
    setFontOpen(false);
  };

  // ─── Notifications ──────────────────────────────────────────────────────────
  const toggleNotifications = async (val: boolean) => {
    dispatch(setNotificationsEnabled(val));
    await storage.set(StorageKeys.NOTIFICATIONS_ENABLED, String(val));
  };

  // ─── Nudge Reminders ───────────────────────────────────────────────────────
  const NUDGE_OPTIONS: { key: NudgeFrequency; label: string; desc: string }[] = [
    { key: 'smart',  label: 'Smart',   desc: 'Day 3, 7, 14+ escalating' },
    { key: 'weekly', label: 'Weekly',  desc: 'Remind after 7+ days' },
    { key: 'off',    label: 'Off',     desc: 'No reminders' },
  ];
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [nudgeFreq, setNudgeFreq] = useState<NudgeFrequency>('smart');

  useEffect(() => {
    getNudgeFrequency().then(setNudgeFreq);
  }, []);

  const selectNudge = async (freq: NudgeFrequency) => {
    setNudgeFreq(freq);
    await setNudgeFrequency(freq);
    setNudgeOpen(false);
  };

  // ─── Profile stats (hero card) ─────────────────────────────────────────────
  const [stats, setStats] = useState({ groups: 0, friends: 0, expenses: 0 });
  useEffect(() => {
    if (!currentUser) return;
    // Same scope as the /personal-analytics screen this stat taps through to,
    // so the hero count and the detail view agree.
    Promise.all([groupsDb.findAll(), usersDb.findAllExcept(currentUser.id), expensesDb.findPersonal(currentUser.id)])
      .then(([g, f, e]) => setStats({
        groups: g.length,
        friends: f.length,
        expenses: e.length,
      }))
      .catch(() => {});
  }, [currentUser]);

  // ─── Actions ────────────────────────────────────────────────────────────────
  const handleLogout = () =>
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: signOut },
    ]);

  const handleDeleteAccount = () =>
    Alert.alert('Delete Account', 'This will permanently delete your account and all data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => Alert.alert('Are you absolutely sure?', 'This action is irreversible.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Yes, delete', style: 'destructive', onPress: signOut },
        ]),
      },
    ]);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══ Profile Hero — identity, quick payment chips, stats ═══ */}
        <Animated.View entering={FadeInDown.springify()}>
        <LinearGradient
          colors={[colors.primary + '22', colors.accent + '10', colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.heroCard, { borderColor: colors.border }]}
        >
          <View style={{ alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.push('/profile/edit')} activeOpacity={0.8}>
              <LinearGradient
                colors={[colors.primary, colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.avatarRing}
              >
                <CustomAvatar name={currentUser?.name ?? 'U'} uri={currentUser?.avatarUrl} size={84} />
              </LinearGradient>
              <View style={[s.editBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
                <Ionicons name="pencil" size={11} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <CustomText style={[s.profileName, { fontFamily: font.bold, color: colors.textPrimary }]}>
              {currentUser?.name ?? '—'}
            </CustomText>
            <CustomText variant="caption" color={colors.textMuted}>{currentUser?.email ?? '—'}</CustomText>

            {/* Quick payment chips — tap to change */}
            <View style={s.chipRow}>
              <TouchableOpacity
                style={[s.heroChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { Haptics.selectionAsync(); setCurrencySearch(''); setCurrencyModalOpen(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="cash-outline" size={13} color={colors.primary} />
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textPrimary, marginLeft: 5 }}>
                  {currencySymbol} {currentUser?.defaultCurrency ?? 'USD'}
                </CustomText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.heroChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => { Haptics.selectionAsync(); openWalletModal(); }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={currentUser?.walletAddress ? 'wallet' : 'wallet-outline'}
                  size={13}
                  color={currentUser?.walletAddress ? colors.success : colors.primary}
                />
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textPrimary, marginLeft: 5 }}>
                  {currentUser?.walletAddress
                    ? `${shortAddr(currentUser.walletAddress)} · ${resolveStablecoin(currentUser.walletChainId ?? DEFAULT_CHAIN.id, currentUser.walletToken)}`
                    : 'Add crypto wallet'}
                </CustomText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats — each taps through to its screen */}
          <View style={[s.statsRow, { borderTopColor: colors.border + '80' }]}>
            {([
              ['Groups', stats.groups, () => router.push('/(tabs)/groups')],
              ['Friends', stats.friends, () => router.push('/(tabs)/friends')],
              ['Expenses', stats.expenses, () => router.push('/personal-analytics')],
            ] as [string, number, () => void][]).map(([lbl, n, go], i) => (
              <TouchableOpacity
                key={lbl}
                onPress={() => { Haptics.selectionAsync(); go(); }}
                activeOpacity={0.6}
                style={[s.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border + '80' }]}
              >
                <CustomText style={[{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary }, { fontVariant: ['tabular-nums'] as ('tabular-nums')[] }]}>
                  {n}
                </CustomText>
                <CustomText style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{lbl}</CustomText>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>
        </Animated.View>

        {/* ═══ Preferences Section ═══ */}
        <SectionTitle icon="settings-outline" label="Preferences" />
        <Animated.View entering={FadeInDown.delay(80).springify()} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Theme */}
          <TouchableOpacity style={s.settingRow} onPress={() => setThemeOpen(true)} activeOpacity={0.7}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: '#6366F1' + '18' }]}>
                <Ionicons name={THEME_OPTIONS.find((t) => t.key === themeMode)?.icon ?? 'phone-portrait-outline'} size={18} color="#6366F1" />
              </View>
              <CustomText style={[s.settingLabel, { fontFamily: font.regular, color: colors.textPrimary }]}>App Theme</CustomText>
            </View>
            <View style={s.settingRight}>
              <CustomText style={{ fontSize: 13, color: colors.textMuted, fontFamily: font.regular }}>
                {THEME_OPTIONS.find((t) => t.key === themeMode)?.label}
              </CustomText>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Font */}
          <TouchableOpacity style={s.settingRow} onPress={() => setFontOpen(true)} activeOpacity={0.7}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: '#EC4899' + '18' }]}>
                <Ionicons name="text-outline" size={18} color="#EC4899" />
              </View>
              <CustomText style={[s.settingLabel, { fontFamily: font.regular, color: colors.textPrimary }]}>Font Family</CustomText>
            </View>
            <View style={s.settingRight}>
              <CustomText style={{ fontSize: 13, color: colors.textMuted, fontFamily: FONT_FAMILIES[fontFamilyId].family.regular }}>
                {FONT_FAMILIES[fontFamilyId].label}
              </CustomText>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Notifications */}
          <TouchableOpacity
            style={s.settingRow}
            onPress={() => toggleNotifications(!notificationsEnabled)}
            activeOpacity={0.7}
          >
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: '#F59E0B' + '18' }]}>
                <Ionicons name={notificationsEnabled ? 'notifications' : 'notifications-off-outline'} size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <CustomText style={[s.settingLabel, { fontFamily: font.regular, color: colors.textPrimary }]}>Notifications</CustomText>
                <CustomText style={{ fontSize: 12, color: colors.textMuted, fontFamily: font.regular, marginTop: 2 }}>
                  {notificationsEnabled ? 'You\'ll receive expense & payment alerts' : 'Notifications are disabled'}
                </CustomText>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: colors.border, true: '#F59E0B' + '60' }}
              thumbColor={notificationsEnabled ? '#F59E0B' : colors.textMuted}
              style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
            />
          </TouchableOpacity>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Payment Reminders / Nudges */}
          <TouchableOpacity style={s.settingRow} onPress={() => setNudgeOpen(true)} activeOpacity={0.7}>
            <View style={s.settingLeft}>
              <View style={[s.settingIcon, { backgroundColor: '#EF4444' + '18' }]}>
                <Ionicons name="alarm-outline" size={18} color="#EF4444" />
              </View>
              <CustomText style={[s.settingLabel, { fontFamily: font.regular, color: colors.textPrimary }]}>Payment Reminders</CustomText>
            </View>
            <View style={s.settingRight}>
              <CustomText style={{ fontSize: 13, color: colors.textMuted, fontFamily: font.regular }}>
                {NUDGE_OPTIONS.find((n) => n.key === nudgeFreq)?.label}
              </CustomText>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* ═══ Data ═══ */}
        <SectionTitle icon="server-outline" label="Data" />
        <Animated.View entering={FadeInDown.delay(140).springify()} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingLink icon="download-outline" iconBg="#8B5CF6" label="Export Data" onPress={handleExportCSV} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <SettingLink icon="trash-bin-outline" iconBg="#F59E0B" label="Deleted Expenses" onPress={() => { loadDeleted(); setTrashOpen(true); }} />
        </Animated.View>

        {/* ═══ About ═══ */}
        <SectionTitle icon="information-circle-outline" label="About" />
        <Animated.View entering={FadeInDown.delay(200).springify()} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingLink icon="shield-checkmark-outline" iconBg="#06B6D4" label="Privacy Policy" onPress={() => router.push('/privacy')} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <SettingLink icon="help-circle-outline" iconBg="#10B981" label="Help & FAQ" onPress={() => router.push('/help')} />
        </Animated.View>

        {/* ═══ Account ═══ */}
        <SectionTitle icon="person-outline" label="Account" />
        <Animated.View entering={FadeInDown.delay(260).springify()} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingLink icon="key-outline" iconBg="#14B8A6" label="Change Password" onPress={() => router.push('/(auth)/forgot-password')} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <SettingLink icon="log-out-outline" iconBg="#DC2626" label="Log Out" onPress={handleLogout} />
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <SettingLink icon="trash-outline" iconBg="#DC2626" label="Delete Account" danger onPress={handleDeleteAccount} />
        </Animated.View>

        {/* ═══ App Info ═══ */}
        <View style={s.appInfo}>
          <Image
            source={require('../../assets/LOGO/dollar origami real.png')}
            style={s.appLogo}
            resizeMode="contain"
          />
          <CustomText style={{ fontFamily: font.bold, fontSize: 17, color: colors.textPrimary, marginTop: Spacing.sm, letterSpacing: 0.3 }}>
            Evenly
          </CustomText>
          <CustomText style={{ fontSize: 12, color: colors.textMuted, fontFamily: font.regular, marginTop: 2 }}>
            Split fairly, settle easily
          </CustomText>
          <View style={[s.versionChip, { backgroundColor: colors.primary + '12' }]}>
            <CustomText style={{ fontSize: 11, color: colors.primary, fontFamily: font.semiBold }}>
              v{Constants.expoConfig?.version ?? '1.0.0'}
            </CustomText>
          </View>
        </View>

      </ScrollView>

      {/* Theme picker — bottom sheet, no scrolling needed */}
      <PickerSheet
        visible={themeOpen}
        title="App Theme"
        options={THEME_OPTIONS}
        selectedKey={themeMode}
        onSelect={selectTheme}
        onClose={() => setThemeOpen(false)}
        renderRow={(opt, active) => (
          <>
            <Ionicons name={opt.icon} size={18} color={active ? colors.primary : colors.textMuted} />
            <CustomText style={{
              fontFamily: active ? font.semiBold : font.regular,
              fontSize: 14, color: active ? colors.primary : colors.textPrimary, marginLeft: Spacing.md, flex: 1,
            }}>{opt.label}</CustomText>
          </>
        )}
      />

      {/* Font picker — options previewed in their own typeface */}
      <PickerSheet
        visible={fontOpen}
        title="Font Family"
        options={FONT_OPTIONS}
        selectedKey={fontFamilyId}
        onSelect={selectFont}
        onClose={() => setFontOpen(false)}
        renderRow={(opt, active) => (
          <View style={{ flex: 1 }}>
            <CustomText style={{
              fontFamily: FONT_FAMILIES[opt.key].family.semiBold,
              fontSize: 15, color: active ? colors.primary : colors.textPrimary,
            }}>{opt.label}</CustomText>
            <CustomText style={{
              fontFamily: FONT_FAMILIES[opt.key].family.regular,
              fontSize: 12, color: colors.textMuted, marginTop: 2,
            }}>Split fairly, settle easily · 1234567890</CustomText>
          </View>
        )}
      />

      {/* Payment reminders picker */}
      <PickerSheet
        visible={nudgeOpen}
        title="Payment Reminders"
        options={NUDGE_OPTIONS}
        selectedKey={nudgeFreq}
        onSelect={selectNudge}
        onClose={() => setNudgeOpen(false)}
        renderRow={(opt, active) => (
          <View style={{ flex: 1 }}>
            <CustomText style={{
              fontFamily: active ? font.semiBold : font.regular,
              fontSize: 14, color: active ? colors.primary : colors.textPrimary,
            }}>{opt.label}</CustomText>
            <CustomText style={{ fontSize: 12, color: colors.textMuted, fontFamily: font.regular, marginTop: 2 }}>
              {opt.desc}
            </CustomText>
          </View>
        )}
      />

      <Modal visible={currencyModalOpen} animationType="slide" transparent onRequestClose={() => setCurrencyModalOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCurrencyModalOpen(false)} />
          <View style={[s.modalContent, { backgroundColor: colors.background }]}>
            <View style={s.modalHeader}>
              <CustomText variant="heading3">Select Currency</CustomText>
              <TouchableOpacity onPress={() => setCurrencyModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={[s.searchInput, { fontFamily: font.regular, color: colors.textPrimary }]}
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
              renderItem={({ item }) => {
                const active = currentUser?.defaultCurrency === item.code;
                return (
                  <TouchableOpacity
                    style={[s.currencyRow, active && { backgroundColor: colors.primary + '15' }]}
                    onPress={() => selectCurrency(item.code)}
                    activeOpacity={0.7}
                    disabled={currencySaving}
                  >
                    <View style={[s.currencyBadge, { backgroundColor: active ? colors.primary : colors.surface }]}>
                      <CustomText style={{ fontSize: 16, fontFamily: font.bold, color: active ? '#fff' : colors.textPrimary }}>
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
                    {currencySaving && active
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={[s.divider, { backgroundColor: colors.border, marginLeft: 60 }]} />}
            />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Crypto Receiving Address Modal */}
      <Modal visible={walletModalOpen} animationType="slide" transparent onRequestClose={() => setWalletModalOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setWalletModalOpen(false)} />
          <View style={[s.modalContent, { backgroundColor: colors.background, paddingBottom: Spacing.lg }]}>
            <View style={s.modalHeader}>
              <CustomText variant="heading3">Receiving Address</CustomText>
              <TouchableOpacity onPress={() => setWalletModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: Spacing.base }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <CustomText style={{ fontSize: 13, color: colors.textMuted, marginBottom: Spacing.md }}>
              Where friends send you crypto payments. You&apos;ll receive{' '}
              <CustomText style={{ color: colors.textSecondary }}>{walletTokenDraft}</CustomText>{' '}
              on {chainName(walletChainDraft)} — the stablecoin amount matches what you&apos;re owed, separate from your app currency ({currentUser?.defaultCurrency ?? 'USD'}). Double-check before saving.
            </CustomText>

            {/* Chain (network) selector */}
            <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Network</CustomText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base }}>
              {SUPPORTED_CHAINS.map((chain) => {
                const selected = walletChainDraft === chain.id;
                return (
                  <TouchableOpacity
                    key={chain.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
                      borderRadius: BorderRadius.full, borderWidth: 1.5,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : colors.surface,
                    }}
                    onPress={() => selectWalletChain(chain.id)}
                    activeOpacity={0.7}
                  >
                    <ChainLogo logo={chain.logo} size={16} mono={selected ? '#fff' : undefined} />
                    <CustomText style={{ fontSize: 13, marginLeft: 6, color: selected ? '#fff' : colors.textPrimary }}>
                      {chain.name}
                    </CustomText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Receiving currency (stablecoin) selector */}
            <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Receiving currency</CustomText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base }}>
              {chainStablecoins(walletChainDraft).map((token) => {
                const selected = walletTokenDraft === token;
                return (
                  <TouchableOpacity
                    key={token}
                    style={{
                      paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
                      borderRadius: BorderRadius.full, borderWidth: 1.5,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : colors.surface,
                    }}
                    onPress={() => setWalletTokenDraft(token)}
                    activeOpacity={0.7}
                  >
                    <CustomText style={{ fontSize: 13, fontFamily: font.semiBold, color: selected ? '#fff' : colors.textPrimary }}>
                      {token}
                    </CustomText>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Address input */}
            <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Wallet address</CustomText>
            <View style={[s.searchBox, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: 0 }]}>
              <TextInput
                style={[s.searchInput, { fontFamily: font.regular, color: colors.textPrimary }]}
                placeholder={addressPlaceholder(walletChainDraft)}
                placeholderTextColor={colors.textMuted}
                value={walletDraft}
                onChangeText={setWalletDraft}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* QR of the address — friends scan this with their wallet app to pay */}
            {isValidAddressForChain(walletChainDraft, walletDraft.trim()) && (
              <View style={{ alignItems: 'center', marginTop: Spacing.base }}>
                <View style={s.qrBox}>
                  <QRCode value={walletQrValue(walletChainDraft, walletDraft)} size={130} backgroundColor="#FFFFFF" color="#000000" />
                </View>
                <CustomText style={{ fontSize: 11, color: colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' }}>
                  Friends can scan this with their wallet app to pay you.
                </CustomText>
              </View>
            )}

            <CustomButton
              title={currentUser?.walletAddress ? 'Update address' : 'Add address'}
              onPress={saveWallet}
              loading={walletSaving}
              fullWidth
              style={{ marginTop: Spacing.base, marginBottom: Spacing.base }}
            />
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Deleted Expenses Modal */}
      <Modal visible={trashOpen} animationType="slide" transparent onRequestClose={() => setTrashOpen(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTrashOpen(false)} />
          <View style={[s.modalContent, { backgroundColor: colors.background }]}>
            <View style={s.modalHeader}>
              <CustomText variant="heading3">Deleted Expenses</CustomText>
              <TouchableOpacity onPress={() => setTrashOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {deletedExpenses.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: Spacing['3xl'] }}>
                <Ionicons name="checkmark-circle-outline" size={40} color={colors.textMuted} />
                <CustomText color={colors.textMuted} style={{ marginTop: Spacing.sm, fontSize: 14 }}>No deleted expenses</CustomText>
              </View>
            ) : (
              <FlatList
                data={deletedExpenses}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>{item.description}</CustomText>
                      <CustomText variant="caption" color={colors.textMuted}>
                        {formatCurrency(item.totalAmount, item.currency)} · {formatDate(item.date)}
                      </CustomText>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRestore(item.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.success + '15', borderRadius: BorderRadius.md }}
                    >
                      <Ionicons name="refresh" size={14} color={Colors.success} />
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: Colors.success, marginLeft: 4 }}>Restore</CustomText>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionTitle({ icon, label }: { icon: IoniconName; label: string }) {
  const colors = useColors();
  const font = useFont();
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
      <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, marginLeft: 6, letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </CustomText>
    </View>
  );
}

function SettingLink({ icon, iconBg, label, value, onPress, danger }: {
  icon: IoniconName; iconBg: string; label: string; value?: string; onPress: () => void; danger?: boolean;
}) {
  const colors = useColors();
  const font = useFont();
  return (
    <TouchableOpacity style={s.settingRow} onPress={onPress} activeOpacity={0.7}>
      <View style={s.settingLeft}>
        <View style={[s.settingIcon, { backgroundColor: iconBg + '18' }]}>
          <Ionicons name={icon} size={18} color={iconBg} />
        </View>
        <CustomText style={[s.settingLabel, {
          fontFamily: danger ? font.semiBold : font.regular,
          color: danger ? Colors.danger : colors.textPrimary,
        }]}>{label}</CustomText>
      </View>
      <View style={s.settingRight}>
        {value ? (
          <CustomText
            numberOfLines={1}
            style={{ fontSize: 13, color: colors.textMuted, fontFamily: font.regular, marginRight: 4, flexShrink: 1, maxWidth: 180 }}
          >
            {value}
          </CustomText>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 100 },

  // Profile header
  heroCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  profileName: { fontSize: 22, marginTop: Spacing.md },
  avatarRing: { padding: 3, borderRadius: 48 },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  heroChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: BorderRadius.full, borderWidth: 1,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    borderTopWidth: 1,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },

  // Cards
  card: {
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, gap: Spacing.md,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  changeBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base + 4,
    paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
  },

  // Setting rows
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: 14,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  settingIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
  },
  settingLabel: { fontSize: 15 },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Divider
  divider: { height: 1, marginLeft: Spacing.base + 34 + Spacing.md },

  // Dropdown
  // App info
  appInfo: {
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
  },
  appLogo: { width: 44, height: 44 },
  versionChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },

  // Currency modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 20 },
  qrBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
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
  currencyBadge: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});
