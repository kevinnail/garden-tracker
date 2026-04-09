import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(modals)/add-crop" options={{ presentation: 'modal', title: 'Add Crop', headerStyle: { backgroundColor: '#1a1a1a' }, headerTintColor: '#ddd' }} />
        <Stack.Screen name="(modals)/add-task" options={{ presentation: 'modal', title: 'Add Task', headerStyle: { backgroundColor: '#1a1a1a' }, headerTintColor: '#ddd' }} />
        </Stack>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
