import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useWeatherStore } from '@/src/store/weatherStore';
import { useAuthStore } from '@/src/store/authStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { authClient } from '@/src/services/authClient';

export default function RootLayout() {
  const loadWeather = useWeatherStore((s) => s.load);
  const initSubscriptions = useSubscriptionStore((s) => s.init);

  useEffect(() => {
    loadWeather().catch(() => {});
    // Configure RevenueCat once at startup and seed the entitlement/offering.
    initSubscriptions().catch(() => {});
  }, [loadWeather, initSubscriptions]);

  // Mirror the better-auth session into the store. The Expo client fires one
  // /get-session per launch on mount; useSession reads that result (and any
  // later sign-in/out) — we do NOT add a second getSession() call.
  const setSession = useAuthStore((s) => s.setSession);
  const identify = useSubscriptionStore((s) => s.identify);
  const forget = useSubscriptionStore((s) => s.forget);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    setSession(session ?? null);
    // Keep RevenueCat's app_user_id in lockstep with the auth session so a
    // purchase attributes to the right user (and the server can match it).
    const userId = session?.user?.id;
    if (userId) identify(userId).catch(() => {});
    else forget().catch(() => {});
  }, [session, isPending, setSession, identify, forget]);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="(modals)/add-crop"
            options={{
              presentation: 'modal',
              title: 'Add Crop',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/edit-crop"
            options={{
              presentation: 'modal',
              title: 'Edit Crop',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/add-task"
            options={{
              presentation: 'modal',
              title: 'Add Task',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/manage-tasks"
            options={{
              presentation: 'modal',
              title: 'Manage Tasks',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/add-location"
            options={{
              presentation: 'modal',
              title: 'Setup Locations',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/add-garden"
            options={{
              presentation: 'modal',
              title: 'Setup Locations',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/cell-note"
            options={{
              presentation: 'modal',
              title: 'Weekly Note',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/cloud-backup"
            options={{
              presentation: 'modal',
              title: 'Cloud Backup',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/sign-up"
            options={{
              presentation: 'modal',
              title: 'Create Account',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/sign-in"
            options={{
              presentation: 'modal',
              title: 'Sign In',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/forgot-password"
            options={{
              presentation: 'modal',
              title: 'Reset Password',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
          <Stack.Screen
            name="(modals)/reset-password"
            options={{
              presentation: 'modal',
              title: 'Set New Password',
              headerStyle: { backgroundColor: '#111111' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: '800' },
            }}
          />
        </Stack>
        <StatusBar style="light" />
        <Toast />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
