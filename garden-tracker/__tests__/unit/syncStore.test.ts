import { useSyncStore } from '@/src/store/syncStore';
import { useAuthStore } from '@/src/store/authStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { runSync } from '@/src/services/syncClient';
import { ApiClientError } from '@/src/services/apiClient';

jest.mock('@/src/services/syncClient', () => ({ runSync: jest.fn() }));
// authStore/subscriptionStore only touch these deps inside actions; stubbing at
// import keeps better-auth / RevenueCat native modules out of the node runtime.
jest.mock('@/src/services/authClient', () => ({ authClient: {} }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

const mockLoadData = jest.fn();
jest.mock('@/src/store/plannerStore', () => ({
  usePlannerStore: { getState: () => ({ loadData: mockLoadData }) },
}));

const runSyncMock = runSync as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useSyncStore.setState({ status: 'idle', lastSyncedAt: null, error: null });
  useAuthStore.setState({ status: 'signed-out', email: null, error: null });
  useSubscriptionStore.setState({ isPremium: false });
});

describe('syncStore.syncNow gating', () => {
  it('no-ops when signed out', async () => {
    useSubscriptionStore.setState({ isPremium: true });
    await useSyncStore.getState().syncNow();
    expect(runSyncMock).not.toHaveBeenCalled();
    expect(useSyncStore.getState().status).toBe('idle');
  });

  it('no-ops when signed in but not subscribed', async () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co' });
    await useSyncStore.getState().syncNow();
    expect(runSyncMock).not.toHaveBeenCalled();
  });

  it('no-ops when a sync is already in flight', async () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co' });
    useSubscriptionStore.setState({ isPremium: true });
    useSyncStore.setState({ status: 'syncing' });
    await useSyncStore.getState().syncNow();
    expect(runSyncMock).not.toHaveBeenCalled();
  });
});

describe('syncStore.syncNow when entitled', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co' });
    useSubscriptionStore.setState({ isPremium: true });
  });

  it('runs the sync, records lastSyncedAt, and refreshes the planner', async () => {
    runSyncMock.mockResolvedValue({ lastSyncAt: '2026-06-30T12:00:00.000Z' });

    await useSyncStore.getState().syncNow();

    expect(runSyncMock).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().status).toBe('idle');
    expect(useSyncStore.getState().lastSyncedAt).toBe('2026-06-30T12:00:00.000Z');
    expect(useSyncStore.getState().error).toBeNull();
    expect(mockLoadData).toHaveBeenCalledTimes(1);
  });

  it('surfaces a subscription message on a 403 and does not refresh the planner', async () => {
    runSyncMock.mockRejectedValue(new ApiClientError('Subscription required', 'forbidden', 403));

    await useSyncStore.getState().syncNow();

    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().error).toMatch(/subscription/i);
    expect(mockLoadData).not.toHaveBeenCalled();
  });

  it('surfaces a retry message on a network failure', async () => {
    runSyncMock.mockRejectedValue(new ApiClientError('offline', 'network'));

    await useSyncStore.getState().syncNow();

    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().error).toMatch(/network/i);
  });
});
