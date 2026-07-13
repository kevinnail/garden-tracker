import { create } from 'zustand';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';

/**
 * RevenueCat entitlement that unlocks cloud backup. Must match the entitlement
 * configured in the RevenueCat dashboard AND the server's subscription check
 * (PLAN Slice 7) — the app's local check is only an optimization to avoid a
 * doomed `/sync/*` call; the server is the 403 authority.
 */
export const PREMIUM_ENTITLEMENT = 'premium';

function hasPremium(info: CustomerInfo): boolean {
  return info.entitlements.active[PREMIUM_ENTITLEMENT] != null;
}

export function messageFromPurchaseError(error: unknown): string {
  // With RevenueCat's transfer behavior set to "Keep with original App User ID",
  // a second account trying to buy/restore a subscription that already belongs to
  // another account gets a receipt-in-use error. The SDK's raw message is
  // developer-facing, so map it to something the user can act on.
  const code = (error as { code?: string } | null)?.code;
  if (
    code === PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR ||
    code === PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR
  ) {
    return 'This Apple ID already has a subscription linked to another account. Sign in to that account to use cloud backup.';
  }

  const message = (error as { message?: string } | null)?.message;
  return message && message.length > 0 ? message : 'Something went wrong. Please try again.';
}

interface SubscriptionState {
  isPremium: boolean;
  offering: PurchasesOffering | null;
  error: string | null;
  /** True while a purchase/restore is in flight, so the UI can disable the
   * buttons and show progress. Without this the Subscribe button stays live
   * through the multi-second Apple sheet + receipt validation, and a user whose
   * entitlement hasn't reflected yet taps it again (double-purchase attempt). */
  purchasePending: boolean;
  /** Configure the SDK once and seed entitlement + offering. Called on app start. */
  init: () => Promise<void>;
  /**
   * Associate purchases with the signed-in user, i.e. set RevenueCat's
   * `app_user_id` to the better-auth user id so the purchase's webhook lands on
   * the right `subscriptions` row server-side. Without this the server can never
   * match the purchase to the user and every `/sync/*` stays 403.
   */
  identify: (userId: string) => Promise<void>;
  /** Drop the user association on sign-out. Does NOT touch local data. */
  forget: () => Promise<void>;
  /** Reflect a CustomerInfo into `isPremium` (used by the SDK update listener). */
  applyCustomerInfo: (info: CustomerInfo) => void;
  /** Purchase the premium subscription. Returns true if premium is now active. */
  subscribe: () => Promise<boolean>;
  /** Restore a prior purchase (reinstall / new device). Returns true if premium. */
  restore: () => Promise<boolean>;
}

// Guards configure + listener registration to once per process. Data loads
// (getCustomerInfo/getOfferings) run on every init so a re-init still refreshes.
let configured = false;

// Serializes identify/forget so overlapping session-effect fires can't issue two
// concurrent logIn/logOut calls. The root layout's `useSession` effect can fire
// forget() more than once on a single sign-out (the session ref changes and
// `isPending` toggles); without serialization both calls read isAnonymous() ===
// false before either logOut() lands, and the second logOut() hits the now-
// anonymous user — which the native SDK logs as an error a JS catch can't
// suppress. Chaining onto the tail makes each op see the prior op's final state.
let identityQueue: Promise<void> = Promise.resolve();
function serializeIdentity(operation: () => Promise<void>): Promise<void> {
  identityQueue = identityQueue.then(operation, operation);
  return identityQueue;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isPremium: false,
  offering: null,
  error: null,
  purchasePending: false,

  init: async () => {
    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    if (!apiKey) {
      // No key wired (e.g. a dev build without it). The app stays fully usable
      // offline; cloud backup just stays locked rather than crashing.
      set({ error: 'Subscriptions are not available in this build.' });
      return;
    }

    if (!configured) {
      Purchases.configure({ apiKey });
      Purchases.addCustomerInfoUpdateListener((info) => get().applyCustomerInfo(info));
      configured = true;
    }

    try {
      const [info, offerings] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      set({ isPremium: hasPremium(info), offering: offerings.current ?? null, error: null });
    } catch (error) {
      set({ error: messageFromPurchaseError(error) });
    }
  },

  identify: (userId) =>
    serializeIdentity(async () => {
      try {
        const { customerInfo } = await Purchases.logIn(userId);
        get().applyCustomerInfo(customerInfo);
      } catch (error) {
        set({ error: messageFromPurchaseError(error) });
      }
    }),

  forget: () =>
    serializeIdentity(async () => {
      try {
        // No identified user to drop. Calling logOut while anonymous makes the
        // SDK log an error on every signed-out launch (session is briefly null
        // before it restores), so skip it. Serialization above guarantees a
        // second overlapping forget() sees the first's logOut() already applied.
        if (await Purchases.isAnonymous()) return;
        const info = await Purchases.logOut();
        get().applyCustomerInfo(info);
      } catch {
        // isAnonymous/logOut throw if configure hasn't run yet — safe to ignore.
      }
    }),

  applyCustomerInfo: (info) => {
    set({ isPremium: hasPremium(info) });
  },

  subscribe: async () => {
    const offering = get().offering;
    const pkg = offering?.annual ?? offering?.availablePackages[0];
    if (!pkg) {
      set({ error: 'No subscription is available right now.' });
      return false;
    }

    set({ error: null, purchasePending: true });
    try {
      // Purchasing while the SDK still considers this install anonymous would
      // attach the receipt to the anonymous customer — the webhook then carries
      // an id the server can't match and the payment unlocks nothing. Happens
      // if the buy button is hit before identify()'s logIn has landed.
      if (await Purchases.isAnonymous()) {
        set({ error: 'Your account is still connecting. Wait a moment and try again.' });
        return false;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const premium = hasPremium(customerInfo);
      set({ isPremium: premium });
      return premium;
    } catch (error) {
      // Tapping "Cancel" in the Apple sheet is a normal outcome, not an error.
      if ((error as { userCancelled?: boolean })?.userCancelled) return false;
      set({ error: messageFromPurchaseError(error) });
      return false;
    } finally {
      set({ purchasePending: false });
    }
  },

  restore: async () => {
    set({ error: null, purchasePending: true });
    try {
      // Same guard as subscribe(): a restore by an anonymous customer either
      // fails or associates the receipt where the server can't see it.
      if (await Purchases.isAnonymous()) {
        set({ error: 'Your account is still connecting. Wait a moment and try again.' });
        return false;
      }
      const info = await Purchases.restorePurchases();
      const premium = hasPremium(info);
      set({ isPremium: premium });
      return premium;
    } catch (error) {
      set({ error: messageFromPurchaseError(error) });
      return false;
    } finally {
      set({ purchasePending: false });
    }
  },
}));
