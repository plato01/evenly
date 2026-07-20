import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator,
  FlatList, Modal, TextInput, Dimensions, Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import MlkitOcr from 'react-native-mlkit-ocr';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { CustomAmountInput } from '../../components/ui/CustomAmountInput';
import { MemberChip } from '../../components/features/MemberChip';
import { CategoryPickerModal } from '../../components/features/CategoryPickerModal';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { getCategoryConfig } from '../../constants/categories';
import { useFont } from '../../hooks/useFont';
import { ExpenseCategory, Group, User, GroupMember } from '../../types';
import { useExpenses } from '../../hooks/useExpenses';
import { useGroups } from '../../hooks/useGroups';
import { useAppSelector } from '../../store';
import { selectActiveGroups } from '../../store/selectors/groupSelectors';
import { selectAllFriends } from '../../store/selectors/friendSelectors';
import { toISODateString } from '../../utils/dateUtils';
import { parseReceiptText, OcrResult } from '../../utils/ocrParser';
import { parseReceiptItems, ReceiptItem } from '../../utils/receiptItemParser';
import { formatCurrency } from '../../utils/currency';
import { CustomAvatar } from '../../components/ui/CustomAvatar';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type Step = 'capture' | 'details' | 'confirm' | 'items' | 'summary';
type SplitWith = 'group' | 'friends';

export default function ScanBillScreen() {
  const colors = useColors();
  const font = useFont();
  const { addNewExpense } = useExpenses();
  const { loadMembers } = useGroups();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const groups = useAppSelector(selectActiveGroups);
  const friends = useAppSelector(selectAllFriends);

  const [step, setStep]               = useState<Step>('capture');
  const [imageUri, setImageUri]       = useState<string | null>(null);
  const [amount, setAmount]           = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory]       = useState<ExpenseCategory>('food');
  const [loading, setLoading]         = useState(false);
  const [scanning, setScanning]       = useState(false);
  const [error, setError]             = useState('');
  const [ocrResult, setOcrResult]     = useState<OcrResult | null>(null);

  // Item split state
  const [receiptItems, setReceiptItems]   = useState<ReceiptItem[]>([]);
  const [detectedTax, setDetectedTax]     = useState<number>(0);
  const [tipPercent, setTipPercent]       = useState<number>(0);
  const [taxPercent, setTaxPercent]       = useState<number>(0);
  const [ocrLines, setOcrLines]           = useState<string[]>([]);


  // Camera state
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn]           = useState(false);
  const [capturing, setCapturing]       = useState(false);

  // Group & friend selection
  const [splitWith, setSplitWith]             = useState<SplitWith>('group');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupMembers, setGroupMembers]       = useState<GroupMember[]>([]);
  const [pickerVisible, setPickerVisible]     = useState(false);
  const [pickerSearch, setPickerSearch]       = useState('');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  useEffect(() => {
    if (selectedGroupId) {
      loadMembers(selectedGroupId).then(setGroupMembers);
    } else {
      setGroupMembers([]);
    }
  }, [selectedGroupId, loadMembers]);

  const handleSelectGroup = useCallback((gId: string) => {
    setSelectedGroupId(gId);
    setSelectedFriendIds([]);
    setPickerVisible(false);
    setPickerSearch('');
  }, []);

  const handleToggleFriend = useCallback((fId: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(fId) ? prev.filter((id) => id !== fId) : [...prev, fId],
    );
    setSelectedGroupId(null);
  }, []);

  const handleRemoveFriend = useCallback((fId: string) => {
    setSelectedFriendIds((prev) => prev.filter((id) => id !== fId));
  }, []);

  const selectionSummary = useMemo(() => {
    if (selectedGroupId) {
      const g = groups.find((gr) => gr.id === selectedGroupId);
      return g ? `${g.name}` : 'Group';
    }
    if (selectedFriendIds.length > 0) {
      const names = selectedFriendIds
        .map((fId) => friends.find((f) => f.id === fId)?.name)
        .filter(Boolean);
      if (names.length <= 2) return `You & ${names.join(', ')}`;
      return `You & ${names.length} friends`;
    }
    return '';
  }, [selectedGroupId, selectedFriendIds, groups, friends]);

  const getItemParticipants = (): { id: string; name: string; avatarUrl?: string }[] => {
    if (!currentUser) return [];
    const me = { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl };
    if (selectedGroupId && groupMembers.length > 0) {
      return [me, ...groupMembers.filter((m) => m.userId !== currentUser.id).map((m) => ({
        id: m.userId, name: m.user?.name ?? 'Unknown', avatarUrl: m.user?.avatarUrl,
      }))];
    }
    if (selectedFriendIds.length > 0) {
      return [me, ...selectedFriendIds.map((fId) => {
        const f = friends.find((fr) => fr.id === fId);
        return { id: fId, name: f?.name ?? 'Friend', avatarUrl: f?.avatarUrl };
      })];
    }
    return [me];
  };

  const getMemberIds = (): string[] => {
    if (!currentUser) return [];
    if (selectedGroupId && groupMembers.length > 0) {
      return groupMembers.map((m) => m.userId);
    }
    if (selectedFriendIds.length > 0) {
      const ids = new Set([currentUser.id, ...selectedFriendIds]);
      return Array.from(ids);
    }
    return [currentUser.id];
  };

  const filteredGroups = useMemo(() => {
    if (!pickerSearch.trim()) return groups;
    const q = pickerSearch.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, pickerSearch]);

  const filteredFriends = useMemo(() => {
    if (!pickerSearch.trim()) return friends;
    const q = pickerSearch.toLowerCase();
    return friends.filter((f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q));
  }, [friends, pickerSearch]);

  // ── Image preprocessing + OCR ──
  const processImage = async (uri: string) => {
    setScanning(true);
    try {
      // Enhance image for better OCR: resize to a clear width, use PNG to avoid
      // JPEG compression artifacts that degrade character recognition.
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 1.0, format: ImageManipulator.SaveFormat.PNG },
      );
      setImageUri(manipulated.uri);

      // Run OCR — extract individual lines from blocks, not block-level text.
      // ML Kit groups multiple receipt lines into blocks; using block.text
      // merges "Item $12.99\nTax $1.00" into one string the parser can't split.
      const result = await MlkitOcr.detectFromUri(manipulated.uri);
      const lines: string[] = [];
      for (const block of result) {
        if (block.lines && Array.isArray(block.lines)) {
          for (const line of block.lines) {
            if (line.text && line.text.trim()) lines.push(line.text.trim());
          }
        } else if (block.text) {
          // Fallback: split block text by newlines
          const parts = block.text.split(/\r?\n/);
          for (const p of parts) {
            if (p.trim()) lines.push(p.trim());
          }
        }
      }
      setOcrLines(lines);
      const parsed = parseReceiptText(lines);
      setOcrResult(parsed);

      if (parsed.amount) setAmount(parsed.amount);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.category && parsed.category !== 'other') setCategory(parsed.category);

      // Warn if OCR found no usable data
      if (!parsed.amount && lines.length > 0) {
        setError('Receipt scanned but no total found. Please enter the amount manually.');
      } else if (lines.length === 0) {
        setError('No text detected. Try a clearer, well-lit photo of the receipt.');
      }
    } catch (err) {
      console.warn('OCR failed:', err);
      setError('Could not read the receipt. Please enter details manually or try a clearer photo.');
    } finally {
      setScanning(false);
    }
  };

  // ── Camera capture ──
  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setStep('details');
        processImage(photo.uri);
      }
    } catch (err) {
      Alert.alert('Capture failed', 'Could not take photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  // ── Gallery pick ──
  const pickFromGallery = async () => {
    const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission needed', 'Please allow gallery access to select receipt images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      mediaTypes: ['images'],
    });
    if (!result.canceled && result.assets[0]) {
      setStep('details');
      processImage(result.assets[0].uri);
    }
  };

  const handleConfirm = async () => {
    const total = parseFloat(amount);
    if (!total || total <= 0) { setError('Enter a valid amount.'); return; }
    if (!description.trim()) { setError('Add a description.'); return; }
    if (!currentUser) return;

    const memberIds = getMemberIds();
    if (memberIds.length <= 1 && !selectedGroupId) {
      setError('Select a group or at least one friend to split with.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await addNewExpense({
        description: description.trim(),
        totalAmount: total,
        currency: currentUser.defaultCurrency ?? 'USD',
        paidBy: currentUser.id,
        splitType: 'equal',
        category,
        date: toISODateString(),
        memberIds,
        groupId: selectedGroupId ?? undefined,
        createdBy: currentUser.id,
      });
      router.back();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  // ── Picker Modal ──
  const pickerModal = (
    <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <CustomText variant="heading3">Split with</CustomText>
          <TouchableOpacity onPress={() => { setPickerVisible(false); setPickerSearch(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => { setSplitWith('group'); setPickerSearch(''); }}
            style={[styles.tab, splitWith === 'group' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Ionicons name="people" size={18} color={splitWith === 'group' ? colors.primary : colors.textMuted} />
            <CustomText style={{ fontFamily: splitWith === 'group' ? font.semiBold : font.regular, fontSize: 15, color: splitWith === 'group' ? colors.primary : colors.textMuted, marginLeft: 6 }}>
              Groups
            </CustomText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setSplitWith('friends'); setPickerSearch(''); }}
            style={[styles.tab, splitWith === 'friends' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Ionicons name="person" size={18} color={splitWith === 'friends' ? colors.primary : colors.textMuted} />
            <CustomText style={{ fontFamily: splitWith === 'friends' ? font.semiBold : font.regular, fontSize: 15, color: splitWith === 'friends' ? colors.primary : colors.textMuted, marginLeft: 6 }}>
              Friends
            </CustomText>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={pickerSearch}
            onChangeText={setPickerSearch}
            placeholder={splitWith === 'group' ? 'Search groups...' : 'Search friends...'}
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { fontFamily: font.regular, color: colors.textPrimary }]}
            autoCorrect={false}
          />
          {pickerSearch.length > 0 && (
            <TouchableOpacity onPress={() => setPickerSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {splitWith === 'group' && (
          <FlatList
            data={filteredGroups}
            keyExtractor={(g) => g.id}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] }}
            ListEmptyComponent={<CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.xl }}>{groups.length === 0 ? 'No groups yet.' : 'No matching groups.'}</CustomText>}
            renderItem={({ item: g }) => {
              const isActive = selectedGroupId === g.id;
              return (
                <TouchableOpacity onPress={() => handleSelectGroup(g.id)} activeOpacity={0.7} style={[styles.pickerRow, { backgroundColor: isActive ? colors.primaryLight : colors.surface, borderColor: isActive ? colors.primary : colors.border }]}>
                  <View style={[styles.pickerIcon, { backgroundColor: g.color ? g.color + '22' : colors.primary + '18' }]}>
                    <Ionicons name="people" size={20} color={g.color ?? colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>{g.name}</CustomText>
                    <CustomText variant="caption" color={colors.textMuted}>{g.members?.length ?? 0} members</CustomText>
                  </View>
                  {isActive && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {splitWith === 'friends' && (
          <>
            <FlatList
              data={filteredFriends}
              keyExtractor={(f) => f.id}
              contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] }}
              ListEmptyComponent={<CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.xl }}>{friends.length === 0 ? 'No friends yet.' : 'No matching friends.'}</CustomText>}
              renderItem={({ item: f }) => {
                const isSelected = selectedFriendIds.includes(f.id);
                return (
                  <TouchableOpacity onPress={() => handleToggleFriend(f.id)} activeOpacity={0.7} style={[styles.pickerRow, { backgroundColor: isSelected ? colors.primaryLight : colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}>
                    <View style={[styles.pickerIcon, { backgroundColor: colors.primary + '18' }]}>
                      <Ionicons name="person" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>{f.name}</CustomText>
                      <CustomText variant="caption" color={colors.textMuted}>{f.email}</CustomText>
                    </View>
                    <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSelected ? colors.primary : colors.border} />
                  </TouchableOpacity>
                );
              }}
            />
            {selectedFriendIds.length > 0 && (
              <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                <CustomButton title={`Done (${selectedFriendIds.length} selected)`} onPress={() => { setPickerVisible(false); setPickerSearch(''); }} fullWidth />
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );

  // ── Split selector row ──
  const splitSelector = (
    <View style={{ marginBottom: Spacing.base }}>
      <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Split with</CustomText>
      <TouchableOpacity onPress={() => { setPickerVisible(true); setError(''); }} activeOpacity={0.7} style={[styles.selector, { backgroundColor: colors.surface, borderColor: selectionSummary ? colors.primary : colors.border }]}>
        <View style={styles.selectorLeft}>
          <Ionicons name={selectedGroupId ? 'people' : selectedFriendIds.length > 0 ? 'person' : 'add-circle-outline'} size={20} color={selectionSummary ? colors.primary : colors.textMuted} />
          <CustomText style={{ fontFamily: selectionSummary ? font.semiBold : font.regular, fontSize: 15, color: selectionSummary ? colors.textPrimary : colors.textMuted, marginLeft: Spacing.sm }} numberOfLines={1}>
            {selectionSummary || 'Select group or friends'}
          </CustomText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {selectedFriendIds.length > 0 && (
        <View style={[styles.memberList, { marginTop: Spacing.sm }]}>
          {currentUser && <MemberChip name={currentUser.name} avatarUri={currentUser.avatarUrl} isCurrentUser />}
          {selectedFriendIds.map((fId) => {
            const f = friends.find((fr) => fr.id === fId);
            if (!f) return null;
            return <MemberChip key={f.id} name={f.name} avatarUri={f.avatarUrl} onRemove={() => handleRemoveFriend(f.id)} />;
          })}
        </View>
      )}

      {selectedGroupId && groupMembers.length > 0 && (
        <View style={[styles.memberList, { marginTop: Spacing.sm }]}>
          {groupMembers.map((m) => (
            <MemberChip key={m.userId} name={m.user?.name ?? 'Unknown'} avatarUri={m.user?.avatarUrl} isCurrentUser={m.userId === currentUser?.id} />
          ))}
        </View>
      )}
    </View>
  );

  // ═══════════════════════════════════════════════════
  // STEP: CAPTURE — In-app camera with receipt guide
  // ═══════════════════════════════════════════════════
  if (step === 'capture') {
    // Permission not yet determined
    if (!permission) {
      return (
        <SafeAreaView style={[styles.safe, { backgroundColor: '#000' }]}>
          <ActivityIndicator size="large" color="#fff" style={{ flex: 1 }} />
        </SafeAreaView>
      );
    }

    // Permission denied — fallback to gallery only
    if (!permission.granted) {
      return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <CustomText variant="heading3" style={{ marginBottom: Spacing.sm }}>Scan Bill</CustomText>
            <CustomText variant="body" color={colors.textMuted} style={{ marginBottom: Spacing.lg }}>
              Camera access is needed to scan receipts.
            </CustomText>

            <CustomButton title="Grant Camera Permission" onPress={requestPermission} fullWidth />

            <CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginVertical: Spacing.lg }}>
              or
            </CustomText>

            <TouchableOpacity style={[styles.galleryBtn, { borderColor: colors.border }]} onPress={pickFromGallery} activeOpacity={0.7}>
              <Ionicons name="images-outline" size={20} color={colors.primary} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.primary, marginLeft: Spacing.sm }}>
                Choose from Gallery
              </CustomText>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }

    // Permission granted — show in-app camera
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          flash={flashOn ? 'on' : 'off'}
          autofocus="on"
        />

        {/* Dark overlay with receipt cutout */}
        <View style={styles.overlay}>
          {/* Top bar */}
          <SafeAreaView style={styles.cameraTopBar}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 17, color: '#fff' }}>
              Scan Receipt
            </CustomText>
            <TouchableOpacity onPress={() => setFlashOn((f) => !f)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name={flashOn ? 'flash' : 'flash-off'} size={24} color={flashOn ? '#FFD700' : '#fff'} />
            </TouchableOpacity>
          </SafeAreaView>

          {/* Receipt guide frame */}
          <View style={styles.guideContainer}>
            <View style={styles.guideFrame}>
              {/* Corner markers */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <CustomText style={styles.guideText}>
              Position receipt within the frame
            </CustomText>
          </View>

          {/* Bottom controls */}
          <View style={styles.cameraBottomBar}>
            <TouchableOpacity onPress={pickFromGallery} style={styles.cameraSecondaryBtn}>
              <Ionicons name="images-outline" size={24} color="#fff" />
              <CustomText style={{ fontFamily: font.medium, fontSize: 11, color: '#fff', marginTop: 4 }}>Gallery</CustomText>
            </TouchableOpacity>

            {/* Shutter button */}
            <TouchableOpacity onPress={handleCapture} disabled={capturing} activeOpacity={0.7} style={styles.shutterOuter}>
              <View style={[styles.shutterInner, capturing && { backgroundColor: '#ccc' }]} />
            </TouchableOpacity>

            <View style={styles.cameraSecondaryBtn} />
          </View>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════
  // STEP: DETAILS
  // ═══════════════════════════════════════════════════
  if (step === 'details') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <CustomText variant="heading3" style={{ marginBottom: Spacing.md }}>Bill Details</CustomText>

          {imageUri && (
            <View style={[styles.previewBox, { borderColor: colors.border }]}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
              <TouchableOpacity style={[styles.retakeBtn, { backgroundColor: colors.surface }]} onPress={() => { setImageUri(null); setAmount(''); setDescription(''); setOcrResult(null); setStep('capture'); }}>
                <Ionicons name="camera-outline" size={16} color={colors.primary} />
                <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.primary, marginLeft: 4 }}>Retake</CustomText>
              </TouchableOpacity>
            </View>
          )}

          {/* OCR status */}
          {scanning && (
            <View style={styles.scanningRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.primary, marginLeft: Spacing.sm }}>
                Reading receipt...
              </CustomText>
            </View>
          )}

          {/* OCR confidence badge */}
          {!scanning && ocrResult && (
            <View style={[styles.confidenceBadge, { backgroundColor: ocrResult.confidence === 'high' ? '#16A34A18' : ocrResult.confidence === 'medium' ? '#EAB30818' : '#DC262618' }]}>
              <Ionicons
                name={ocrResult.confidence === 'high' ? 'checkmark-circle' : ocrResult.confidence === 'medium' ? 'alert-circle' : 'help-circle'}
                size={16}
                color={ocrResult.confidence === 'high' ? '#16A34A' : ocrResult.confidence === 'medium' ? '#EAB308' : '#DC2626'}
              />
              <CustomText style={{ fontFamily: font.medium, fontSize: 12, marginLeft: 6, color: ocrResult.confidence === 'high' ? '#16A34A' : ocrResult.confidence === 'medium' ? '#EAB308' : '#DC2626' }}>
                {ocrResult.confidence === 'high' ? 'Total detected with high confidence' : ocrResult.confidence === 'medium' ? 'Total detected — please verify' : 'Could not detect total — enter manually'}
              </CustomText>
            </View>
          )}

          <CustomText variant="label" style={{ marginBottom: Spacing.xs, marginTop: Spacing.md }}>Total Amount</CustomText>
          <View style={styles.amountRow}>
            <CustomAmountInput value={amount} onChangeText={(v) => { setAmount(v); setError(''); }} currency={currentUser?.defaultCurrency} />
          </View>

          <CustomTextInput label="Description" value={description} onChangeText={(t) => { setDescription(t); setError(''); }} placeholder="e.g. Grocery run at Walmart" />

          <CustomText variant="label" style={{ marginVertical: Spacing.sm }}>Category</CustomText>
          <TouchableOpacity onPress={() => setCategoryPickerVisible(true)} activeOpacity={0.7} style={[styles.selector, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
            <View style={styles.selectorLeft}>
              <View style={[styles.catDot, { backgroundColor: getCategoryConfig(category).color }]} />
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}>
                {getCategoryConfig(category).label}
              </CustomText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {splitSelector}

          {error ? <CustomText variant="caption" color={Colors.danger} style={styles.errorText}>{error}</CustomText> : null}
        </ScrollView>

        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          {/* Split by Items button */}
          <TouchableOpacity
            style={[styles.splitItemsBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
            onPress={() => {
              const memberIds = getMemberIds();
              if (memberIds.length <= 1 && !selectedGroupId) { setError('Select a group or friends first.'); return; }
              setError('');
              const parsed = parseReceiptItems(ocrLines);
              setReceiptItems(parsed.items);
              if (parsed.tax) {
                setDetectedTax(parsed.tax);
                const sub = parsed.subtotal ?? parsed.items.reduce((s, it) => s + it.price, 0);
                setTaxPercent(sub > 0 ? Math.round((parsed.tax / sub) * 100) : 0);
              }
              setStep('items');
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.primary, marginLeft: 8 }}>
              Split by Items
            </CustomText>
          </TouchableOpacity>

          <View style={[styles.btnRow, { marginTop: Spacing.sm }]}>
            <CustomButton title="Back" variant="outline" onPress={() => setStep('capture')} style={{ flex: 1, marginRight: Spacing.sm }} />
            <CustomButton
              title="Quick Split"
              onPress={() => {
                const total = parseFloat(amount);
                if (!total || total <= 0) { setError('Enter a valid amount.'); return; }
                if (!description.trim()) { setError('Add a description.'); return; }
                const memberIds = getMemberIds();
                if (memberIds.length <= 1 && !selectedGroupId) { setError('Select a group or at least one friend to split with.'); return; }
                setError('');
                setStep('confirm');
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
        </KeyboardAvoidingView>

        {pickerModal}
        <CategoryPickerModal visible={categoryPickerVisible} selected={category} onSelect={setCategory} onClose={() => setCategoryPickerVisible(false)} />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════
  // STEP: ITEMS — Assign items to people
  // ═══════════════════════════════════════════════════
  if (step === 'items') {
    const participants = getItemParticipants();
    const toggleAssign = (itemId: string, userId: string) => {
      setReceiptItems((prev) =>
        prev.map((it) => {
          if (it.id !== itemId) return it;
          const has = it.assignedTo.includes(userId);
          return { ...it, assignedTo: has ? it.assignedTo.filter((id) => id !== userId) : [...it.assignedTo, userId] };
        }),
      );
    };
    const removeItem = (itemId: string) => setReceiptItems((prev) => prev.filter((it) => it.id !== itemId));
    const allAssigned = receiptItems.every((it) => it.assignedTo.length > 0);

    // Manual item entry
    const [manualName, setManualName] = useState('');
    const [manualPrice, setManualPrice] = useState('');
    const addManualItem = () => {
      const price = parseFloat(manualPrice);
      if (!manualName.trim() || isNaN(price) || price <= 0) return;
      setReceiptItems((prev) => [...prev, {
        id: Date.now().toString(),
        name: manualName.trim(),
        price,
        confidence: 1,
        assignedTo: [],
      }]);
      setManualName('');
      setManualPrice('');
    };

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <CustomText variant="heading3" style={{ marginBottom: 4 }}>Split by Items</CustomText>
          <CustomText variant="caption" color={colors.textMuted} style={{ marginBottom: Spacing.md }}>
            Tap people to assign items. Shared items split equally.
          </CustomText>

          {receiptItems.length === 0 && (
            <View style={[styles.emptyItems, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
              <CustomText variant="body" color={colors.textMuted} style={{ marginTop: Spacing.sm, textAlign: 'center' }}>
                No items detected from receipt.{'\n'}Add items manually below.
              </CustomText>
            </View>
          )}

          {receiptItems.map((item) => (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: item.assignedTo.length > 0 ? colors.surface : '#FEE2E2', borderColor: item.assignedTo.length > 0 ? colors.border : Colors.danger + '40' }]}>
              <View style={styles.itemHeader}>
                <CustomText style={{ fontFamily: font.medium, fontSize: 15, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>
                  {item.name}
                </CustomText>
                <CustomText style={{ fontFamily: font.bold, fontSize: 15, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                  {formatCurrency(item.price, currentUser?.defaultCurrency ?? 'USD')}
                </CustomText>
                <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={styles.avatarRow}>
                {participants.map((p) => {
                  const isAssigned = item.assignedTo.includes(p.id);
                  return (
                    <TouchableOpacity key={p.id} onPress={() => toggleAssign(item.id, p.id)} activeOpacity={0.7} style={{ alignItems: 'center', marginRight: 10 }}>
                      <View style={[styles.avatarWrap, { borderColor: isAssigned ? colors.primary : 'transparent', opacity: isAssigned ? 1 : 0.4 }]}>
                        <CustomAvatar name={p.name} uri={p.avatarUrl} size={36} />
                      </View>
                      <CustomText style={{ fontSize: 10, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                        {p.name.split(' ')[0]}
                      </CustomText>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {item.assignedTo.length > 1 && (
                <CustomText variant="caption" color={colors.primary} style={{ marginTop: 4 }}>
                  Split {item.assignedTo.length} ways — {formatCurrency(item.price / item.assignedTo.length, currentUser?.defaultCurrency ?? 'USD')} each
                </CustomText>
              )}
            </View>
          ))}

          {/* Manual add item */}
          <View style={[styles.addItemRow, { borderColor: colors.border }]}>
            <TextInput
              value={manualName}
              onChangeText={setManualName}
              placeholder="Item name"
              placeholderTextColor={colors.textMuted}
              style={[styles.addItemInput, { flex: 2, color: colors.textPrimary, borderColor: colors.border, fontFamily: font.regular }]}
            />
            <TextInput
              value={manualPrice}
              onChangeText={setManualPrice}
              placeholder="Price"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[styles.addItemInput, { flex: 1, color: colors.textPrimary, borderColor: colors.border, fontFamily: font.regular }]}
            />
            <TouchableOpacity
              onPress={addManualItem}
              style={[styles.addItemBtn, { backgroundColor: colors.primary }]}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Tax & Tip controls */}
          <View style={[styles.sliderCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sliderRow}>
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>Tax</CustomText>
              <View style={styles.stepperRow}>
                <TouchableOpacity onPress={() => setTaxPercent(Math.max(0, taxPercent - 1))} style={[styles.stepperBtn, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="remove" size={18} color={colors.primary} />
                </TouchableOpacity>
                <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary, minWidth: 40, textAlign: 'center' }}>{taxPercent}%</CustomText>
                <TouchableOpacity onPress={() => setTaxPercent(Math.min(30, taxPercent + 1))} style={[styles.stepperBtn, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="add" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.sliderRow, { marginTop: Spacing.md }]}>
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>Tip</CustomText>
              <View style={styles.stepperRow}>
                <TouchableOpacity onPress={() => setTipPercent(Math.max(0, tipPercent - 1))} style={[styles.stepperBtn, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="remove" size={18} color={colors.primary} />
                </TouchableOpacity>
                <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary, minWidth: 40, textAlign: 'center' }}>{tipPercent}%</CustomText>
                <TouchableOpacity onPress={() => setTipPercent(Math.min(30, tipPercent + 1))} style={[styles.stepperBtn, { backgroundColor: colors.primary + '18' }]}>
                  <Ionicons name="add" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

        </ScrollView>

        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <View style={styles.btnRow}>
            <CustomButton title="Back" variant="outline" onPress={() => setStep('details')} style={{ flex: 1, marginRight: Spacing.sm }} />
            <CustomButton
              title="View Summary"
              onPress={() => {
                if (!allAssigned && receiptItems.length > 0) {
                  setError('Assign all items to at least one person.');
                  return;
                }
                setError('');
                setStep('summary');
              }}
              style={{ flex: 1 }}
            />
          </View>
          {error ? <CustomText variant="caption" color={Colors.danger} style={[styles.errorText, { marginTop: Spacing.sm }]}>{error}</CustomText> : null}
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════
  // STEP: SUMMARY — Per-person totals
  // ═══════════════════════════════════════════════════
  if (step === 'summary') {
    const participants = getItemParticipants();
    const subtotal = receiptItems.reduce((s, it) => s + it.price, 0);
    const taxAmount = subtotal * (taxPercent / 100);
    const tipAmount = subtotal * (tipPercent / 100);
    const grandTotal = subtotal + taxAmount + tipAmount;

    // Calculate per-person totals
    const personTotals: { id: string; name: string; avatarUrl?: string; itemTotal: number; finalTotal: number }[] = participants.map((p) => {
      const itemTotal = receiptItems.reduce((sum, it) => {
        if (!it.assignedTo.includes(p.id)) return sum;
        return sum + it.price / it.assignedTo.length;
      }, 0);
      const share = subtotal > 0 ? itemTotal / subtotal : 0;
      const finalTotal = itemTotal + (taxAmount * share) + (tipAmount * share);
      return { id: p.id, name: p.name, avatarUrl: p.avatarUrl, itemTotal, finalTotal: Math.round(finalTotal * 100) / 100 };
    }).filter((p) => p.finalTotal > 0);

    const handleSaveItemSplit = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        const memberIds = personTotals.map((p) => p.id);
        const exactAmounts: Record<string, number> = {};
        for (const p of personTotals) exactAmounts[p.id] = p.finalTotal;
        await addNewExpense({
          description: description.trim() || 'Restaurant bill',
          totalAmount: Math.round(grandTotal * 100) / 100,
          currency: currentUser.defaultCurrency ?? 'USD',
          paidBy: currentUser.id,
          splitType: 'exact',
          category,
          date: toISODateString(),
          memberIds,
          groupId: selectedGroupId ?? undefined,
          createdBy: currentUser.id,
          exactAmounts,
        });
        router.back();
      } catch (err: unknown) {
        setError((err as Error).message ?? 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    };

    const currency = currentUser?.defaultCurrency ?? 'USD';

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <CustomText variant="heading3" style={{ marginBottom: Spacing.md }}>Bill Summary</CustomText>

          {/* Per-person breakdown */}
          {personTotals.map((p) => (
            <View key={p.id} style={[styles.summaryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <CustomAvatar name={p.name} uri={p.avatarUrl} size={40} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                  {p.id === currentUser?.id ? 'You' : p.name}
                </CustomText>
                <CustomText variant="caption" color={colors.textMuted}>
                  Items: {formatCurrency(p.itemTotal, currency)}
                  {taxPercent > 0 ? ` + tax` : ''}{tipPercent > 0 ? ` + tip` : ''}
                </CustomText>
              </View>
              <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: colors.primary, fontVariant: ['tabular-nums'] }}>
                {formatCurrency(p.finalTotal, currency)}
              </CustomText>
            </View>
          ))}

          {/* Totals breakdown */}
          <View style={[styles.totalsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.totalLine}>
              <CustomText style={{ fontFamily: font.regular, fontSize: 14, color: colors.textMuted }}>Subtotal</CustomText>
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>{formatCurrency(subtotal, currency)}</CustomText>
            </View>
            {taxPercent > 0 && (
              <View style={styles.totalLine}>
                <CustomText style={{ fontFamily: font.regular, fontSize: 14, color: colors.textMuted }}>Tax ({taxPercent}%)</CustomText>
                <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>{formatCurrency(taxAmount, currency)}</CustomText>
              </View>
            )}
            {tipPercent > 0 && (
              <View style={styles.totalLine}>
                <CustomText style={{ fontFamily: font.regular, fontSize: 14, color: colors.textMuted }}>Tip ({tipPercent}%)</CustomText>
                <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>{formatCurrency(tipAmount, currency)}</CustomText>
              </View>
            )}
            <View style={[styles.confirmDivider, { backgroundColor: colors.border, marginVertical: Spacing.sm }]} />
            <View style={styles.totalLine}>
              <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.textPrimary }}>Grand Total</CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary }}>{formatCurrency(grandTotal, currency)}</CustomText>
            </View>
          </View>

          {error ? <CustomText variant="caption" color={Colors.danger} style={styles.errorText}>{error}</CustomText> : null}
        </ScrollView>

        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <View style={styles.btnRow}>
            <CustomButton title="Back" variant="outline" onPress={() => setStep('items')} style={{ flex: 1, marginRight: Spacing.sm }} />
            <CustomButton title="Save Expense" onPress={handleSaveItemSplit} loading={loading} style={{ flex: 1 }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════════════
  // STEP: CONFIRM (Quick Split)
  // ═══════════════════════════════════════════════════
  const categoryLabel = getCategoryConfig(category).label;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <CustomText variant="heading3" style={{ marginBottom: Spacing.lg }}>Confirm Expense</CustomText>

        <View style={[styles.confirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {imageUri && <Image source={{ uri: imageUri }} style={styles.confirmImage} resizeMode="cover" />}

          <View style={styles.confirmRow}>
            <CustomText variant="caption" color={colors.textMuted}>Amount</CustomText>
            <CustomText style={{ fontFamily: font.bold, fontSize: 24, color: colors.textPrimary }}>
              {formatCurrency(parseFloat(amount) || 0, currentUser?.defaultCurrency ?? 'USD')}
            </CustomText>
          </View>
          <View style={[styles.confirmDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.confirmRow}>
            <CustomText variant="caption" color={colors.textMuted}>Description</CustomText>
            <CustomText style={{ fontFamily: font.medium, fontSize: 15, color: colors.textPrimary }}>{description}</CustomText>
          </View>
          <View style={[styles.confirmDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.confirmRow}>
            <CustomText variant="caption" color={colors.textMuted}>Category</CustomText>
            <CustomText style={{ fontFamily: font.medium, fontSize: 15, color: colors.textPrimary }}>{categoryLabel}</CustomText>
          </View>
          <View style={[styles.confirmDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.confirmRow}>
            <CustomText variant="caption" color={colors.textMuted}>Paid by</CustomText>
            <CustomText style={{ fontFamily: font.medium, fontSize: 15, color: colors.textPrimary }}>You</CustomText>
          </View>
          <View style={[styles.confirmDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.confirmRow}>
            <CustomText variant="caption" color={colors.textMuted}>Split with</CustomText>
            <CustomText style={{ fontFamily: font.medium, fontSize: 15, color: colors.textPrimary }}>{selectionSummary}</CustomText>
          </View>
        </View>

        {error ? <CustomText variant="caption" color={Colors.danger} style={styles.errorText}>{error}</CustomText> : null}
      </ScrollView>

      <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <View style={styles.btnRow}>
          <CustomButton title="Edit" variant="outline" onPress={() => setStep('details')} style={{ flex: 1, marginRight: Spacing.sm }} />
          <CustomButton title="Add Expense" onPress={handleConfirm} loading={loading} style={{ flex: 1 }} />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════
const GUIDE_W = SCREEN_W * 0.85;
const GUIDE_H = GUIDE_W * 1.4;     // receipt aspect ratio ~1:1.4
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: 100 },

  // ── Camera ──
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  cameraTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Platform.OS === 'ios' ? 8 : Spacing.base,
    paddingBottom: Spacing.sm,
  },
  guideContainer: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  guideFrame: {
    width: GUIDE_W,
    height: GUIDE_H,
    position: 'relative',
  },
  guideText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '500',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderColor: '#fff' },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderColor: '#fff' },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS, borderColor: '#fff' },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS, borderColor: '#fff' },

  cameraBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingHorizontal: Spacing.xl,
  },
  cameraSecondaryBtn: { width: 60, alignItems: 'center' },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },

  // ── Gallery fallback button ──
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },

  // ── Details step ──
  previewBox: { borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  previewImage: { width: '100%', height: 200 },
  retakeBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  scanningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  amountRow: { alignItems: 'center', marginBottom: Spacing.md },
  errorText: { textAlign: 'center', marginBottom: Spacing.sm },
  btnRow: { flexDirection: 'row' },
  stickyBottom: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderTopWidth: 1 },
  memberList: { flexDirection: 'row', flexWrap: 'wrap' },

  // ── Selectors ──
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  catDot: { width: 14, height: 14, borderRadius: 7 },

  // ── Modal ──
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.base, marginVertical: Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1, height: 42 },
  searchInput: { flex: 1, fontSize: 14, marginLeft: Spacing.xs, paddingVertical: 0 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginTop: Spacing.sm },
  pickerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // ── Confirm ──
  confirmCard: { borderRadius: BorderRadius.xl, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.base },
  confirmImage: { width: '100%', height: 140 },
  confirmRow: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  confirmDivider: { height: 1, marginHorizontal: Spacing.base },

  // ── Split by Items button ──
  splitItemsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: BorderRadius.lg, borderWidth: 1.5,
  },

  // ── Items step ──
  emptyItems: { alignItems: 'center', padding: Spacing.xl, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.base },
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  addItemInput: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, fontSize: 14 },
  addItemBtn: { width: 38, height: 38, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  itemCard: {
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap' },
  avatarWrap: { borderWidth: 2, borderRadius: 20, padding: 1 },
  sliderCard: {
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // ── Summary step ──
  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  totalsCard: {
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
});
