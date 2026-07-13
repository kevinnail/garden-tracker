import {
  useSubscriptionStore,
  messageFromPurchaseError,
  PREMIUM_ENTITLEMENT,
} from '@/src/store/subscriptionStore';
import Purchases from 'react-native-purchases';

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    logIn: jest.fn(),
    logOut: jest.fn(),
    isAnonymous: jest.fn(),
  },
  PURCHASES_ERROR_CODE: {
    RECEIPT_ALREADY_IN_USE_ERROR: '7',
    RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR: '13',
  },
}));

const getCustomerInfoMock = Purchases.getCustomerInfo as unknown as jest.Mock;
const getOfferingsMock = Purchases.getOfferings as unknown as jest.Mock;
const purchasePackageMock = Purchases.purchasePackage as unknown as jest.Mock;
const restorePurchasesMock = Purchases.restorePurchases as unknown as jest.Mock;
const logInMock = Purchases.logIn as unknown as jest.Mock;
const logOutMock = Purchases.logOut as unknown as jest.Mock;
const isAnonymousMock = Purchases.isAnonymous as unknown as jest.Mock;

// Minimal CustomerInfo shapes — only the entitlements the store reads.
const premiumInfo = {
  entitlements: { active: { [PREMIUM_ENTITLEMENT]: { identifier: PREMIUM_ENTITLEMENT } } },
} as never;
const freeInfo = { entitlements: { active: {} } } as never;

const annualPackage = { identifier: '$rc_annual', product: { priceString: '$11.99' } } as never;
const offering = { annual: annualPackage, availablePackages: [annualPackage] } as never;

function resetStore() {
  useSubscriptionStore.setState({ isPremium: false, offering: null, error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_test_key';
  // Default to an identified user; the anonymous-guard tests override this.
  isAnonymousMock.mockResolvedValue(false);
});

describe('messageFromPurchaseError', () => {
  it('prefers the error message, falls back to a generic one', () => {
    expect(messageFromPurchaseError({ message: 'Network down' })).toBe('Network down');
    expect(messageFromPurchaseError(null)).toBe('Something went wrong. Please try again.');
  });

  it('maps the receipt-in-use codes to an actionable message (overriding the raw SDK text)', () => {
    const expected =
      'This Apple ID already has a subscription linked to another account. Sign in to that account to use cloud backup.';
    // Code 7 also carries a raw developer-facing message — the mapping must win.
    expect(messageFromPurchaseError({ code: '7', message: 'The receipt is already in use.' })).toBe(
      expected,
    );
    expect(messageFromPurchaseError({ code: '13' })).toBe(expected);
  });
});

describe('subscriptionStore.applyCustomerInfo', () => {
  it('sets isPremium true when the premium entitlement is active', () => {
    useSubscriptionStore.getState().applyCustomerInfo(premiumInfo);
    expect(useSubscriptionStore.getState().isPremium).toBe(true);
  });

  it('sets isPremium false when no entitlement is active', () => {
    useSubscriptionStore.setState({ isPremium: true });
    useSubscriptionStore.getState().applyCustomerInfo(freeInfo);
    expect(useSubscriptionStore.getState().isPremium).toBe(false);
  });
});

describe('subscriptionStore.init', () => {
  it('seeds isPremium and the current offering from the SDK', async () => {
    getCustomerInfoMock.mockResolvedValue(premiumInfo);
    getOfferingsMock.mockResolvedValue({ current: offering });

    await useSubscriptionStore.getState().init();

    expect(useSubscriptionStore.getState()).toMatchObject({
      isPremium: true,
      offering,
      error: null,
    });
  });

  it('sets an error and does not configure when no API key is present', async () => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

    await useSubscriptionStore.getState().init();

    expect(getCustomerInfoMock).not.toHaveBeenCalled();
    expect(useSubscriptionStore.getState()).toMatchObject({ isPremium: false });
    expect(useSubscriptionStore.getState().error).toMatch(/not available/i);
  });
});

describe('subscriptionStore.identify', () => {
  it('logs in with the better-auth user id and applies the returned entitlement', async () => {
    logInMock.mockResolvedValue({ customerInfo: premiumInfo, created: false });

    await useSubscriptionStore.getState().identify('user-123');

    expect(logInMock).toHaveBeenCalledWith('user-123');
    expect(useSubscriptionStore.getState().isPremium).toBe(true);
  });
});

describe('subscriptionStore.forget', () => {
  it('skips logOut when the user is already anonymous (avoids the SDK error log)', async () => {
    isAnonymousMock.mockResolvedValue(true);

    await useSubscriptionStore.getState().forget();

    expect(logOutMock).not.toHaveBeenCalled();
  });

  it('logs out and applies the resulting anonymous CustomerInfo when a user is identified', async () => {
    isAnonymousMock.mockResolvedValue(false);
    logOutMock.mockResolvedValue(freeInfo);
    useSubscriptionStore.setState({ isPremium: true });

    await useSubscriptionStore.getState().forget();

    expect(logOutMock).toHaveBeenCalled();
    expect(useSubscriptionStore.getState().isPremium).toBe(false);
  });

  it('serializes overlapping calls so logOut runs once (no anonymous-user error)', async () => {
    // The root-layout session effect can fire forget() twice on one sign-out.
    // isAnonymous reports the identified user first, then anonymous after the
    // first logOut lands — the second call must see that and skip logOut.
    let identified = true;
    isAnonymousMock.mockImplementation(async () => !identified);
    logOutMock.mockImplementation(async () => {
      identified = false;
      return freeInfo;
    });

    await Promise.all([
      useSubscriptionStore.getState().forget(),
      useSubscriptionStore.getState().forget(),
    ]);

    expect(logOutMock).toHaveBeenCalledTimes(1);
  });
});

describe('subscriptionStore.subscribe', () => {
  it('purchases the annual package and flips isPremium on success', async () => {
    useSubscriptionStore.setState({ offering });
    purchasePackageMock.mockResolvedValue({ customerInfo: premiumInfo });

    const ok = await useSubscriptionStore.getState().subscribe();

    expect(ok).toBe(true);
    expect(purchasePackageMock).toHaveBeenCalledWith(annualPackage);
    expect(useSubscriptionStore.getState().isPremium).toBe(true);
  });

  it('treats a user cancellation as a quiet no-op (no error, stays not premium)', async () => {
    useSubscriptionStore.setState({ offering });
    purchasePackageMock.mockRejectedValue({ userCancelled: true });

    const ok = await useSubscriptionStore.getState().subscribe();

    expect(ok).toBe(false);
    expect(useSubscriptionStore.getState()).toMatchObject({ isPremium: false, error: null });
  });

  it('surfaces the error on a real purchase failure', async () => {
    useSubscriptionStore.setState({ offering });
    purchasePackageMock.mockRejectedValue({ message: 'The App Store is unavailable.' });

    const ok = await useSubscriptionStore.getState().subscribe();

    expect(ok).toBe(false);
    expect(useSubscriptionStore.getState().error).toBe('The App Store is unavailable.');
  });

  it('fails with an error when no offering/package is available', async () => {
    const ok = await useSubscriptionStore.getState().subscribe();

    expect(ok).toBe(false);
    expect(purchasePackageMock).not.toHaveBeenCalled();
    expect(useSubscriptionStore.getState().error).toMatch(/no subscription/i);
  });

  it('refuses to purchase while RevenueCat still considers the install anonymous', async () => {
    // Guards the server contract: a purchase made before identify()'s logIn
    // lands would attach the receipt to an anonymous customer, whose webhooks
    // the server ignores — the user would pay and unlock nothing.
    useSubscriptionStore.setState({ offering });
    isAnonymousMock.mockResolvedValue(true);

    const ok = await useSubscriptionStore.getState().subscribe();

    expect(ok).toBe(false);
    expect(purchasePackageMock).not.toHaveBeenCalled();
    expect(useSubscriptionStore.getState().error).toMatch(/still connecting/i);
    expect(useSubscriptionStore.getState().purchasePending).toBe(false);
  });
});

describe('subscriptionStore.restore', () => {
  it('returns true and flips isPremium when a prior purchase is restored', async () => {
    restorePurchasesMock.mockResolvedValue(premiumInfo);

    const ok = await useSubscriptionStore.getState().restore();

    expect(ok).toBe(true);
    expect(useSubscriptionStore.getState().isPremium).toBe(true);
  });

  it('returns false when there is nothing to restore', async () => {
    restorePurchasesMock.mockResolvedValue(freeInfo);

    const ok = await useSubscriptionStore.getState().restore();

    expect(ok).toBe(false);
    expect(useSubscriptionStore.getState().isPremium).toBe(false);
  });

  it('surfaces the error when restore fails', async () => {
    restorePurchasesMock.mockRejectedValue({ message: 'Restore failed' });

    const ok = await useSubscriptionStore.getState().restore();

    expect(ok).toBe(false);
    expect(useSubscriptionStore.getState().error).toBe('Restore failed');
  });

  it('refuses to restore while RevenueCat still considers the install anonymous', async () => {
    isAnonymousMock.mockResolvedValue(true);

    const ok = await useSubscriptionStore.getState().restore();

    expect(ok).toBe(false);
    expect(restorePurchasesMock).not.toHaveBeenCalled();
    expect(useSubscriptionStore.getState().error).toMatch(/still connecting/i);
    expect(useSubscriptionStore.getState().purchasePending).toBe(false);
  });
});
