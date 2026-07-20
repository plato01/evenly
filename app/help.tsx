import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { CustomText } from '../components/ui/CustomText';
import { useColors } from '../hooks/useColors';
import { useFont } from '../hooks/useFont';
import { Spacing, BorderRadius } from '../constants/theme';

const SUPPORT_EMAIL = 'koushikflyingboy@gmail.com';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I add an expense?',
    a: 'Tap the + button on the tab bar, or use a quick action on the Dashboard: type it in, scan a bill with the camera, or just speak — "I spent 500 on dinner" fills in the amount, description, and category for you.',
  },
  {
    q: 'How do splits work?',
    a: 'Every expense can be split equally, by exact amounts, by percentages, or by shares. In a group, all members are included by default; you can also split with individual friends outside any group.',
  },
  {
    q: 'What happens when I Settle Up?',
    a: 'Recording a payment creates a pending settlement request. The other person confirms (or rejects) it from their Dashboard, and only confirmed settlements change balances — so nobody can mark your debt paid without you knowing.',
  },
  {
    q: 'How do crypto settlements work?',
    a: 'Add a receiving address in Account → Crypto Address (pick a network and a stablecoin). When someone owes you, they scan your QR code and pay from their own wallet app. Evenly then finds the transfer on-chain and verifies it server-side — that\'s the "Verified on-chain" shield on a settlement. Evenly never holds funds or keys.',
  },
  {
    q: 'Does the app work offline?',
    a: 'Yes — everything is saved to your phone first, so you can add expenses on a plane or without signal. Changes sync to the cloud automatically when you\'re back online.',
  },
  {
    q: 'What are Smart payment reminders?',
    a: 'With reminders set to Smart, Evenly nudges you about unpaid debts on day 3, day 7, and day 14+ with escalating urgency. You can switch to Weekly or Off in Account → Payment Reminders, or mute reminders for a specific friend from their profile.',
  },
  {
    q: 'Can I get my data out?',
    a: 'Account → Export Data generates a CSV of all your expenses and opens the share sheet. Deleting your account removes your cloud data permanently.',
  },
  {
    q: 'Why do some balances look "simplified"?',
    a: 'In groups, Evenly can minimize the number of payments needed — if A owes B and B owes C, it may suggest A pays C directly. Everyone\'s net balance stays exactly the same.',
  },
];

export default function HelpScreen() {
  const colors = useColors();
  const font = useFont();
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const toggle = (i: number) => {
    Haptics.selectionAsync();
    setOpenIdx(openIdx === i ? null : i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {FAQS.map((faq, i) => {
          const open = openIdx === i;
          return (
            <Animated.View
              key={faq.q}
              entering={FadeInDown.delay(i * 45).springify()}
              style={[st.card, {
                backgroundColor: colors.surface,
                borderColor: open ? colors.primary : colors.border,
              }]}
            >
              <TouchableOpacity style={st.qRow} onPress={() => toggle(i)} activeOpacity={0.7}>
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: open ? colors.primary : colors.textPrimary, flex: 1 }}>
                  {faq.q}
                </CustomText>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {open && (
                <CustomText style={{ fontSize: 13, lineHeight: 20, color: colors.textSecondary, fontFamily: font.regular, marginTop: Spacing.sm }}>
                  {faq.a}
                </CustomText>
              )}
            </Animated.View>
          );
        })}

        <Animated.View entering={FadeInDown.delay(FAQS.length * 45).springify()}>
          <TouchableOpacity
            style={[st.supportBtn, { backgroundColor: colors.primary + '14', borderColor: colors.primary }]}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Evenly support`).catch(() => {})}
            activeOpacity={0.8}
          >
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.primary, marginLeft: Spacing.sm }}>
              Contact Support
            </CustomText>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: Spacing.base, paddingBottom: Spacing['2xl'] },
  card: {
    borderWidth: 1, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  supportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, marginTop: Spacing.base,
  },
});
