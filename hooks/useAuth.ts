import { useAppDispatch, useAppSelector } from '../store';
import {
  loginSuccess, logout as logoutAction, updateProfile, setError, setLoading,
} from '../store/slices/authSlice';
import * as authService from '../services/authService';
import { userSync } from '../services/userSync';
import { cloudRestore } from '../services/cloudRestore';
import { inviteService } from '../services/inviteService';
import { usersDb } from '../db/database';
import { User } from '../types';
import type { Provider } from '@supabase/supabase-js';

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const { currentUser, isAuthenticated, isLoading, error } = useAppSelector((s) => s.auth);

  /**
   * Sign in with Supabase. On success, also upsert user row in local SQLite.
   */
  const login = async (email: string, password: string): Promise<boolean> => {
    dispatch(setLoading(true));
    const { user, error: err } = await authService.signIn(email, password);
    if (err || !user) {
      dispatch(setError(err ?? 'Login failed'));
      return false;
    }
    await usersDb.insert(user).catch(() => {});
    await userSync.upsert(user).catch(() => {});
    // Claim any pending group invites, then restore cloud data (non-blocking).
    inviteService.claimInvites()
      .catch(() => 0)
      .finally(() => cloudRestore.restoreAll(user.id).catch(() => {}));
    dispatch(loginSuccess(user));
    return true;
  };

  /**
   * Create account with Supabase. On success, insert user in local SQLite
   * and return so the caller can redirect to profile-setup.
   */
  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    dispatch(setLoading(true));
    const { user, error: err } = await authService.signUp(name, email, password);
    if (err || !user) {
      dispatch(setError(err ?? 'Registration failed'));
      return false;
    }
    await usersDb.insert(user).catch(() => {});
    await userSync.upsert(user).catch(() => {});
    // A brand-new account may have been invited to groups — claim them, then
    // pull the freshly-joined groups into local SQLite.
    inviteService.claimInvites()
      .catch(() => 0)
      .finally(() => cloudRestore.restoreAll(user.id).catch(() => {}));
    dispatch(loginSuccess(user));
    return true;
  };

  /**
   * Send password-reset OTP email.
   */
  const sendResetOTP = async (email: string): Promise<boolean> => {
    dispatch(setLoading(true));
    const { error: err } = await authService.sendPasswordResetOTP(email);
    dispatch(setLoading(false));
    if (err) { dispatch(setError(err)); return false; }
    return true;
  };

  /**
   * Verify the OTP received via email.
   */
  const verifyOTP = async (email: string, token: string): Promise<boolean> => {
    dispatch(setLoading(true));
    const { error: err } = await authService.verifyPasswordOTP(email, token);
    dispatch(setLoading(false));
    if (err) { dispatch(setError(err)); return false; }
    return true;
  };

  /**
   * Set a new password after successful OTP verification.
   */
  const resetPassword = async (newPassword: string): Promise<boolean> => {
    dispatch(setLoading(true));
    const { error: err } = await authService.updatePassword(newPassword);
    dispatch(setLoading(false));
    if (err) { dispatch(setError(err)); return false; }
    return true;
  };

  /**
   * Update profile metadata. Applies locally first (optimistic),
   * then syncs to Supabase. Returns false if remote sync failed.
   */
  const editProfile = async (data: Partial<User>): Promise<boolean> => {
    // Optimistic: update Redux + SQLite immediately so UI reacts instantly
    dispatch(updateProfile(data));
    if (currentUser) {
      await usersDb.update(currentUser.id, data).catch(() => {});
      userSync.update(currentUser.id, data).catch(() => {});
    }
    // Background sync to Supabase Auth metadata
    const { error: err } = await authService.updateUserMeta({
      name:             data.name,
      avatar_url:       data.avatarUrl,
      default_currency: data.defaultCurrency,
      phone:            data.phone,
      wallet_address:   data.walletAddress,
      wallet_chain_id:  data.walletChainId,
      wallet_token:     data.walletToken,
    });
    if (err) { dispatch(setError(err)); return false; }
    return true;
  };

  /**
   * Native Google Sign-In (account picker). On success, upsert user locally + cloud.
   */
  const googleLogin = async (): Promise<boolean> => {
    dispatch(setLoading(true));
    const { user, error: err } = await authService.signInWithGoogle();
    if (err) {
      dispatch(setError(err));
      return false;
    }
    if (!user) {
      dispatch(setLoading(false));
      return false; // User cancelled
    }
    await usersDb.insert(user).catch(() => {});
    await userSync.upsert(user).catch(() => {});
    // Claim any pending group invites, then restore cloud data (non-blocking).
    inviteService.claimInvites()
      .catch(() => 0)
      .finally(() => cloudRestore.restoreAll(user.id).catch(() => {}));
    dispatch(loginSuccess(user));
    return true;
  };

  /**
   * Sign in with OAuth provider (Google, Apple, etc.)
   */
  const oauthLogin = async (provider: Provider): Promise<boolean> => {
    dispatch(setLoading(true));
    const { user, error: err } = await authService.signInWithOAuth(provider);
    if (err) {
      dispatch(setError(err));
      return false;
    }
    if (!user) {
      dispatch(setLoading(false));
      return false; // User cancelled
    }
    await usersDb.insert(user).catch(() => {});
    await userSync.upsert(user).catch(() => {});
    // Claim any pending group invites, then restore cloud data (non-blocking).
    inviteService.claimInvites()
      .catch(() => 0)
      .finally(() => cloudRestore.restoreAll(user.id).catch(() => {}));
    dispatch(loginSuccess(user));
    return true;
  };

  /**
   * Sign out from Supabase and clear Redux state.
   */
  const signOut = async (): Promise<void> => {
    await authService.signOut();
    dispatch(logoutAction());
  };

  const clearError = () => dispatch(setError(null));

  return {
    currentUser,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    oauthLogin,
    googleLogin,
    sendResetOTP,
    verifyOTP,
    resetPassword,
    editProfile,
    signOut,
    clearError,
  };
};
