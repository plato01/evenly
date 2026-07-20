import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay,
  withSpring, FadeOut, interpolateColor, Easing,
} from 'react-native-reanimated';

const AnimatedImage = Animated.createAnimatedComponent(Image);
import { Ionicons } from '@expo/vector-icons';
import { Provider } from 'react-redux';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { store } from '../store';
import { useAppSelector } from '../store';
import { loginSuccess } from '../store/slices/authSlice';
import { setThemeMode, setNotificationsEnabled, setFontFamily, ThemeMode } from '../store/slices/uiSlice';
import { useColors } from '../hooks/useColors';
import { FontFamilyId } from '../constants/fonts';
import { initDatabase, usersDb } from '../db/database';
import { FontAssets } from '../constants/fonts';
import { getSession } from '../services/authService';
import { supabase } from '../services/supabase';
import { storage } from '../services/storage';
import { StorageKeys } from '../constants/storageKeys';
import { Colors } from '../constants/colors';
import { ThemeTransitionProvider } from '../components/ui/ThemeTransition';
import { PremiumHeader } from '../components/ui/PremiumHeader';
import { seedTestData, seedPersonalExpenses } from '../db/seed';
import * as Notifications from 'expo-notifications';
// Sync queue — start network listener + process pending on boot
const loadSyncQueue = () => import('../services/syncQueue');
// Lazy-import nudge service to avoid crashing if expo-notifications isn't linked
const loadNudgeService = () => import('../services/nudgeService');
// Lazy-import recurring expense processor
const loadRecurringProcessor = () => import('../services/recurringExpenses');
// Lazy-import cloud restore service
const loadCloudRestore = () => import('../services/cloudRestore');
// Lazy-import Firebase — only if the native module is actually available.
// @react-native-firebase requires a dev-client / EAS build; in Expo Go
// the native module (RNFBAppModule) doesn't exist and the import throws
// synchronously before .catch() can handle it.
import { TurboModuleRegistry } from 'react-native';
const hasFirebaseNative = !!TurboModuleRegistry.get('RNFBAppModule');
const loadFirebase = () =>
  hasFirebaseNative
    ? import('../services/firebase')
    : Promise.reject(new Error('Firebase native module not available'));

SplashScreen.preventAutoHideAsync();

export const unstable_settings = { anchor: '(tabs)' };

// ─── Branded animated splash ────────────────────────────────────────────────
// Must match the expo-splash-screen backgroundColor in app.json so the native
// splash → branded splash handoff is invisible (no flash between them).
const NATIVE_SPLASH_BG = '#12101A';

function BrandedSplash({ onFinish }: { onFinish: () => void }) {
  const deviceScheme = useColorScheme();
  const storedTheme  = useAppSelector((s) => s.ui.themeMode);
  const isDark = storedTheme === 'dark' || (storedTheme === 'system' && deviceScheme === 'dark');

  const bg         = isDark ? '#12101A' : '#F3EEFF';
  const textColor  = isDark ? '#FFFFFF'  : '#1A0A2E';
  const tagColor   = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(26,10,46,0.38)';

  // Start from top-right corner, sweep to center like a paper plane
  const craneX     = useSharedValue(220);
  const craneY     = useSharedValue(-280);
  const craneRot   = useSharedValue(-40);
  const craneScale = useSharedValue(1.25);
  const craneOp    = useSharedValue(0);
  const textY      = useSharedValue(24);
  const textOp     = useSharedValue(0);
  // 0 = native splash color, 1 = themed splash color. Starting on the exact
  // native color and cross-fading kills the hard dark→light cut on light theme.
  const bgProgress = useSharedValue(0);

  useEffect(() => {
    bgProgress.value = withDelay(150, withTiming(1, { duration: 550, easing: Easing.out(Easing.quad) }));
    // Crane fades in at top-right and glides diagonally to center
    craneOp.value    = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    craneX.value     = withSpring(0, { damping: 22, stiffness: 60 });
    craneY.value     = withSpring(0, { damping: 18, stiffness: 55 });
    craneRot.value   = withSpring(0, { damping: 16, stiffness: 50 });
    craneScale.value = withSpring(1, { damping: 18, stiffness: 55 });
    // Text rises after crane lands
    textOp.value = withDelay(850, withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }));
    textY.value  = withDelay(850, withSpring(0, { damping: 16, stiffness: 90 }));
    const t = setTimeout(onFinish, 2200);
    return () => clearTimeout(t);
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(bgProgress.value, [0, 1], [NATIVE_SPLASH_BG, bg]),
  }));

  const craneStyle = useAnimatedStyle(() => ({
    opacity: craneOp.value,
    transform: [
      { translateX: craneX.value },
      { translateY: craneY.value },
      { rotate: `${craneRot.value}deg` },
      { scale: craneScale.value },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOp.value,
    transform: [{ translateY: textY.value }],
  }));

  return (
    <Animated.View
      // Native splash is dismissed only once this cover has actually laid out,
      // so there is never an uncovered (white) frame between the two.
      onLayout={() => { SplashScreen.hideAsync().catch(() => {}); }}
      exiting={FadeOut.duration(450)}
      style={[ss.container, containerStyle]}
    >
      <AnimatedImage
        source={require('../assets/LOGO/dollar origami real.png')}
        style={[ss.crane, craneStyle]}
        resizeMode="contain"
      />
      <Animated.View style={[ss.textWrap, textStyle]}>
        <Text style={[ss.title, { color: textColor }]}>Evenly</Text>
        <Text style={[ss.tagline, { color: tagColor }]}>Split expenses, not friendships.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const ss = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  crane: {
    width: 160,
    height: 160,
    marginBottom: 32,
  },
  textWrap: {
    alignItems: 'center',
  },
  title: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    marginTop: 10,
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

// ─── Bootstrap + cover overlay ───────────────────────────────────────────────
function AppInitializer({ children }: { children: React.ReactNode }) {
  const initialized   = useRef(false);
  const bootstrapDone = useRef(false);
  const [ready, setReady] = useState(false);
  // Handle notification taps — navigate to the relevant screen
  const handleNotificationResponse = useCallback((response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data;
    if (data?.friendId) {
      router.push(`/friend/${data.friendId}`);
    } else if (data?.groupId) {
      router.push(`/group/${data.groupId}`);
    } else if (data?.expenseId) {
      router.push(`/expense/${data.expenseId}`);
    } else if (data?.type === 'nudge') {
      router.push('/settle');
    } else if (data?.type === 'recurring') {
      router.push('/recurring');
    }
  }, []);

  useEffect(() => {
    // Listen for notification taps (foreground + background cold start)
    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    // Also check if the app was opened from a killed state via notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });

    return () => subscription.remove();
  }, [handleNotificationResponse]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!bootstrapDone.current) return;
      if (event === 'SIGNED_OUT') {
        store.dispatch({ type: 'auth/logout' });
        router.replace('/(auth)/login');
        return;
      }
      // Keep Redux in sync on token refresh or OAuth sign-in
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.user) {
        const user = await getSession();
        if (user) store.dispatch(loginSuccess(user));
      }
    });

    const bootstrap = async () => {
      // DB must init first — everything downstream depends on it
      try {
        await initDatabase();
      } catch (err) {
        console.error('[Bootstrap] DB init failed — retrying once:', err);
        // Wait and retry once
        await new Promise((r) => setTimeout(r, 500));
        try {
          await initDatabase();
        } catch (err2) {
          console.error('[Bootstrap] DB init retry failed:', err2);
          // Continue anyway — screens will handle missing DB gracefully
        }
      }

      const [[savedTheme, savedNotif, savedFont], onboardingDone, user] = await Promise.all([
        Promise.all([
          storage.get(StorageKeys.THEME_MODE),
          storage.get(StorageKeys.NOTIFICATIONS_ENABLED),
          storage.get(StorageKeys.FONT_FAMILY),
        ]),
        storage.get(StorageKeys.ONBOARDING_DONE),
        getSession().catch(() => null),
      ]);

      if (savedTheme) store.dispatch(setThemeMode(savedTheme as ThemeMode));
      if (savedNotif !== null) store.dispatch(setNotificationsEnabled(savedNotif !== 'false'));
      if (savedFont) store.dispatch(setFontFamily(savedFont as FontFamilyId));

      if (!onboardingDone) {
        router.replace('/onboarding');
        bootstrapDone.current = true;
        setReady(true);
        return;
      }
      if (user) {
        await usersDb.insert(user).catch(() => {});
        store.dispatch(loginSuccess(user));
        // Make sure our cloud `users` row exists — friend search and friend
        // requests can only target users present in that table, and the
        // login/register-time upsert is best-effort (it's skipped entirely
        // when a session is restored instead of created). Non-blocking.
        import('../services/userSync')
          .then(({ userSync }) => userSync.upsert(user))
          .catch(() => {});
        // Seed test data in background (dev only — non-blocking, run once)
        if (__DEV__) {
          storage.get('evenly.test_data_seeded').then((seeded) => {
            if (!seeded) seedTestData(user.id).then(() => storage.set('evenly.test_data_seeded', 'true')).catch(() => {});
          });
          storage.get('evenly.personal_seeded').then((seeded) => {
            if (!seeded) seedPersonalExpenses(user.id).then(() => storage.set('evenly.personal_seeded', 'true')).catch(() => {});
          });
        }
        // Register FCM push notifications (lazy to avoid crash if native module missing)
        console.log('[FCM] hasFirebaseNative:', hasFirebaseNative);
        loadFirebase().then(({ registerForPushNotifications, setupForegroundMessageHandler, setupTokenRefreshHandler, registerBackgroundHandler }) => {
          console.log('[FCM] Firebase module loaded, registering...');
          registerBackgroundHandler();
          registerForPushNotifications();
          setupForegroundMessageHandler();
          setupTokenRefreshHandler();
        }).catch((err) => {
          console.warn('[FCM] Firebase init failed:', err?.message ?? err);
        });
        // Schedule smart nudge notifications (lazy to avoid crash if native module missing)
        loadNudgeService().then(({ setupNotifications, scheduleNudges, scheduleRecurringReminders }) =>
          setupNotifications().then(() => Promise.all([
            scheduleNudges(user.id),
            scheduleRecurringReminders(user.id),
          ]))
        ).catch(() => {});
        // Process due recurring expenses (non-blocking)
        loadRecurringProcessor().then(({ processRecurringExpenses }) =>
          processRecurringExpenses(user.id)
        ).catch(() => {});
        // Start offline sync queue — listen for connectivity + replay pending
        loadSyncQueue().then(({ startNetworkListener, processQueue }) => {
          startNetworkListener();
          processQueue(); // replay anything queued from last session
        }).catch(() => {});
        // Restore cloud data to local DB if this is a fresh device (non-blocking)
        loadCloudRestore().then(({ cloudRestore }) =>
          cloudRestore.hasCloudData(user.id).then((hasData) => {
            if (hasData) {
              cloudRestore.restoreAll(user.id).then(({ total, errors }) => {
                console.log(`[cloudRestore] Restored ${total} rows, ${errors.length} errors`);
              });
            }
          })
        ).catch(() => {});
        // No whisper preload needed — using expo-speech-recognition (platform native)
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/login');
      }

      bootstrapDone.current = true;
      setReady(true);
    };

    bootstrap();
    return () => { listener.subscription.unsubscribe(); };
  }, []);

  const [splashDone, setSplashDone] = useState(false);
  const showSplash = !splashDone;

  return (
    <>
      {children}
      {showSplash && <BrandedSplash onFinish={() => setSplashDone(true)} />}
    </>
  );
}

// ─── Theme-aware shell — MUST be inside <Provider> to react to Redux changes ─
function ThemedApp() {
  const deviceScheme  = useColorScheme();
  const themeMode     = useAppSelector((s) => s.ui.themeMode);
  const resolvedScheme = themeMode === 'system' ? deviceScheme : themeMode;
  // Club themes (afterglow / velvet) are dark-family — nav chrome colors come
  // from the active palette so headers match every theme, not just light/dark
  const isDarkUI = resolvedScheme === 'dark' || resolvedScheme === 'midnight';
  const navColors = useColors();
  const navTheme      = isDarkUI ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider value={navTheme}>
      <ThemeTransitionProvider>
        <AppInitializer>
          <Stack
            screenOptions={{
              headerBackVisible: false,
              headerLeft: ({ canGoBack }) => canGoBack ? (
                <TouchableOpacity
                  onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
                  hitSlop={8}
                  style={{
                    width: 36, height: 36, borderRadius: 12,
                    borderWidth: 1, borderColor: navColors.border,
                    backgroundColor: navColors.surface,
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 8,
                  }}
                >
                  <Ionicons name="chevron-back" size={20} color={navColors.textPrimary} />
                </TouchableOpacity>
              ) : undefined,
              headerStyle: {
                backgroundColor: navColors.background,
              },
              headerTintColor: navColors.textPrimary,
              headerTitleStyle: {
                fontFamily: 'Inter_18pt-Bold',
                fontSize: 18,
              },
              headerShadowVisible: true,
            }}
          >
            <Stack.Screen name="onboarding"    options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)"        options={{ headerShown: false }} />
            <Stack.Screen name="(auth)"        options={{ headerShown: false }} />
            <Stack.Screen name="profile/edit" options={{
              headerTitle: () => <PremiumHeader title="Edit Profile" icon="person-circle" iconColor="#F43F5E" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="group/[id]" options={{
              headerTitle: () => <PremiumHeader title="Group" icon="people" iconColor="#6366F1" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="group/create" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="New Group" icon="people-circle" iconColor="#F43F5E" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="group/edit/[id]" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="Edit Group" icon="pencil" iconColor="#F59E0B" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="group/trip-budget" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="Trip Budget" icon="airplane" iconColor="#00D2D3" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="group/trip-report" options={{
              headerTitle: () => <PremiumHeader title="Trip Report" icon="bar-chart" iconColor="#34D399" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="expense/add" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="Add Expense" icon="receipt" iconColor="#F43F5E" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="expense/scan" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="Scan Bill" icon="camera" iconColor="#A78BFA" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="expense/[id]" options={{
              headerTitle: () => <PremiumHeader title="Expense" icon="pricetag" iconColor="#FF6B6B" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="expense/edit/[id]" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="Edit Expense" icon="create" iconColor="#F59E0B" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="friend/[id]" options={{
              headerTitle: () => <PremiumHeader title="Friend" icon="person" iconColor="#4ECDC4" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="settle/index" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="Settle Up" icon="wallet" iconColor="#16A34A" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="personal" options={{
              headerTitle: () => <PremiumHeader title="Personal Wallet" icon="wallet" iconColor="#F43F5E" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="personal-analytics" options={{
              headerTitle: () => <PremiumHeader title="Smart Analysis" icon="analytics" iconColor="#FBBF24" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="personal-budget" options={{
              presentation: 'modal',
              headerTitle: () => <PremiumHeader title="Monthly Budget" icon="pie-chart" iconColor="#F59E0B" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="recurring" options={{
              headerTitle: () => <PremiumHeader title="Recurring" icon="repeat" iconColor="#8B5CF6" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="spending-detail" options={{
              headerTitle: () => <PremiumHeader title="Spending" icon="trending-up" iconColor="#60A5FA" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="privacy" options={{
              headerTitle: () => <PremiumHeader title="Privacy Policy" icon="shield-checkmark" iconColor="#06B6D4" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="help" options={{
              headerTitle: () => <PremiumHeader title="Help & FAQ" icon="help-circle" iconColor="#10B981" tintColor={navColors.textPrimary} isDark={isDarkUI} />,
            }} />
            <Stack.Screen name="modal" options={{ title: 'Modal', presentation: 'modal' }} />
          </Stack>
          <StatusBar style={isDarkUI ? 'light' : 'dark'} />
        </AppInitializer>
      </ThemeTransitionProvider>
    </ThemeProvider>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  useFonts(FontAssets);

  useEffect(() => {
    // Safety net only — BrandedSplash hides the native splash via onLayout the
    // moment it has painted. If that ever fails, don't leave the app stuck.
    const t = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <Provider store={store}>
            <ThemedApp />
          </Provider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

