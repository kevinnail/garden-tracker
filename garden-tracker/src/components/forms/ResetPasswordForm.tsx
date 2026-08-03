import React, { useState } from 'react';
import {
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/src/store/authStore';
import {
  cappedOnChange,
  weakPasswordError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@/src/utils/authFormValidate';

export default function ResetPasswordForm() {
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChangePassword = cappedOnChange(setPassword, PASSWORD_MAX_LENGTH, 'Password');
  const onChangeConfirm = cappedOnChange(setConfirm, PASSWORD_MAX_LENGTH, 'Password');

  // The token arrives via the cropplanner://reset-password?token=… deep link.
  // Without it there is nothing to submit — tell the user to reopen the email link.
  if (!token) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Reset link invalid</Text>
          <Text style={styles.subheading}>
            This screen needs a valid reset link. Open the most recent password-reset email on this
            device and tap the link again.
          </Text>
          <Pressable
            style={styles.linkBtn}
            onPress={() => router.replace('/(modals)/sign-in')}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Text style={styles.linkText}>Back to sign in</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const validationError =
    password.length < PASSWORD_MIN_LENGTH
      ? `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
      : weakPasswordError(password)
        ? weakPasswordError(password)
        : password !== confirm
          ? 'Passwords do not match.'
          : null;

  const handleSubmit = async () => {
    if (validationError || submitting) return;
    setSubmitting(true);
    try {
      const ok = await resetPassword(token, password);
      if (ok) {
        Toast.show({ type: 'success', text1: 'Password updated', text2: 'Sign in with it now.' });
        router.replace('/(modals)/sign-in');
      } else {
        Toast.show({
          type: 'error',
          text1: 'Could not reset password',
          text2: useAuthStore.getState().error ?? undefined,
          visibilityTime: 4500,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          <Text style={styles.heading}>Set a new password</Text>
          <Text style={styles.subheading}>Choose a new password for your account.</Text>

          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={onChangePassword}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            placeholderTextColor="#555"
            autoCapitalize="none"
            secureTextEntry
            textContentType="newPassword"
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={onChangeConfirm}
            placeholder="Re-enter password"
            placeholderTextColor="#555"
            autoCapitalize="none"
            secureTextEntry
            textContentType="newPassword"
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          {validationError && (password.length > 0 || confirm.length > 0) && (
            <Text style={styles.validationText}>{validationError}</Text>
          )}

          <Pressable
            style={[styles.submitBtn, (validationError || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!!validationError || submitting}
            accessibilityRole="button"
            accessibilityLabel="Update password"
          >
            {submitting ? (
              <ActivityIndicator color="#111" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Update password</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  keyboardAvoider: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 6 },

  heading: { color: '#eee', fontSize: 22, fontWeight: '800', marginBottom: 2 },
  subheading: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 14 },

  label: { color: '#bbb', fontSize: 13, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#2a2a2a',
    color: '#eee',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },

  validationText: { color: '#e08a8a', fontSize: 12, marginTop: 10 },

  submitBtn: {
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#2ecc71',
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#2a4a38' },
  submitBtnText: { color: '#111', fontWeight: '700', fontSize: 15 },

  linkBtn: { marginTop: 18, alignItems: 'center', paddingVertical: 8 },
  linkText: { color: '#7dcea0', fontSize: 13, fontWeight: '600' },
});
