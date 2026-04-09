import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ title: 'Planner' }} />
      <Tabs.Screen name="today" options={{ title: 'Today', href: null }} />
    </Tabs>
  );
}
