import { supabase } from './supabase';
import { User } from '../types';
import { nowISO } from '../utils/dateUtils';
import type { Provider } from '@supabase/supabase-js';

export interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * Sign in with email + password via Supabase.
 */
export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };

  const supaUser = data.user;
  const user: User = {
    id:              supaUser.id,
    name:            supaUser.user_metadata?.name ?? email.split('@')[0],
    email:           supaUser.email ?? email,
    phone:           supaUser.user_metadata?.phone,
    avatarUrl:       supaUser.user_metadata?.avatar_url,
    defaultCurrency: supaUser.user_metadata?.default_currency ?? 'USD',
    createdAt:       supaUser.created_at ?? nowISO(),
    walletAddress:   supaUser.user_metadata?.wallet_address,
    walletChainId:   supaUser.user_metadata?.wallet_chain_id,
    walletToken:     supaUser.user_metadata?.wallet_token,
  };
  return { user, error: null };
};

/**
 * Create a new account. Returns the new user (email not yet confirmed).
 */
export const signUp = async (
  name: string,
  email: string,
  password: string
): Promise<AuthResult> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, default_currency: 'USD' },
    },
  });
  if (error) return { user: null, error: error.message };

  const supaUser = data.user;
  if (!supaUser) return { user: null, error: 'Sign up failed. Please try again.' };

  const user: User = {
    id:              supaUser.id,
    name,
    email,
    defaultCurrency: 'USD',
    createdAt:       supaUser.created_at ?? nowISO(),
    walletAddress:   supaUser.user_metadata?.wallet_address,
    walletChainId:   supaUser.user_metadata?.wallet_chain_id,
    walletToken:     supaUser.user_metadata?.wallet_token,
  };
  return { user, error: null };
};

/**
 * Send password-reset OTP to email.
 */
export const sendPasswordResetOTP = async (email: string): Promise<{ error: string | null }> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error: error?.message ?? null };
};

/**
 * Verify the 6-digit OTP sent to email for password recovery.
 */
export const verifyPasswordOTP = async (
  email: string,
  token: string
): Promise<{ error: string | null }> => {
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  });
  return { error: error?.message ?? null };
};

/**
 * Set a new password after OTP verification.
 */
export const updatePassword = async (newPassword: string): Promise<{ error: string | null }> => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error?.message ?? null };
};

/**
 * Update user metadata (name, avatar_url, default_currency, phone, wallet).
 * Stored in Supabase Auth user_metadata so it survives restarts and syncs
 * across devices (getSession reads these back).
 */
export const updateUserMeta = async (
  meta: Partial<{
    name: string; avatar_url: string; default_currency: string; phone: string;
    wallet_address: string; wallet_chain_id: number; wallet_token: string;
  }>
): Promise<{ error: string | null }> => {
  const { error } = await supabase.auth.updateUser({ data: meta });
  return { error: error?.message ?? null };
};

/**
 * Native Google Sign-In — opens the device's Google account picker (no browser),
 * gets an ID token, and exchanges it with Supabase via signInWithIdToken.
 * Requires a dev-client build (native module) and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
 */
export const signInWithGoogle = async (): Promise<AuthResult> => {
  const { GoogleSignin, statusCodes, isSuccessResponse } = await import(
    '@react-native-google-signin/google-signin'
  );

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    return { user: null, error: 'Google sign-in is not configured (missing web client ID).' };
  }

  try {
    GoogleSignin.configure({ webClientId });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      return { user: null, error: null }; // User cancelled — not an error
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      return { user: null, error: 'Could not retrieve Google ID token.' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error || !data.user) {
      return { user: null, error: error?.message ?? 'Google sign-in failed.' };
    }

    const supaUser = data.user;
    const user: User = {
      id:              supaUser.id,
      name:            supaUser.user_metadata?.name ?? supaUser.user_metadata?.full_name ?? supaUser.email?.split('@')[0] ?? '',
      email:           supaUser.email ?? '',
      phone:           supaUser.user_metadata?.phone,
      avatarUrl:       supaUser.user_metadata?.avatar_url ?? supaUser.user_metadata?.picture,
      defaultCurrency: supaUser.user_metadata?.default_currency ?? 'USD',
      createdAt:       supaUser.created_at ?? nowISO(),
    };
    return { user, error: null };
  } catch (err: any) {
    if (err?.code === statusCodes.SIGN_IN_CANCELLED || err?.code === statusCodes.IN_PROGRESS) {
      return { user: null, error: null };
    }
    if (err?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { user: null, error: 'Google Play Services are not available on this device.' };
    }
    return { user: null, error: err?.message ?? 'Google sign-in failed.' };
  }
};

/**
 * Sign in with an OAuth provider (Google, Apple, GitHub, etc.)
 * Opens an in-app browser for the OAuth flow, then Supabase handles the redirect.
 */
export const signInWithOAuth = async (provider: Provider): Promise<AuthResult> => {
  const { makeRedirectUri } = await import('expo-auth-session');
  const WebBrowser = await import('expo-web-browser');
  const redirectTo = makeRedirectUri({ scheme: 'evenly', path: '/(tabs)' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    return { user: null, error: error?.message ?? 'OAuth failed' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !('url' in result)) {
    return { user: null, error: null }; // User cancelled — not an error
  }

  // Extract tokens from the redirect URL fragment
  const url = new URL(result.url);
  const params = new URLSearchParams(url.hash.substring(1)); // fragment after #
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return { user: null, error: 'Could not retrieve session from OAuth redirect.' };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError || !sessionData.user) {
    return { user: null, error: sessionError?.message ?? 'Failed to set session.' };
  }

  const supaUser = sessionData.user;
  const user: User = {
    id:              supaUser.id,
    name:            supaUser.user_metadata?.name ?? supaUser.user_metadata?.full_name ?? supaUser.email?.split('@')[0] ?? '',
    email:           supaUser.email ?? '',
    phone:           supaUser.user_metadata?.phone,
    avatarUrl:       supaUser.user_metadata?.avatar_url ?? supaUser.user_metadata?.picture,
    defaultCurrency: supaUser.user_metadata?.default_currency ?? 'USD',
    createdAt:       supaUser.created_at ?? nowISO(),
    walletAddress:   supaUser.user_metadata?.wallet_address,
    walletChainId:   supaUser.user_metadata?.wallet_chain_id,
    walletToken:     supaUser.user_metadata?.wallet_token,
  };
  return { user, error: null };
};

/**
 * Sign out the current session.
 */
export const signOut = async (): Promise<void> => {
  await supabase.auth.signOut();
};

/**
 * Get the currently persisted session (for app start).
 * Returns null if no valid session is stored.
 */
export const getSession = async (): Promise<User | null> => {
  const { data } = await supabase.auth.getSession();
  const supaUser = data.session?.user;
  if (!supaUser) return null;

  return {
    id:              supaUser.id,
    name:            supaUser.user_metadata?.name ?? supaUser.email?.split('@')[0] ?? '',
    email:           supaUser.email ?? '',
    phone:           supaUser.user_metadata?.phone,
    avatarUrl:       supaUser.user_metadata?.avatar_url,
    defaultCurrency: supaUser.user_metadata?.default_currency ?? 'USD',
    createdAt:       supaUser.created_at ?? nowISO(),
    walletAddress:   supaUser.user_metadata?.wallet_address,
    walletChainId:   supaUser.user_metadata?.wallet_chain_id,
    walletToken:     supaUser.user_metadata?.wallet_token,
  };
};
