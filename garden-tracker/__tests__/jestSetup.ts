// Globals required by React Native / Expo modules that Jest's node
// environment does not provide.
(global as unknown as Record<string, unknown>).__DEV__ = false;
