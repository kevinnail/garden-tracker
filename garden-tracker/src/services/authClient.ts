import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

import { getBackendBaseUrl } from '@/src/constants/runtime';

/**
 * better-auth client wired for Expo. The expoClient plugin persists the session
 * cookie in the Keychain/Keystore via expo-secure-store and exposes
 * `authClient.getCookie()` — the seam Slice E will use to attach the session to
 * `/sync/*` requests. better-auth mounts under `/api/auth`, so the base URL is
 * just the server root (reused from the existing runtime config).
 */
export const authClient = createAuthClient({
  baseURL: getBackendBaseUrl(),
  plugins: [
    expoClient({
      scheme: 'cropplanner',
      storagePrefix: 'cropplanner',
      storage: SecureStore,
    }),
  ],
});
