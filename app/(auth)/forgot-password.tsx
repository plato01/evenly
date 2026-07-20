import React, { useState, useRef, useEffect } from 'react';
import {
  View, StyleSheet, TextInput,
  TouchableOpacity,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useAuth } from '../../hooks/useAuth';
import { isValidEmail, isValidPassword } from '../../utils/validators';

type Step = 'email' | 'otp' | 'new-password';

const STEPS: { key: Step; icon: string; color: string }[] = [
  { key: 'email', icon: 'mail-outline', color: '#6366F1' },
  { key: 'otp', icon: 'shield-checkmark-outline', color: '#14B8A6' },
  { key: 'new-password', icon: 'lock-closed-outline', color: '#F59E0B' },
];

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const font = useFont();
  const { sendResetOTP, verifyOTP, resetPassword, isLoading, error, clearError } = useAuth();

  const [step, setStep]           = useState<Step>('email');
  const [email, setEmail]         = useState('');
  const [otp, setOtp]             = useState(['', '', '', '', '', '']);
  const [newPassword, setNew]     = useState('');
  const [confirmPw, setConfirm]   = useState('');
  const [fieldError, setFieldErr] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [resendIn, setResendIn]   = useState(0);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const currentStepInfo = STEPS[stepIndex];

  const goBack = () => {
    if (step === 'email') router.back();
    else if (step === 'otp') setStep('email');
    else setStep('otp');
  };

  // ─── Step 1: Send OTP ────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    clearError();
    setFieldErr('');
    if (resendIn > 0) return;
    if (!isValidEmail(email)) { setFieldErr('Enter a valid email address.'); return; }
    const ok = await sendResetOTP(email.trim().toLowerCase());
    if (ok) {
      setStep('otp');
      setResendIn(30); // 30s cooldown before another code can be requested
    }
  };

  // ─── Step 2: Verify OTP ──────────────────────────────────────────────────
  const otpValue = otp.join('');

  const handleOtpChange = (value: string, index: number) => {
    // Paste support: a multi-digit value spreads across the boxes from here
    const digits = value.replace(/\D/g, '');
    if (digits.length > 1) {
      const next = [...otp];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        next[index + i] = digits[i];
      }
      setOtp(next);
      const lastFilled = Math.min(index + digits.length, 6) - 1;
      inputRefs.current[lastFilled]?.focus();
      return;
    }
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (!value && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = async () => {
    clearError();
    setFieldErr('');
    if (otpValue.length < 6) { setFieldErr('Enter the 6-digit code from your email.'); return; }
    const ok = await verifyOTP(email, otpValue);
    if (ok) setStep('new-password');
  };

  // Auto-verify once all 6 digits are entered (typed or pasted)
  useEffect(() => {
    if (step === 'otp' && otpValue.length === 6 && !isLoading) {
      handleVerifyOTP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValue, step]);

  // ─── Step 3: Set New Password ────────────────────────────────────────────
  const handleResetPassword = async () => {
    clearError();
    setFieldErr('');
    if (!isValidPassword(newPassword))  { setFieldErr('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPw)      { setFieldErr('Passwords do not match.'); return; }
    const ok = await resetPassword(newPassword);
    if (ok) router.replace('/(tabs)');
  };

  const displayError = fieldError || error;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Header row */}
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={goBack} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </TouchableOpacity>

            {/* Step indicator */}
            <View style={styles.stepDots}>
              {STEPS.map((s, i) => (
                <View
                  key={s.key}
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: i <= stepIndex ? colors.primary : colors.border,
                      width: i === stepIndex ? 24 : 8,
                    },
                  ]}
                />
              ))}
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* Icon */}
          <Animated.View
            entering={FadeInDown.duration(400).springify()}
            key={step}
            style={[styles.iconCircle, { backgroundColor: currentStepInfo.color + '18' }]}
          >
            <Ionicons name={currentStepInfo.icon as any} size={28} color={currentStepInfo.color} />
          </Animated.View>

          {/* ── Step 1: Email ── */}
          {step === 'email' && (
            <Animated.View entering={FadeInDown.delay(100).duration(350)}>
              <CustomText variant="heading2" style={styles.title}>Forgot password?</CustomText>
              <CustomText variant="body" color={colors.textMuted} style={styles.subtitle}>
                No worries. Enter your email and we'll send you a reset code.
              </CustomText>

              <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CustomTextInput
                  label="Email address"
                  value={email}
                  onChangeText={(t) => { setEmail(t); clearError(); setFieldErr(''); }}
                  placeholder="you@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {displayError && <ErrorText msg={displayError} colors={colors} font={font} />}

              <CustomButton
                title="Send Reset Code"
                onPress={handleSendOTP}
                loading={isLoading}
                fullWidth
                style={{ marginTop: Spacing.lg }}
              />

            </Animated.View>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <Animated.View entering={FadeInDown.delay(100).duration(350)}>
              <CustomText variant="heading2" style={styles.title}>Check your email</CustomText>
              <CustomText variant="body" color={colors.textMuted} style={styles.subtitle}>
                We sent a 6-digit code to{'\n'}
                <CustomText style={{ fontFamily: font.semiBold, color: colors.primary }}>
                  {email}
                </CustomText>
              </CustomText>

              {/* OTP boxes */}
              <View style={styles.otpRow}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { inputRefs.current[i] = r; }}
                    value={digit}
                    onChangeText={(v) => handleOtpChange(v, i)}
                    onKeyPress={(e) => handleOtpKeyPress(e, i)}
                    style={[
                      styles.otpBox,
                      {
                        fontFamily: font.bold,
                        borderColor: digit ? colors.primary : colors.border,
                        backgroundColor: digit ? colors.primary + '12' : colors.surface,
                        color: colors.textPrimary,
                      },
                    ]}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </View>

              {displayError && <ErrorText msg={displayError} colors={colors} font={font} />}

              <CustomButton
                title="Verify Code"
                onPress={handleVerifyOTP}
                loading={isLoading}
                fullWidth
                style={{ marginTop: Spacing.md }}
              />

              <View style={styles.resendRow}>
                <CustomText variant="caption" color={colors.textMuted}>
                  Didn't receive the code?{' '}
                </CustomText>
                <TouchableOpacity onPress={handleSendOTP} disabled={resendIn > 0}>
                  <CustomText style={{
                    fontFamily: font.semiBold,
                    fontSize: 13,
                    color: resendIn > 0 ? colors.textMuted : colors.primary,
                  }}>
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend'}
                  </CustomText>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* ── Step 3: New Password ── */}
          {step === 'new-password' && (
            <Animated.View entering={FadeInDown.delay(100).duration(350)}>
              <CustomText variant="heading2" style={styles.title}>Create new password</CustomText>
              <CustomText variant="body" color={colors.textMuted} style={styles.subtitle}>
                Your new password must be at least 8 characters long.
              </CustomText>

              <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CustomTextInput
                  label="New Password"
                  value={newPassword}
                  onChangeText={(t) => { setNew(t); clearError(); setFieldErr(''); }}
                  placeholder="Min. 8 characters"
                  secureTextEntry={!showPw}
                />
                <CustomTextInput
                  label="Confirm Password"
                  value={confirmPw}
                  onChangeText={(t) => { setConfirm(t); clearError(); setFieldErr(''); }}
                  placeholder="Re-enter new password"
                  secureTextEntry={!showPw}
                />
                <TouchableOpacity
                  onPress={() => setShowPw(!showPw)}
                  style={styles.showPwRow}
                >
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
                  <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textMuted, marginLeft: 6 }}>
                    {showPw ? 'Hide' : 'Show'} passwords
                  </CustomText>
                </TouchableOpacity>
              </View>

              {/* Password strength hints */}
              <View style={styles.hintsRow}>
                <PasswordHint met={newPassword.length >= 8} label="8+ characters" colors={colors} font={font} />
                <PasswordHint met={newPassword === confirmPw && confirmPw.length > 0} label="Passwords match" colors={colors} font={font} />
              </View>

              {displayError && <ErrorText msg={displayError} colors={colors} font={font} />}

              <CustomButton
                title="Reset Password"
                onPress={handleResetPassword}
                loading={isLoading}
                fullWidth
                style={{ marginTop: Spacing.lg }}
              />
            </Animated.View>
          )}

      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function ErrorText({ msg, colors, font }: { msg: string; colors: any; font: any }) {
  return (
    <View style={styles.errorRow}>
      <Ionicons name="alert-circle" size={16} color={Colors.danger} />
      <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: Colors.danger, marginLeft: 6, flex: 1 }}>
        {msg}
      </CustomText>
    </View>
  );
}

function PasswordHint({ met, label, colors, font }: { met: boolean; label: string; colors: any; font: any }) {
  return (
    <View style={styles.hintItem}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={met ? '#14B8A6' : colors.textMuted}
      />
      <CustomText style={{ fontFamily: font.regular, fontSize: 12, color: met ? '#14B8A6' : colors.textMuted, marginLeft: 4 }}>
        {label}
      </CustomText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing['4xl'] },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['2xl'],
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    height: 4,
    borderRadius: 2,
  },

  iconCircle: {
    width: 56, height: 56,
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: { marginBottom: Spacing.xs },
  subtitle: { marginBottom: Spacing.xl, lineHeight: 22 },

  inputCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.base,
  },

  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: Spacing.base },
  otpBox: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    textAlign: 'center',
    fontSize: 22,
  },

  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },

  showPwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },

  hintsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.danger + '12',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
});
