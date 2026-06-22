import { create } from 'zustand';

import { authClient } from '@/src/services/authClient';

export type AuthStatus = 'signed-out' | 'signed-in';

interface AuthState {
  status: AuthStatus;
  email: string | null;
  error: string | null;
  /** Create an account. Returns true on success, false on failure (error set). */
  signUp: (email: string, password: string) => Promise<boolean>;
  /** Sign in to an existing account. Returns true on success, false on failure (error set). */
  signIn: (email: string, password: string) => Promise<boolean>;
  /** Send a password-reset email. Returns true on success, false on failure (error set). */
  requestPasswordReset: (email: string) => Promise<boolean>;
  /** Apply a reset token + new password. Returns true on success, false on failure (error set). */
  resetPassword: (token: string, newPassword: string) => Promise<boolean>;
}

/**
 * `name` is a non-removable core field in better-auth (signUpEmail requires it),
 * but this product never uses it: nothing renders it and it must not be treated
 * as meaningful data anywhere (including sync payloads). We derive a placeholder
 * from the email local-part purely to satisfy the auth library.
 */
function deriveName(email: string): string {
  const local = email.split('@')[0]?.trim();
  return local && local.length > 0 ? local : email;
}

export function messageFromAuthError(
  error: { message?: string; status?: number } | null | undefined,
): string {
  if (error?.message && error.message.length > 0) return error.message;
  return 'Something went wrong. Please try again.';
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'signed-out',
  email: null,
  error: null,

  signUp: async (email, password) => {
    const trimmed = email.trim();
    set({ error: null });

    const { data, error } = await authClient.signUp.email({
      email: trimmed,
      password,
      // name is required by better-auth but unused by this product — derived
      // from the email local-part as a placeholder.
      name: deriveName(trimmed),
    });

    if (error || !data) {
      set({ status: 'signed-out', email: null, error: messageFromAuthError(error) });
      return false;
    }

    set({ status: 'signed-in', email: trimmed, error: null });
    return true;
  },

  signIn: async (email, password) => {
    const trimmed = email.trim();
    set({ error: null });

    const { data, error } = await authClient.signIn.email({ email: trimmed, password });

    if (error || !data) {
      set({ status: 'signed-out', email: null, error: messageFromAuthError(error) });
      return false;
    }

    set({ status: 'signed-in', email: trimmed, error: null });
    return true;
  },

  requestPasswordReset: async (email) => {
    set({ error: null });

    // The server supplies the callbackURL (cropplanner://reset-password) via its
    // sendResetPassword config, so the client does not pass redirectTo.
    const { error } = await authClient.requestPasswordReset({ email: email.trim() });

    if (error) {
      set({ error: messageFromAuthError(error) });
      return false;
    }
    return true;
  },

  resetPassword: async (token, newPassword) => {
    set({ error: null });

    const { error } = await authClient.resetPassword({ newPassword, token });

    if (error) {
      set({ error: messageFromAuthError(error) });
      return false;
    }
    return true;
  },
}));
