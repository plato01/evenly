import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';
import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useAuth } from '../../hooks/useAuth';
import { isValidEmail, isValidPassword, isNonEmpty } from '../../utils/validators';
import type { Provider } from '@supabase/supabase-js';

export default function RegisterScreen() {
  const colors = useColors();
  const font = useFont();
  const { register, oauthLogin, isLoading, error, clearError } = useAuth();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [errors, setErrors]     = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isNonEmpty(name))           e.name     = 'Name is required.';
    if (!isValidEmail(email))        e.email    = 'Enter a valid email.';
    if (!isValidPassword(password))  e.password = 'Minimum 8 characters.';
    if (password !== confirm)        e.confirm  = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    clearError();
    if (!validate()) return;
    const ok = await register(name.trim(), email.trim().toLowerCase(), password);
    // On success → profile setup (not dashboard yet)
    if (ok) router.replace('/(auth)/profile-setup');
  };

  const handleOAuth = async (provider: Provider) => {
    clearError();
    const ok = await oauthLogin(provider);
    if (ok) router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <TouchableOpacity onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          <CustomText variant="heading2" style={{ marginBottom: Spacing.xs }}>Create account</CustomText>
          <CustomText variant="body" color={colors.textMuted} style={{ marginBottom: Spacing.xl }}>
            Join and start splitting expenses with friends
          </CustomText>

          {/* Fields */}
          <CustomTextInput
            label="Full Name"
            value={name}
            onChangeText={(t) => { setName(t); clearError(); }}
            placeholder="John Doe"
            autoCapitalize="words"
            error={errors.name}
          />
          <CustomTextInput
            label="Email"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError(); }}
            placeholder="you@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.email}
          />
          <CustomTextInput
            label="Password"
            value={password}
            onChangeText={(t) => { setPassword(t); clearError(); }}
            placeholder="Min. 8 characters"
            secureTextEntry
            error={errors.password}
          />
          <CustomTextInput
            label="Confirm Password"
            value={confirm}
            onChangeText={(t) => { setConfirm(t); clearError(); }}
            placeholder="Re-enter password"
            secureTextEntry
            error={errors.confirm}
          />

          {error && (
            <CustomText variant="caption" color={Colors.danger} style={styles.serverError}>
              {error}
            </CustomText>
          )}

          <CustomButton
            title="Create Account"
            onPress={handleRegister}
            loading={isLoading}
            fullWidth
            style={{ marginTop: Spacing.sm }}
          />

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <CustomText variant="caption" color={colors.textMuted} style={{ marginHorizontal: Spacing.sm }}>
              or sign up with
            </CustomText>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* OAuth buttons */}
          <View style={styles.oauthRow}>
            <TouchableOpacity
              style={[styles.oauthBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => handleOAuth('google')}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-google" size={20} color={colors.text} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.text, marginLeft: 8 }}>
                Google
              </CustomText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.oauthBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => handleOAuth('apple')}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-apple" size={20} color={colors.text} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.text, marginLeft: 8 }}>
                Apple
              </CustomText>
            </TouchableOpacity>
          </View>

          {/* Login link */}
          <TouchableOpacity onPress={() => router.back()} style={styles.loginRow}>
            <CustomText style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSecondary }}>
              Already have an account?{' '}
            </CustomText>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.primary }}>
              Log in
            </CustomText>
          </TouchableOpacity>

      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container:   { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing['4xl'] },
  backBtn:     { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: Spacing.xl },
  serverError: { marginBottom: Spacing.sm, textAlign: 'center' },
  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.lg },
  dividerLine: { flex: 1, height: 1 },
  oauthRow:    { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  oauthBtn:    {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  loginRow:    { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg },
});
