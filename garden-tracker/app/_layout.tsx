import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useWeatherStore } from '@/src/store/weatherStore';
import { useAuthStore } from '@/src/store/authStore';
import { authClient } from '@/src/services/authClient';

export default function RootLayout() {
  const loadWeather = useWeatherStore((s) => s.load);
  useEffect(() => {
    loadWeather().catch(() => {});
  }, [loadWeather]);

  // Mirror the better-auth session into the store. The Expo client fires one
  // /get-session per launch on mount; useSession reads that result (and any
  // later sign-in/out) — we do NOT add a second getSession() call.
  const setSession = useAuthStore((s) => s.setSession);
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    if (isPending) return;
    setSession(session ?? null);
  }, [session, isPending, setSession]);

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
