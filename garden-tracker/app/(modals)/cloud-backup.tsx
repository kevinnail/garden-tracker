import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/src/store/authStore';

export default function CloudBackupModal() {
  const status = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.email);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Cloud Backup</Text>
        <Text style={styles.subheading}>
          Back up your garden data and sync it across your devices.
        </Text>

        {status === 'signed-in' ? (
          <View style={styles.accountBox}>
            <Text style={styles.accountLabel}>Signed in as</Text>
            <Text style={styles.accountEmail}>{email}</Text>
          </View>
        ) : (
          <>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push('/(modals)/sign-up')}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              <Text style={styles.primaryBtnText}>Create account</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => router.push('/(modals)/sign-in')}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.secondaryBtnText}>Sign in</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  content: { padding: 16, gap: 6 },

  heading: { color: '#eee', fontSize: 22, fontWeight: '800', marginBottom: 2 },
  subheading: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 20 },

  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#2ecc71',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#111', fontWeight: '700', fontSize: 15 },

  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a4a4a',
    backgroundColor: '#262626',
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#ddd', fontWeight: '600', fontSize: 15 },

  accountBox: {
    borderWidth: 1,
    borderColor: '#2e4a38',
    borderRadius: 10,
    backgroundColor: '#1c2920',
    padding: 14,
    gap: 4,
  },
  accountLabel: { color: '#7dcea0', fontSize: 12, fontWeight: '600' },
  accountEmail: { color: '#eee', fontSize: 15, fontWeight: '700' },
});
