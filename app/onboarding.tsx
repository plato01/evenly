import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, Text, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '../services/storage';
import { StorageKeys } from '../constants/storageKeys';

// ─── Design Tokens ─────────────────────────────────────────────────────────
const C = {
  bg: '#0A0C14',
  surface: '#141620',
  border: '#1E2235',
  blue: '#6C3CE7',
  green: '#4ADE80',
  red: '#F87171',
  textSec: '#8B8FA3',
  textMuted: '#5C6078',
  white: '#FFFFFF',
};

const finishOnboarding = async () => {
  await storage.set(StorageKeys.ONBOARDING_DONE, 'true');
  router.replace('/(auth)/login');
};

// ─── Main ───────────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const slideH = height - insets.top - insets.bottom;

  const goTo = (i: number) => scrollRef.current?.scrollTo({ x: i * width, animated: true });

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== idx) setIdx(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={onScrollEnd}
      >
        {/* ════ Screen 1: Welcome ════ */}
        <View style={{ width, height: slideH }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <View style={st.appIconWrap}>
              <Image source={require('../assets/LOGO/logo.png')} style={st.appIcon} resizeMode="contain" />
            </View>
            <Text style={st.appTitle}>Evenly</Text>
            <Text style={st.subtitle}>Split expenses with friends.{'\n'}No math. No drama.</Text>
          </View>
          <View style={{ paddingHorizontal: 32, paddingBottom: 32, gap: 12 }}>
            <TouchableOpacity style={st.btnBlue} onPress={() => goTo(1)} activeOpacity={0.85}>
              <Text style={st.btnBlueText}>Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.btnDark} onPress={finishOnboarding} activeOpacity={0.85}>
              <Text style={st.btnDarkText}>I have an account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ════ Screen 2: Voice ════ */}
        <View style={{ width, height: slideH }}>
          <View style={st.body}>
            <View style={st.micOuter}>
              <View style={st.micInner}>
                <Ionicons name="mic" size={36} color={C.textSec} />
              </View>
            </View>
            <Text style={st.heading}>
              <Text style={{ color: C.white }}>Just </Text>
              <Text style={{ color: C.green }}>say it.</Text>
            </Text>
            <Text style={st.desc}>Add expenses with your voice. No{'\n'}typing. No menus. Done in seconds.</Text>
            <View style={st.card}>
              <Text style={st.cardTxt}>
                "I paid <Text style={{ color: C.green, fontWeight: '600' }}>$45</Text> for dinner, split with{'\n'}
                <Text style={{ color: C.blue, fontWeight: '600' }}>Sarah</Text> and{' '}
                <Text style={{ color: C.blue, fontWeight: '600' }}>Dave</Text>"
              </Text>
            </View>
          </View>
        </View>

        {/* ════ Screen 3: Balance ════ */}
        <View style={{ width, height: slideH }}>
          <View style={st.body}>
            <Text style={st.heading}>
              <Text style={{ color: C.white }}>Everyone's </Text>
              <Text style={{ color: C.green }}>even.</Text>
            </Text>
            <Text style={st.desc}>See who owes who. Settle up with{'\n'}one tap.</Text>
            {[
              { i: 'Y', n: 'You', s: 'Paid for dinner + Uber', a: '+$30', c: C.green, bg: '#6366F1' },
              { i: 'S', n: 'Sarah', s: 'Owes you', a: '-$15', c: C.red, bg: '#EC4899' },
              { i: 'D', n: 'Dave', s: 'Owes you', a: '-$15', c: C.red, bg: '#22C55E' },
            ].map((p) => (
              <View key={p.i} style={st.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[st.avatar, { backgroundColor: p.bg }]}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.white }}>{p.i}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: C.white }}>{p.n}</Text>
                    <Text style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{p.s}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: p.c }}>{p.a}</Text>
              </View>
            ))}
            <View style={st.settleBtn}>
              <Ionicons name="checkmark-circle" size={18} color={C.green} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: C.green }}> Settle Up Instantly</Text>
            </View>
          </View>
        </View>

        {/* ════ Screen 4: Crew ════ */}
        <View style={{ width, height: slideH }}>
          <View style={st.body}>
            <Text style={st.heading}>
              <Text style={{ color: C.white }}>Add your </Text>
              <Text style={{ color: C.green }}>crew.</Text>
            </Text>
            <Text style={st.desc}>Splitting solo is no fun. Bring your{'\n'}people.</Text>
            {[
              { icon: 'people' as const, t: 'From Contacts', s: 'Find friends already on Evenly', tint: '#14B8A6' },
              { icon: 'link' as const, t: 'Share Link', s: 'Send via iMessage, WhatsApp, DM', tint: '#A78BFA' },
              { icon: 'qr-code' as const, t: 'QR Code', s: 'Scan to join in 2 seconds', tint: '#22D3EE' },
            ].map((o) => (
              <View key={o.t} style={st.row}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[st.optIcon, { backgroundColor: o.tint + '20' }]}>
                    <Ionicons name={o.icon} size={22} color={o.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: C.white }}>{o.t}</Text>
                    <Text style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{o.s}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ════ Footer (screens 2-4) ════ */}
      {idx > 0 && (
        <View style={[st.footer, { bottom: insets.bottom + 16 }]}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
            {[0, 1, 2].map((d) => (
              <View key={d} style={{ height: 6, borderRadius: 3, width: d === idx - 1 ? 20 : 6, backgroundColor: d === idx - 1 ? C.blue : C.textMuted }} />
            ))}
          </View>
          <TouchableOpacity style={st.btnBlue} onPress={idx === 3 ? finishOnboarding : () => goTo(idx + 1)} activeOpacity={0.85}>
            <Text style={st.btnBlueText}>
              {idx === 2 ? 'Invite Your Crew' : idx === 3 ? "Let's Go →" : 'Next'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={finishOnboarding} activeOpacity={0.7}>
            <Text style={{ fontSize: 14, color: C.textSec, marginTop: 4 }}>{idx === 3 ? "I'll do this later" : 'Skip'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  appIconWrap: { width: 100, height: 100, borderRadius: 24, backgroundColor: '#6C3CE7', overflow: 'hidden', marginBottom: 24 },
  appIcon: { width: 100, height: 100, transform: [{ scale: 1.18 }] },
  appTitle: { fontSize: 40, fontWeight: '700', color: C.white, marginBottom: 8 },
  subtitle: { fontSize: 16, color: C.textSec, textAlign: 'center', lineHeight: 24 },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 180, gap: 8 },
  heading: { fontSize: 32, fontWeight: '700', textAlign: 'center', lineHeight: 40 },
  desc: { fontSize: 15, color: C.textSec, textAlign: 'center', lineHeight: 22, marginBottom: 16 },

  micOuter: { width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: C.blue + '40', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  micInner: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 16, width: '100%' },
  cardTxt: { fontSize: 15, lineHeight: 24, textAlign: 'center', color: C.textSec },

  row: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  settleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.green + '15', borderRadius: 20, paddingVertical: 12, width: '100%' },

  optIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  btnBlue: { backgroundColor: C.blue, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', width: '100%' },
  btnBlueText: { fontSize: 16, fontWeight: '600', color: C.white },
  btnDark: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', width: '100%' },
  btnDarkText: { fontSize: 16, fontWeight: '600', color: '#E8EAED' },

  footer: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 32, alignItems: 'center' },
});
