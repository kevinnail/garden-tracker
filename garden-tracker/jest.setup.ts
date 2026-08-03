// Globals required by React Native / Expo modules that Jest's node
// environment does not provide.
(global as unknown as Record<string, unknown>).__DEV__ = false;

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        backendTarget: 'local',
        apiBaseUrlLocal: 'http://localhost:7890',
        apiBaseUrlRailway: 'https://example.up.railway.app',
      },
    },
  },
}));
