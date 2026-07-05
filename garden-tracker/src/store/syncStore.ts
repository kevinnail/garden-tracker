import { create } from 'zustand';

import { ApiClientError } from '@/src/services/apiClient';
import { runSync } from '@/src/services/syncClient';
import { useAuthStore } from '@/src/store/authStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { usePlannerStore } from '@/src/store/plannerStore';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncOptions {
  /**
   * A background trigger (post-login, foreground) rather than a user tap. Silent
   * syncs retry transient failures and never paint a visible error: right after
   * sign-in the client races ahead of the backend — the session cookie may not be
   * attached yet (401) or the server may not have recorded the entitlement yet
   * (403) — and surfacing that as red error text contradicts reality, since the
   * very next attempt succeeds. Manual (button) syncs stay loud so a user who
   * asked for a sync gets immediate feedback.
   */
  silent?: boolean;
}

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  /**
   * Push-then-pull one sync event. No-ops unless signed in AND subscribed (the
   * server gates `/sync/*` on both, so an unentitled call is a guaranteed 403).
   * Safe to call from any trigger — foreground, post-login, or the manual
   * button — and re-entrant calls while a sync is in flight are ignored. Pass
   * `{ silent: true }` for background triggers (see SyncOptions.silent).
   */
  syncNow: (options?: SyncOptions) => Promise<void>;
}

// Transient failures a background sync should ride out: the client is briefly
// ahead of the backend after sign-in, or the network blipped. A short retry
// closes the gap without ever showing the user a self-correcting error.
const SILENT_SYNC_ATTEMPTS = 3;
const SILENT_SYNC_RETRY_MS = 2000;

function isTransientError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.kind === 'unauthorized' || error.kind === 'forbidden' || error.kind === 'network')
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function messageForError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.kind === 'forbidden') return 'A subscription is required to back up your garden.';
    if (error.kind === 'unauthorized') return 'Please sign in again to sync.';
    if (error.kind === 'network') return 'Network unavailable — sync will retry later.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Sync failed.';
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  lastSyncedAt: null,
  error: null,

  syncNow: async (options) => {
    if (get().status === 'syncing') return;

    const signedIn = useAuthStore.getState().status === 'signed-in';
    const isPremium = useSubscriptionStore.getState().isPremium;
    if (!signedIn || !isPremium) return;

    const silent = options?.silent ?? false;
    const attempts = silent ? SILENT_SYNC_ATTEMPTS : 1;

    set({ status: 'syncing', error: null });
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const { lastSyncAt } = await runSync();
        set({ status: 'idle', lastSyncedAt: lastSyncAt, error: null });
        // Reflect pulled server state in the grid.
        await usePlannerStore.getState().loadData();
        return;
      } catch (error) {
        // Background sync: retry a transient failure, then give up quietly and
        // let a later trigger (foreground, or the manual button) try again.
        if (silent && isTransientError(error)) {
          if (attempt < attempts) {
            await delay(SILENT_SYNC_RETRY_MS);
            continue;
          }
          set({ status: 'idle', error: null });
          return;
        }
        set({ status: 'error', error: messageForError(error) });
        return;
      }
    }
  },
}));
