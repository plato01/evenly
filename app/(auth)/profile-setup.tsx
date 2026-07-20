import React, { useState } from 'react';
import {
  View, StyleSheet,
  TouchableOpacity, Pressable, Alert, Modal, FlatList,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { CURRENCIES } from '../../constants/currencies';
import { useAuth } from '../../hooks/useAuth';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { AvatarGlyph } from '../../components/ui/AvatarGlyph';
import { SUPPORTED_CHAINS, DEFAULT_CHAIN, isValidAddressForChain, addressPlaceholder, addressFormatHint, chainName, chainStablecoins, resolveStablecoin, type StableSymbol } from '../../web3/chains';
import { ChainLogo } from '../../web3/ChainLogo';

/** 16 seed variations offered in the avatar picker grid */
const GLYPH_CHOICES = Array.from({ length: 16 }, (_, i) => i);

export default function ProfileSetupScreen() {
  const colors = useColors();
  const font = useFont();
  const { currentUser, editProfile, isLoading } = useAuth();

  const [name, setName]             = useState(currentUser?.name ?? '');
  const [avatarUri, setAvatarUri]   = useState<string | null>(currentUser?.avatarUrl ?? null);
  const [currency, setCurrency]     = useState(currentUser?.defaultCurrency ?? 'USD');
  const [walletAddress, setWalletAddress] = useState(currentUser?.walletAddress ?? '');
  const [walletChainId, setWalletChainId] = useState<number>(currentUser?.walletChainId ?? DEFAULT_CHAIN.id);
  const [walletToken, setWalletToken] = useState<StableSymbol>(resolveStablecoin(currentUser?.walletChainId ?? DEFAULT_CHAIN.id, currentUser?.walletToken));
  const [walletError, setWalletError] = useState('');

  // Switching networks may drop an unsupported stablecoin — keep it valid.
  const selectWalletChain = (chainId: number) => {
    setWalletChainId(chainId);
    setWalletToken((t) => resolveStablecoin(chainId, t));
  };
  const [nameError, setNameError]   = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  // ─── Avatar Picker ────────────────────────────────────────────────────────
  const glyphBase = name || currentUser?.email || 'user';

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo access to set a profile picture.');
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

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { setNameError('Please enter your display name.'); return; }
    setNameError('');
    const addr = walletAddress.trim();
    if (addr && !isValidAddressForChain(walletChainId, addr)) {
      setWalletError(`Enter ${addressFormatHint(walletChainId)}.`);
      return;
    }
    setWalletError('');
    await editProfile({
      name:            name.trim(),
      avatarUrl:       avatarUri ?? undefined,
      defaultCurrency: currency,
      walletAddress:   addr || undefined,
      walletChainId:   addr ? walletChainId : undefined,
      walletToken:     addr ? walletToken : undefined,
    });
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <CustomText variant="heading2" style={{ marginBottom: Spacing.xs }}>Set up your profile</CustomText>
          <CustomText variant="body" color={colors.textMuted} style={{ marginBottom: Spacing['2xl'] }}>
            Personalise your account before you start splitting
          </CustomText>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={() => setAvatarPickerOpen(true)} activeOpacity={0.8}>
              <CustomAvatar name={name || currentUser?.email || 'user'} uri={avatarUri} size={96} />
              <View style={[styles.cameraBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="color-palette-outline" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: Spacing.sm }}>
              Tap to choose an avatar
            </CustomText>
          </View>

          {/* Avatar Picker Modal */}
          <Modal visible={avatarPickerOpen} animationType="slide" transparent onRequestClose={() => setAvatarPickerOpen(false)}>
            <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setAvatarPickerOpen(false)} />
              <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
                <View style={styles.modalHeader}>
                  <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary }}>
                    Choose Avatar
                  </CustomText>
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
                      style={[styles.avatarCell, { alignItems: 'center', justifyContent: 'center' }]}
                    >
                      <AvatarGlyph name={`${glyphBase}#${item}`} size={64} />
                    </TouchableOpacity>
                  )}
                />

                {/* Upload from gallery option */}
                <TouchableOpacity
                  onPress={() => { setAvatarPickerOpen(false); pickAvatar(); }}
                  activeOpacity={0.7}
                  style={[styles.uploadBtn, { borderColor: colors.border }]}
                >
                  <Ionicons name="image-outline" size={18} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.primary, marginLeft: Spacing.sm }}>
                    Upload from Gallery
                  </CustomText>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Display name */}
          <CustomTextInput
            label="Display Name"
            value={name}
            onChangeText={(t) => { setName(t); setNameError(''); }}
            placeholder="Your name"
            autoCapitalize="words"
            error={nameError}
          />

          {/* Currency */}
          <CustomText variant="label" style={styles.currencyLabel}>Default Currency</CustomText>
          <View style={styles.currencyGrid}>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={[styles.currencyChip, { borderColor: currency === c.code ? colors.primary : colors.border, backgroundColor: currency === c.code ? colors.primary : colors.surface }]}
                onPress={() => setCurrency(c.code)}
                activeOpacity={0.7}
              >
                <CustomText
                  style={[styles.currencySymbol, { fontFamily: font.semiBold, color: currency === c.code ? Colors.white : colors.textPrimary }]}
                >
                  {c.symbol}
                </CustomText>
                <CustomText
                  style={[styles.currencyCode, { fontFamily: font.medium, color: currency === c.code ? Colors.white : colors.textSecondary }]}
                >
                  {c.code}
                </CustomText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Crypto receiving address (optional) */}
          <CustomText variant="label" style={styles.currencyLabel}>
            Receive crypto payments (optional)
          </CustomText>
          <CustomText style={{ fontSize: 12, color: colors.textMuted, marginBottom: Spacing.sm }}>
            Add a wallet address so friends can pay you back in crypto. You'll receive{' '}
            <CustomText style={{ color: colors.textSecondary }}>{walletToken}</CustomText> on {chainName(walletChainId)} — separate from your app currency ({currency}).
          </CustomText>

          {/* Network selector */}
          <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.textMuted, marginBottom: Spacing.xs }}>Network</CustomText>
          <View style={styles.chainRow}>
            {SUPPORTED_CHAINS.map((chain) => {
              const selected = walletChainId === chain.id;
              return (
                <TouchableOpacity
                  key={chain.id}
                  style={[styles.chainChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
                  onPress={() => selectWalletChain(chain.id)}
                  activeOpacity={0.7}
                >
                  <ChainLogo logo={chain.logo} size={16} mono={selected ? Colors.white : undefined} />
                  <CustomText style={{ fontFamily: font.medium, fontSize: 13, marginLeft: 6, color: selected ? Colors.white : colors.textPrimary }}>
                    {chain.name}
                  </CustomText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Receiving currency (stablecoin) selector */}
          <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.textMuted, marginTop: Spacing.sm, marginBottom: Spacing.xs }}>Receiving currency</CustomText>
          <View style={styles.chainRow}>
            {chainStablecoins(walletChainId).map((token) => {
              const selected = walletToken === token;
              return (
                <TouchableOpacity
                  key={token}
                  style={[styles.chainChip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface }]}
                  onPress={() => setWalletToken(token)}
                  activeOpacity={0.7}
                >
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: selected ? Colors.white : colors.textPrimary }}>
                    {token}
                  </CustomText>
                </TouchableOpacity>
              );
            })}
          </View>

          <CustomTextInput
            label="Receiving wallet address"
            value={walletAddress}
            onChangeText={(t) => { setWalletAddress(t); setWalletError(''); }}
            placeholder={addressPlaceholder(walletChainId)}
            autoCapitalize="none"
            autoCorrect={false}
            error={walletError}
            containerStyle={{ marginTop: Spacing.sm }}
          />

          <CustomButton
            title="Let's go →"
            onPress={handleSave}
            loading={isLoading}
            fullWidth
            style={{ marginTop: Spacing['2xl'] }}
          />

          {/* Skip */}
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.skipRow}>
            <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textMuted }}>
              Skip for now
            </CustomText>
          </TouchableOpacity>

      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing['4xl'] },

  avatarSection:   { alignItems: 'center', marginBottom: Spacing['2xl'] },
  avatarImg:       { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15, shadowRadius: 3, elevation: 3,
  },

  currencyLabel: { marginBottom: Spacing.sm },
  currencyGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  currencyChip:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  currencySymbol: { fontSize: 13 },
  currencyCode:   { fontSize: 12 },
  chainRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chainChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1.5,
  },

  skipRow: { alignItems: 'center', marginTop: Spacing.lg },

  // Avatar picker modal
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  avatarCell: {
    flex: 1, maxWidth: '23%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  avatarThumb: {
    width: '100%', height: '100%',
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1, marginBottom: Spacing.xl,
  },
});
