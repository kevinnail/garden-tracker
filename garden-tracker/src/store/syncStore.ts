import { create } from 'zustand';

import { ApiClientError } from '@/src/services/apiClient';
import { runSync } from '@/src/services/syncClient';
import { useAuthStore } from '@/src/store/authStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { usePlannerStore } from '@/src/store/plannerStore';

export type SyncStatus = 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  /**
   * Push-then-pull one sync event. No-ops unless signed in AND subscribed (the
   * server gates `/sync/*` on both, so an unentitled call is a guaranteed 403).
   * Safe to call from any trigger — foreground, post-login, or the manual
   * button — and re-entrant calls while a sync is in flight are ignored.
   */
  syncNow: () => Promise<void>;
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

  syncNow: async () => {
    if (get().status === 'syncing') return;

    const signedIn = useAuthStore.getState().status === 'signed-in';
    const isPremium = useSubscriptionStore.getState().isPremium;
    if (!signedIn || !isPremium) return;

    set({ status: 'syncing', error: null });
    try {
      const { lastSyncAt } = await runSync();
      set({ status: 'idle', lastSyncedAt: lastSyncAt, error: null });
      // Reflect pulled server state in the grid.
      await usePlannerStore.getState().loadData();
    } catch (error) {
      set({ status: 'error', error: messageForError(error) });
    }
  },
}));
