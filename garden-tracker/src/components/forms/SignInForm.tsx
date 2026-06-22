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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SignInForm() {
  const signIn = useAuthStore((s) => s.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmedEmail = email.trim();
  const validationError = !isValidEmail(trimmedEmail)
    ? 'Enter a valid email address.'
    : password.length === 0
      ? 'Enter your password.'
      : null;

  const handleSubmit = async () => {
    if (validationError || submitting) return;
    setSubmitting(true);
    try {
      const ok = await signIn(trimmedEmail, password);
      if (ok) {
        Toast.show({ type: 'success', text1: 'Signed in' });
        router.back();
      } else {
        Toast.show({
          type: 'error',
          text1: 'Sign-in failed',
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
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.subheading}>
            Sign in to back up and sync your garden data across devices.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor="#555"
            autoCapitalize="none"
            secureTextEntry
            textContentType="password"
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          {validationError && (email.length > 0 || password.length > 0) && (
            <Text style={styles.validationText}>{validationError}</Text>
          )}

          <Pressable
            style={[styles.submitBtn, (validationError || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!!validationError || submitting}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {submitting ? (
              <ActivityIndicator color="#111" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>Sign in</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.linkBtn}
            onPress={() => router.replace('/(modals)/sign-up')}
            accessibilityRole="button"
            accessibilityLabel="Create an account"
          >
            <Text style={styles.linkText}>Don&apos;t have an account? Create one</Text>
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
