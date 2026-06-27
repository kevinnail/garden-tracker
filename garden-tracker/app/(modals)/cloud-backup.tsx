import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/src/store/authStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';

export default function CloudBackupModal() {
  const status = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.email);
  const signOut = useAuthStore((s) => s.signOut);

  const isPremium = useSubscriptionStore((s) => s.isPremium);
  const offering = useSubscriptionStore((s) => s.offering);
  const subError = useSubscriptionStore((s) => s.error);
  const subscribe = useSubscriptionStore((s) => s.subscribe);
  const restore = useSubscriptionStore((s) => s.restore);

  const pkg = offering?.annual ?? offering?.availablePackages[0];
  const price = pkg?.product?.priceString;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Cloud Backup</Text>
        <Text style={styles.subheading}>
          Back up your garden data and sync it across your devices.
        </Text>

        {status === 'signed-in' ? (
          <>
            <View style={styles.accountBox}>
              <Text style={styles.accountLabel}>Signed in as</Text>
              <Text style={styles.accountEmail}>{email}</Text>
            </View>

            {isPremium ? (
              <View style={styles.activeBox}>
                <Text style={styles.activeTitle}>Cloud backup is active ✓</Text>
                <Text style={styles.activeSub}>Your data syncs across your devices.</Text>
              </View>
            ) : (
              <View style={styles.paywallBox}>
                <Text style={styles.paywallTitle}>Enable cloud backup</Text>
                <Text style={styles.paywallSub}>
                  Subscribe to back up and sync your garden{price ? ` — ${price}/year` : ''}.
                </Text>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => subscribe()}
                  accessibilityRole="button"
                  accessibilityLabel="Subscribe"
                >
                  <Text style={styles.primaryBtnText}>
                    {price ? `Subscribe — ${price}/year` : 'Subscribe'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.linkBtn}
                  onPress={() => restore()}
                  accessibilityRole="button"
                  accessibilityLabel="Restore purchases"
                >
                  <Text style={styles.linkBtnText}>Restore purchases</Text>
                </Pressable>
                {subError ? <Text style={styles.errorText}>{subError}</Text> : null}
              </View>
            )}

            <Pressable
              style={styles.secondaryBtn}
              onPress={() => signOut()}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Text style={styles.secondaryBtnText}>Sign out</Text>
            </Pressable>
          </>
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

  activeBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2e4a38',
    borderRadius: 10,
    backgroundColor: '#1c2920',
    padding: 14,
    gap: 4,
  },
  activeTitle: { color: '#7dcea0', fontSize: 15, fontWeight: '700' },
  activeSub: { color: '#9bbfa8', fontSize: 13 },

  paywallBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#4a4a4a',
    borderRadius: 10,
    backgroundColor: '#262626',
    padding: 14,
    gap: 8,
  },
  paywallTitle: { color: '#eee', fontSize: 16, fontWeight: '700' },
  paywallSub: { color: '#999', fontSize: 13, lineHeight: 18, marginBottom: 4 },

  linkBtn: { paddingVertical: 8, alignItems: 'center' },
  linkBtnText: { color: '#7dcea0', fontSize: 14, fontWeight: '600' },

  errorText: { color: '#e06666', fontSize: 13, marginTop: 4 },
});
