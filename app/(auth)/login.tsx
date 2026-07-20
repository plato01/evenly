import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
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
import { isValidEmail } from '../../utils/validators';

export default function LoginScreen() {
  const colors = useColors();
  const font = useFont();
  const { login, googleLogin, isLoading, error, clearError } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!isValidEmail(email))  e.email    = 'Enter a valid email.';
    if (password.length < 8)   e.password = 'Minimum 8 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    clearError();
    if (!validate()) return;
    const ok = await login(email.trim().toLowerCase(), password);
    if (ok) router.replace('/(tabs)');
  };

  const handleGoogle = async () => {
    clearError();
    const ok = await googleLogin();
    if (ok) router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.kav}>
        <View style={styles.container}>

          {/* Logo / brand */}
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Image source={require('../../assets/LOGO/logo.png')} style={styles.logoImg} resizeMode="contain" />
            </View>
            <CustomText variant="heading1" align="center" style={{ marginTop: Spacing.md }}>
              Evenly
            </CustomText>
            <CustomText variant="body" color={colors.textMuted} align="center" style={{ marginTop: Spacing.xs }}>
              Split expenses, not friendships
            </CustomText>
          </View>

          {/* Form */}
          <View style={styles.form}>
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
              placeholder="••••••••"
              secureTextEntry
              error={errors.password}
            />

            {/* Forgot password */}
            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotRow}
            >
              <CustomText
                style={{ fontFamily: font.medium, fontSize: 13, color: colors.primary }}
              >
                Forgot password?
              </CustomText>
            </TouchableOpacity>

            {error && (
              <CustomText variant="caption" color={Colors.danger} style={styles.serverError}>
                {error}
              </CustomText>
            )}

            <CustomButton
              title="Log In"
              onPress={handleLogin}
              loading={isLoading}
              fullWidth
              style={{ marginTop: Spacing.sm }}
            />

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <CustomText variant="caption" color={colors.textMuted} style={{ marginHorizontal: Spacing.sm }}>
                or continue with
              </CustomText>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* OAuth buttons */}
            <View style={styles.oauthRow}>
              <TouchableOpacity
                style={[styles.oauthBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={handleGoogle}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-google" size={20} color={colors.textPrimary} />
                <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary, marginLeft: 8 }}>
                  Google
                </CustomText>
              </TouchableOpacity>

            </View>
          </View>

          {/* Register link */}
          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.registerRow}>
            <CustomText style={{ fontFamily: font.regular, fontSize: 14, color: colors.textSecondary }}>
              Don't have an account?{' '}
            </CustomText>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.primary }}>
              Sign up
            </CustomText>
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav:         { flex: 1 },
  container:   { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl },
  brand:       { alignItems: 'center', marginBottom: Spacing['2xl'] },
  logoBox:     {
    width: 80, height: 80, borderRadius: 22,
    backgroundColor: '#6C3CE7',
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  logoImg: { width: 80, height: 80, transform: [{ scale: 1.18 }] },
  form:        { marginBottom: Spacing.lg },
  forgotRow:   { alignSelf: 'flex-end', marginTop: -Spacing.sm, marginBottom: Spacing.base },
  serverError: { marginBottom: Spacing.sm, textAlign: 'center' },
  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.lg },
  dividerLine: { flex: 1, height: 1 },
  oauthRow:    { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  oauthBtn:    {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg },
});
