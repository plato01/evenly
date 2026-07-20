import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Polygon } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { CustomText } from '../ui/CustomText';
import { CustomAvatar } from '../ui/CustomAvatar';
import { CustomButton } from '../ui/CustomButton';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { formatCurrency } from '../../utils/currency';
import { SimplifiedDebt } from '../../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Who owes whom. One entry renders the big "IOU" layout; more render as rows. */
  debts: SimplifiedDebt[];
  /** Card heading — group name, or "Between you two" for friend balances. */
  title: string;
  /**
   * userId → identity. The image leaves the app, so "You" labels get replaced
   * with real names, and avatars stay the exact ones used everywhere else.
   */
  people?: Record<string, { name: string; avatarUrl?: string | null }>;
}

/** Abstract "folded paper" facets pinned to the top edge of the card. */
const OrigamiTop = () => (
  <Svg
    pointerEvents="none"
    style={StyleSheet.absoluteFill}
    width="100%"
    height={150}
    viewBox="0 0 330 150"
    preserveAspectRatio="xMaxYMin slice"
  >
    <Polygon points="330,0 208,0 330,98" fill="#6C5CE7" opacity={0.16} />
    <Polygon points="330,98 208,0 262,122" fill="#F43F5E" opacity={0.09} />
    <Polygon points="208,0 148,0 262,122" fill="#FFFFFF" opacity={0.045} />
    <Line x1="208" y1="0" x2="262" y2="122" stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={1} />
    <Line x1="330" y1="98" x2="262" y2="122" stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth={1} />
  </Svg>
);

/** Matching facets pinned to the bottom-left corner. */
const OrigamiBottom = () => (
  <Svg
    pointerEvents="none"
    style={styles.origamiBottom}
    width="100%"
    height={110}
    viewBox="0 0 330 110"
    preserveAspectRatio="xMinYMax slice"
  >
    <Polygon points="0,110 0,18 112,110" fill="#6C5CE7" opacity={0.12} />
    <Polygon points="0,18 112,110 44,-6" fill="#FFFFFF" opacity={0.035} />
    <Polygon points="112,110 178,110 84,52" fill="#F43F5E" opacity={0.06} />
    <Line x1="0" y1="18" x2="112" y2="110" stroke="#FFFFFF" strokeOpacity={0.07} strokeWidth={1} />
  </Svg>
);

/**
 * Shareable "IOU" card — renders a branded card offscreen-style inside a
 * preview modal, snapshots it to a PNG (react-native-view-shot, needs a
 * dev-client rebuild) and hands it to the native share sheet so it can be
 * dropped into WhatsApp & co as an image.
 *
 * With multiple debts, toggle chips under the card choose which ones make it
 * onto the image — narrowing to one switches to the big IOU layout, so you can
 * send a person just their own share.
 *
 * The card is deliberately theme-independent: always the dark branded look,
 * so it reads as "a card from Evenly" wherever it lands.
 */
export const ShareBalanceCard: React.FC<Props> = ({ visible, onClose, debts, title, people }) => {
  const font = useFont();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  // Fresh open → everyone selected again
  useEffect(() => {
    if (visible) setExcluded(new Set());
  }, [visible]);

  const activeDebts = debts.filter((_, i) => !excluded.has(i));
  const single = activeDebts.length === 1 ? activeDebts[0] : null;
  const personName = (id: string, fallback: string) => people?.[id]?.name ?? fallback;
  const personAvatar = (id: string) => people?.[id]?.avatarUrl;

  // Row layout is tight — prefer first names (like the chips), but fall back
  // to the full name when two people on the card share a first name.
  const firstNameOwners: Record<string, Set<string>> = {};
  for (const d of debts) {
    for (const full of [personName(d.from, d.fromName), personName(d.to, d.toName)]) {
      const first = full.trim().split(/\s+/)[0];
      (firstNameOwners[first] ??= new Set()).add(full);
    }
  }
  const shortName = (full: string) => {
    const first = full.trim().split(/\s+/)[0];
    return firstNameOwners[first]?.size > 1 ? full : first;
  };

  // Hero total for the multi-debt layout — only meaningful in one currency
  const sameCurrency = activeDebts.length > 0 && activeDebts.every((d) => d.currency === activeDebts[0].currency);
  const activeTotal = activeDebts.reduce((sum, d) => sum + d.amount, 0);
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const toggleDebt = (index: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (debts.length - next.size > 1) {
        // never allow emptying the card
        next.add(index);
      }
      return next;
    });
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share balance' });
    } catch (err) {
      console.warn('[ShareBalanceCard] capture/share failed:', (err as Error)?.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* The card — everything inside the ViewShot becomes the image */}
        <ViewShot ref={cardRef} options={{ format: 'png' }} style={styles.shotWrap}>
          <View style={styles.card}>
            <OrigamiTop />
            <OrigamiBottom />
            <LinearGradient
              colors={['#6C5CE7', '#F43F5E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardAccent}
            />
            {/* Brand row */}
            <View style={styles.brandRow}>
              <View style={styles.brandDot}>
                <Ionicons name="wallet" size={13} color="#FFFFFF" />
              </View>
              <CustomText style={{ fontFamily: font.bold, fontSize: 15, color: '#FFFFFF', marginLeft: 7 }}>
                Evenly
              </CustomText>
              <View style={{ flex: 1 }} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                {today}
              </CustomText>
            </View>

            <CustomText
              style={{ fontFamily: font.semiBold, fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: Spacing.lg, letterSpacing: 1.2, textTransform: 'uppercase' }}
            >
              {title}
            </CustomText>

            {single ? (
              /* Single debt — big IOU layout */
              <View style={styles.singleWrap}>
                <View style={styles.avatarRow}>
                  <CustomAvatar name={personName(single.from, single.fromName)} uri={personAvatar(single.from)} size={52} />
                  <View style={styles.arrowPill}>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </View>
                  <CustomAvatar name={personName(single.to, single.toName)} uri={personAvatar(single.to)} size={52} />
                </View>
                <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: Spacing.md }}>
                  <CustomText style={{ fontFamily: font.bold, fontSize: 14, color: '#FFFFFF' }}>{personName(single.from, single.fromName)}</CustomText>
                  {'  owes  '}
                  <CustomText style={{ fontFamily: font.bold, fontSize: 14, color: '#FFFFFF' }}>{personName(single.to, single.toName)}</CustomText>
                </CustomText>
                <CustomText
                  style={{ fontFamily: font.bold, fontSize: 40, lineHeight: 52, color: '#FFFFFF', marginTop: Spacing.xs, fontVariant: ['tabular-nums'], includeFontPadding: false, textAlign: 'center' }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCurrency(single.amount, single.currency)}
                </CustomText>
              </View>
            ) : (
              /* Multi debt — hero total + settle-up plan rows */
              <View style={{ marginTop: Spacing.md }}>
                {sameCurrency && (
                  <View style={styles.totalWrap}>
                    <CustomText style={{ fontFamily: font.medium, fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: 1.4, textTransform: 'uppercase' }}>
                      Total to settle
                    </CustomText>
                    <CustomText
                      style={{ fontFamily: font.bold, fontSize: 32, lineHeight: 42, color: '#FFFFFF', fontVariant: ['tabular-nums'], includeFontPadding: false }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatCurrency(activeTotal, activeDebts[0].currency)}
                    </CustomText>
                    <CustomText style={{ fontFamily: font.regular, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                      {activeDebts.length} payments settle everyone up
                    </CustomText>
                  </View>
                )}
                {activeDebts.map((d, i) => (
                  <View key={`${d.from}-${d.to}-${i}`} style={[styles.debtRow, (i > 0 || sameCurrency) && styles.debtRowBorder]}>
                    <View style={styles.pairWrap}>
                      <CustomAvatar name={personName(d.from, d.fromName)} uri={personAvatar(d.from)} size={28} />
                      <View style={styles.pairTo}>
                        <CustomAvatar name={personName(d.to, d.toName)} uri={personAvatar(d.to)} size={28} />
                      </View>
                    </View>
                    <CustomText
                      style={{ fontFamily: font.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)', flex: 1, marginLeft: 10 }}
                      numberOfLines={1}
                    >
                      {shortName(personName(d.from, d.fromName))}
                      <CustomText style={{ fontFamily: font.regular, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}> pays </CustomText>
                      {shortName(personName(d.to, d.toName))}
                    </CustomText>
                    <CustomText style={{ fontFamily: font.bold, fontSize: 14, color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>
                      {formatCurrency(d.amount, d.currency)}
                    </CustomText>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.footerRow}>
              <Ionicons name="checkmark-circle" size={13} color="rgba(255,255,255,0.45)" />
              <CustomText
                style={{ fontFamily: font.medium, fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginLeft: 5, flexShrink: 1 }}
                numberOfLines={1}
              >
                Tracked with Evenly — split fairly, settle easily
              </CustomText>
            </View>
          </View>
        </ViewShot>

        {/* Controls — outside the ViewShot, never captured */}
        <View style={styles.controls}>
          {debts.length > 1 && (
            <View style={styles.chipSection}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm }}>
                On the card
              </CustomText>
              <View style={styles.chipWrap}>
                {debts.map((d, i) => {
                  const on = !excluded.has(i);
                  return (
                    <TouchableOpacity
                      key={`chip-${d.from}-${d.to}-${i}`}
                      style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                      onPress={() => toggleDebt(i)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={on ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={on ? '#A79BF5' : 'rgba(255,255,255,0.35)'}
                      />
                      <CustomText
                        style={{ fontFamily: font.medium, fontSize: 12, color: on ? '#FFFFFF' : 'rgba(255,255,255,0.4)', marginLeft: 5 }}
                        numberOfLines={1}
                      >
                        {d.fromName.split(' ')[0]} → {d.toName.split(' ')[0]}
                      </CustomText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <CustomButton title={sharing ? 'Preparing…' : 'Share'} onPress={handleShare} fullWidth disabled={sharing} />
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>Close</CustomText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const CARD_WIDTH = 330;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // Near-opaque: the screen behind is visual noise next to the card preview
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  shotWrap: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#0B0D12',
    borderRadius: 24,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  origamiBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#6C5CE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arrowPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.md,
  },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  totalWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 2,
  },
  pairWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pairTo: {
    marginLeft: -10,
    borderWidth: 2,
    borderColor: '#0B0D12',
    borderRadius: 16,
  },
  debtRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  controls: {
    width: CARD_WIDTH,
    marginTop: Spacing.lg,
    backgroundColor: '#14161F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: Spacing.base,
  },
  chipSection: {
    marginBottom: Spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipOn: {
    backgroundColor: 'rgba(108,92,231,0.22)',
    borderColor: 'rgba(167,155,245,0.5)',
  },
  chipOff: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
});
