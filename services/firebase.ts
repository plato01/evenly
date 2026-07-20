import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { Platform, TurboModuleRegistry } from 'react-native';

const isFirebaseAvailable = !!TurboModuleRegistry.get('RNFBAppModule');

function getMessagingModule() {
  if (!isFirebaseAvailable) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-firebase/messaging');
  } catch {
    return null;
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  const mod = getMessagingModule();
  if (!mod) { console.log('[FCM] Firebase not available in this build'); return null; }
  try {
    const { getMessaging, getToken, requestPermission, AuthorizationStatus } = mod;
    const msg = getMessaging();
    const authStatus = await requestPermission(msg);
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;
    if (!enabled) { console.log('[FCM] Notification permission denied'); return null; }
    const token = await getToken(msg);
    console.log('[FCM] Token:', token);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.auth.updateUser({
        data: { fcm_token: token, fcm_platform: Platform.OS, fcm_updated_at: new Date().toISOString() },
      });
      console.log('[FCM] Token saved to Supabase');
    }
    return token;
  } catch (error) {
    console.error('[FCM] Registration failed:', error);
    return null;
  }
}

export function setupForegroundMessageHandler(): () => void {
  const mod = getMessagingModule();
  if (!mod) return () => {};
  try {
    const { getMessaging, onMessage } = mod;
    const msg = getMessaging();
    return onMessage(msg, async (remoteMessage: any) => {
      console.log('[FCM] Foreground message:', remoteMessage);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: remoteMessage.notification?.title ?? 'Notification',
          body: remoteMessage.notification?.body ?? '',
          data: remoteMessage.data ?? {},
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: 'general' } : {}),
        },
        trigger: null,
      });
    });
  } catch {
    return () => {};
  }
}

export function setupTokenRefreshHandler(): () => void {
  const mod = getMessagingModule();
  if (!mod) return () => {};
  try {
    const { getMessaging, onTokenRefresh } = mod;
    const msg = getMessaging();
    return onTokenRefresh(msg, async (newToken: string) => {
      console.log('[FCM] Token refreshed:', newToken);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.auth.updateUser({
          data: { fcm_token: newToken, fcm_platform: Platform.OS, fcm_updated_at: new Date().toISOString() },
        });
      }
    });
  } catch {
    return () => {};
  }
}

export function registerBackgroundHandler(): void {
  const mod = getMessagingModule();
  if (!mod) return;
  try {
    const { getMessaging, setBackgroundMessageHandler } = mod;
    const msg = getMessaging();
    setBackgroundMessageHandler(msg, async (remoteMessage: any) => {
      console.log('[FCM] Background message:', remoteMessage);
    });
  } catch {
    // no-op
  }
}
