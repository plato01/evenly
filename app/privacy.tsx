import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CustomText } from '../components/ui/CustomText';
import { useColors } from '../hooks/useColors';
import { useFont } from '../hooks/useFont';
import { Spacing, BorderRadius } from '../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const SECTIONS: { icon: IoniconName; color: string; title: string; body: string }[] = [
  {
    icon: 'phone-portrait-outline', color: '#6366F1', title: 'Your data lives on your device',
    body: 'Evenly is offline-first: every expense, group, and settlement is stored in a local database on your phone. A copy is synced to our cloud (Supabase) so you can sign in on another device and so shared groups stay in sync between members.',
  },
  {
    icon: 'person-outline', color: '#F43F5E', title: 'What we store',
    body: 'Your account profile (name, email, avatar, preferred currency), the expenses, groups, comments, and settlements you create, and — only if you add one — a crypto receiving address. Friends you add manually exist only in your account.',
  },
  {
    icon: 'camera-outline', color: '#A78BFA', title: 'Receipts and voice stay on-device',
    body: 'Bill scanning (OCR) and voice input are processed entirely on your phone. Receipt photos and audio are never uploaded to our servers.',
  },
  {
    icon: 'shield-checkmark-outline', color: '#16A34A', title: 'Crypto settlements',
    body: 'If you settle in crypto, Evenly reads public blockchain data to verify the transfer and stores the transaction hash with the settlement. Evenly never holds funds and never asks for wallet private keys — payments happen in your own wallet app.',
  },
  {
    icon: 'notifications-outline', color: '#F59E0B', title: 'Notifications',
    body: 'Payment reminders are scheduled locally on your device. If push notifications are enabled, a device token is stored so group members’ actions can reach you.',
  },
  {
    icon: 'ban-outline', color: '#DC2626', title: 'What we never do',
    body: 'We don’t sell your data, show ads, or use third-party analytics trackers. Your financial data is used for one thing: making the app work.',
  },
  {
    icon: 'trash-outline', color: '#64748B', title: 'Deleting your data',
    body: 'Deleting your account from the Account tab permanently removes your profile and personal data from the cloud. Expenses you shared with a group remain visible to that group’s members.',
  },
];

export default function PrivacyScreen() {
  const colors = useColors();
  const font = useFont();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        <CustomText style={{ fontSize: 13, color: colors.textMuted, fontFamily: font.regular, marginBottom: Spacing.base }}>
          Last updated: July 19, 2026
        </CustomText>

        {SECTIONS.map((sec, i) => (
          <Animated.View
            key={sec.title}
            entering={FadeInDown.delay(i * 60).springify()}
            style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={st.cardHeader}>
              <View style={[st.iconBadge, { backgroundColor: sec.color + '18' }]}>
                <Ionicons name={sec.icon} size={18} color={sec.color} />
              </View>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, flex: 1 }}>
                {sec.title}
              </CustomText>
            </View>
            <CustomText style={{ fontSize: 13, lineHeight: 20, color: colors.textSecondary, fontFamily: font.regular, marginTop: Spacing.sm }}>
              {sec.body}
            </CustomText>
          </Animated.View>
        ))}

        <CustomText style={{ fontSize: 12, color: colors.textMuted, fontFamily: font.regular, textAlign: 'center', marginTop: Spacing.base, marginBottom: Spacing['2xl'] }}>
          Questions? Reach us from Help &amp; FAQ → Contact Support.
        </CustomText>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: Spacing.base },
  card: {
    borderWidth: 1, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBadge: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});
