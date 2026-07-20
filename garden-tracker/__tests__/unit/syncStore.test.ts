import { useSyncStore } from '@/src/store/syncStore';
import { useAuthStore } from '@/src/store/authStore';
import { useSubscriptionStore } from '@/src/store/subscriptionStore';
import { runSync, SyncAccountMismatchError } from '@/src/services/syncClient';
import { ApiClientError } from '@/src/services/apiClient';

jest.mock('@/src/services/syncClient', () => ({
  runSync: jest.fn(),
  SyncAccountMismatchError: class SyncAccountMismatchError extends Error {
    constructor() {
      super('This device holds data backed up by a different account.');
      this.name = 'SyncAccountMismatchError';
    }
  },
}));
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
  useAuthStore.setState({ status: 'signed-out', email: null, userId: null, error: null });
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
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co', userId: 'user-1' });
    await useSyncStore.getState().syncNow();
    expect(runSyncMock).not.toHaveBeenCalled();
  });

  it('no-ops while the session user id has not loaded yet', async () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co', userId: null });
    useSubscriptionStore.setState({ isPremium: true });
    await useSyncStore.getState().syncNow();
    expect(runSyncMock).not.toHaveBeenCalled();
    expect(useSyncStore.getState().status).toBe('idle');
  });

  it('no-ops when a sync is already in flight', async () => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co', userId: 'user-1' });
    useSubscriptionStore.setState({ isPremium: true });
    useSyncStore.setState({ status: 'syncing' });
    await useSyncStore.getState().syncNow();
    expect(runSyncMock).not.toHaveBeenCalled();
  });
});

describe('syncStore.syncNow when entitled', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co', userId: 'user-1' });
    useSubscriptionStore.setState({ isPremium: true });
  });

  it('runs the sync for the signed-in account, records lastSyncedAt, and refreshes the planner', async () => {
    runSyncMock.mockResolvedValue({ lastSyncAt: '2026-06-30T12:00:00.000Z' });

    await useSyncStore.getState().syncNow();

    expect(runSyncMock).toHaveBeenCalledTimes(1);
    expect(runSyncMock).toHaveBeenCalledWith('user-1');
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

  it('surfaces the account-mismatch message, flags it, and does not refresh the planner', async () => {
    runSyncMock.mockRejectedValue(new SyncAccountMismatchError());

    await useSyncStore.getState().syncNow();

    expect(useSyncStore.getState().status).toBe('error');
    expect(useSyncStore.getState().error).toMatch(/different account/i);
    expect(useSyncStore.getState().accountMismatch).toBe(true);
    expect(mockLoadData).not.toHaveBeenCalled();
  });

  it('clears the account-mismatch flag on a subsequent successful sync', async () => {
    useSyncStore.setState({ accountMismatch: true });
    runSyncMock.mockResolvedValue({ lastSyncAt: '2026-07-01T00:00:00.000Z' });

    await useSyncStore.getState().syncNow();

    expect(useSyncStore.getState().status).toBe('idle');
    expect(useSyncStore.getState().accountMismatch).toBe(false);
  });
});

describe('syncStore.syncNow silent (background triggers)', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'signed-in', email: 'a@b.co', userId: 'user-1' });
    useSubscriptionStore.setState({ isPremium: true });
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a transient 401 and succeeds without ever showing an error', async () => {
    // The post-login race: cookie not attached on the first attempt, then it is.
    runSyncMock
      .mockRejectedValueOnce(new ApiClientError('Unauthorized', 'unauthorized', 401))
      .mockResolvedValueOnce({ lastSyncAt: '2026-07-03T16:00:00.000Z' });

    const pending = useSyncStore.getState().syncNow({ silent: true });
    await jest.runAllTimersAsync();
    await pending;

    expect(runSyncMock).toHaveBeenCalledTimes(2);
    expect(useSyncStore.getState().status).toBe('idle');
    expect(useSyncStore.getState().lastSyncedAt).toBe('2026-07-03T16:00:00.000Z');
    expect(useSyncStore.getState().error).toBeNull();
  });

  it('gives up quietly (no error text) when a transient failure persists', async () => {
    runSyncMock.mockRejectedValue(new ApiClientError('Subscription required', 'forbidden', 403));

    const pending = useSyncStore.getState().syncNow({ silent: true });
    await jest.runAllTimersAsync();
    await pending;

    expect(runSyncMock).toHaveBeenCalledTimes(3);
    expect(useSyncStore.getState().status).toBe('idle');
    expect(useSyncStore.getState().error).toBeNull();
  });

  it('still surfaces a non-transient failure even when silent', async () => {
    runSyncMock.mockRejectedValue(new ApiClientError('boom', 'server', 500));

    const pending = useSyncStore.getState().syncNow({ silent: true });
    await jest.runAllTimersAsync();
    await pending;

    expect(runSyncMock).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().status).toBe('error');
  });
});
