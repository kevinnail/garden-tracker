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
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/src/store/authStore';
import { isValidEmail, cappedOnChange, EMAIL_MAX_LENGTH } from '@/src/utils/authFormValidate';

export default function ForgotPasswordForm() {
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChangeEmail = cappedOnChange(setEmail, EMAIL_MAX_LENGTH, 'Email');

  const trimmedEmail = email.trim();
  const validationError = !isValidEmail(trimmedEmail) ? 'Enter a valid email address.' : null;

  const handleSubmit = async () => {
    if (validationError || submitting) return;
    setSubmitting(true);
    try {
      const ok = await requestPasswordReset(trimmedEmail);
      if (ok) {
        Toast.show({
          type: 'success',
          text1: 'Check your email',
          text2: 'If an account exists, a reset link is on its way.',
          visibilityTime: 4500,
        });
        router.back();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Could not send reset email',
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
          <Text style={styles.heading}>Reset password</Text>
          <Text style={styles.subheading}>
            Enter your account email and we&apos;ll send you a link to set a new password.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={onChangeEmail}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
          />

          {validationError && email.length > 0 && (
            <Text style={styles.validationText}>{validationError}</Text>
          )}

          <Pressable
            style={[styles.submitBtn, (validationError || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!!validationError || submitting}
            accessibilityRole="button"
            accessibilityLabel="Send reset link"
          >
            {submitting ? (
              <ActivityIndicator color="#111" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Send reset link</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.linkBtn}
            onPress={() => router.replace('/(modals)/sign-in')}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Text style={styles.linkText}>Back to sign in</Text>
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
