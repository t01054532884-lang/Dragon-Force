import type { ServerSkinState, ServerSpin } from '../data/skinRoulette';
import { PRODUCT_CATEGORY, PURCHASES_ERROR_CODE, Purchases } from '@revenuecat/purchases-capacitor';
import { IAP_PRODUCTS, type ServerGrant } from '../data/iap';
import { cloud } from './Cloud';
import { deliverPending, setPurchaseProvider, type CheckResult, type PurchaseProvider, type StoreProduct } from './Purchases';

// iOS 결제(RevenueCat Capacitor SDK + Firebase 서버 함수) — docs/PAYMENTS.md.
// RevenueCat 앱 사용자 ID = Firebase UID → 서버가 같은 UID로 RevenueCat에 거래를 물어본다(앱이 보낸 영수증·금액은 믿지 않음).
// Cloud.ts가 Firebase 로그인을 마친 뒤에만 불러온다(그래서 cloud.uid가 항상 있다).

type StoreItem = Awaited<ReturnType<typeof Purchases.getProducts>>['products'][number];

let catalog = new Map<string, StoreItem>();
let loading: Promise<void> | null = null;

async function loadCatalog(): Promise<void> {
  loading ??= Purchases.getProducts({ productIdentifiers: IAP_PRODUCTS.map((p) => p.productId), type: PRODUCT_CATEGORY.NON_SUBSCRIPTION })
    .then(({ products }) => {
      catalog = new Map(products.map((p) => [p.identifier, p]));
    })
    .finally(() => (loading = null));
  return loading;
}

const isCancel = (e: unknown) => {
  const x = e as { code?: string | number; userCancelled?: boolean | null };
  return x?.userCancelled === true || String(x?.code) === String(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
};
const isPending = (e: unknown) => String((e as { code?: string | number })?.code) === String(PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR);

const RevenueCatPurchases: PurchaseProvider = {
  available: true,

  async products(): Promise<StoreProduct[]> {
    if (!catalog.size) await loadCatalog();
    return [...catalog.values()].map((p) => ({ productId: p.identifier, priceLabel: p.priceString }));
  },

  async check(productId): Promise<CheckResult> {
    try {
      return await cloud.call<CheckResult>('iapCheck', { productId });
    } catch (e) {
      console.warn('구매 가능 확인 실패', e);
      return { ok: false, reason: navigator.onLine === false ? 'offline' : 'unavailable' };
    }
  },

  async purchase(productId) {
    if (!catalog.has(productId)) await loadCatalog();
    const product = catalog.get(productId);
    if (!product) throw new Error(`스토어에 없는 상품: ${productId}`);
    try {
      await Purchases.purchaseStoreProduct({ product });
      return 'done';
    } catch (e) {
      if (isCancel(e)) return 'cancelled';
      if (isPending(e)) return 'pending';
      throw e;
    }
  },

  async restore() {
    await Purchases.restorePurchases();
  },

  pending: () => cloud.call<ServerGrant[]>('iapSync'),
  ack: async (ids) => {
    await cloud.call('iapAck', { ids });
  },
  skinState: () => cloud.call<ServerSkinState>('skinState'),
  skinSpin: () => cloud.call<ServerSkinState & { spin: ServerSpin }>('skinSpin'),
  skinAck: async (ids) => {
    await cloud.call('skinAck', { ids });
  },
};

/** RevenueCat 시작(Firebase UID로) → 결제 창구 교체 → 못 받은 지급 확인. 계정이 바뀌면 RevenueCat 사용자도 바꾼다 */
export async function installIosPurchases(apiKey: string): Promise<void> {
  await Purchases.configure({ apiKey, appUserID: cloud.uid });
  setPurchaseProvider(RevenueCatPurchases);
  cloud.onUser((uid) => {
    void Purchases.logIn({ appUserID: uid })
      .then(() => deliverPending())
      .catch((e) => console.warn('결제 사용자 전환 실패', e));
  });
  void loadCatalog().catch((e) => console.warn('상품 정보 불러오기 실패', e));
  await deliverPending().catch((e) => console.warn('미지급 확인 실패(다음 실행 때 다시)', e));
}
