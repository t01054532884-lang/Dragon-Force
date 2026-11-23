import { DEALS, FREE_DAILY_GIFT, PACKAGES, RUBY_PRODUCTS, type PackageDef } from '../data/economy';
import { iapProduct, passSeasonOf, type IapGrant, type ServerGrant } from '../data/iap';
import { grantVerifiedPass } from './Pass';
import { grantVerifiedSkinKeys } from './Skins';
import { dealPeriodKey, Progress, withTx, type PlayerProgress, type Result } from './Progress';

// 인앱결제(제작자 결정 2026-11-20: Firebase + RevenueCat — docs/PAYMENTS.md).
// 흐름: ① 서버에 "살 수 있나"(기간·계정당 횟수) 확인 → ② App Store 결제(RevenueCat) → ③ 서버가 RevenueCat에 거래를 확인하고
// 장부(purchases/{스토어_거래ID})에 적음 → ④ 앱은 서버가 돌려준 "아직 안 받은 지급"만 반영 → ⑤ 받았다고 서버에 알림(ack).
// 앱이 꺼져 ④·⑤를 못 했으면 다음 실행·구매 복원 때 서버가 다시 돌려준다(같은 거래는 거래 ID로 한 번만 반영).
// 웹·토스·데모·서버 설정 전에는 NoPurchases(결제 없음) → 상점은 "App Store 앱에서" 안내.

/** 스토어가 알려 주는 상품 가격(₩5,900 등 현지 문자열) */
export interface StoreProduct {
  productId: string;
  priceLabel: string;
}
/** 예전 이름(루비 충전 창) */
export type RubyProduct = StoreProduct;

export type CheckResult = { ok: true } | { ok: false; reason: 'limit' | 'owned' | 'product' | 'unavailable' | 'offline' };

export interface PurchaseProvider {
  /** 이 플랫폼에서 결제를 쓸 수 있나 */
  readonly available: boolean;
  products(): Promise<StoreProduct[]>;
  /** 서버: 지금 살 수 있나(기간·계정당 구매 횟수) */
  check(productId: string): Promise<CheckResult>;
  /** 스토어 결제 창. 끝나면 'done', 사용자가 닫으면 'cancelled', 보호자 승인 대기 등은 'pending' */
  purchase(productId: string): Promise<'done' | 'cancelled' | 'pending'>;
  /** 스토어 구매 복원(애플 필수 버튼) */
  restore(): Promise<void>;
  /** 서버: RevenueCat 거래 확인 → 장부 기록 → 아직 앱에 지급하지 않은 것 */
  pending(): Promise<ServerGrant[]>;
  /** 서버: 앱에 지급(저장) 끝났음 */
  ack(ids: string[]): Promise<void>;
}

/** 결제 없음(웹·토스·데모·서버 설정 전) */
export const NoPurchases: PurchaseProvider = {
  available: false,
  products: async () => [],
  check: async () => ({ ok: false, reason: 'unavailable' }),
  purchase: async () => 'cancelled',
  restore: async () => {},
  pending: async () => [],
  ack: async () => {},
};

export let purchases: PurchaseProvider = NoPurchases;
/** 플랫폼 초기화(iOS + Firebase 연결)에서 RevenueCat 구현으로 바꿔 끼운다 */
export const setPurchaseProvider = (p: PurchaseProvider) => (purchases = p);

/** 서버가 검증한 거래만 루비로 지급. 같은 거래 ID는 한 번만(재시도·중복 요청 방지). */
export function grantVerifiedRubies(p: PlayerProgress, transactionId: string, rubies: number): Result {
  if (!Number.isInteger(rubies) || rubies <= 0) return { ok: false, reason: 'amount' };
  if (RUBY_PRODUCTS.length === 0) return { ok: false, reason: 'disabled' };
  return withTx(p, `iap:${transactionId}`, () => ({ ok: true, progress: { ...p, rubies: p.rubies + rubies } }));
}

const allPackages = (): PackageDef[] => [...PACKAGES, ...DEALS];

/** 이번 기간(한정은 계정 전체)에 이 상품을 산 횟수 — 상점 기록 shopLog에서 센다(화면 표시용, 최종 확인은 서버) */
export function packageBought(p: PlayerProgress, productId: string, now = Date.now()): number {
  const def = allPackages().find((x) => x.productId === productId);
  const key = `${productId}@${dealPeriodKey(def?.period ?? 'once', now)}#`;
  return p.shopLog.filter((t) => t.startsWith(key)).length;
}

/**
 * 검증된 패키지·특혜 거래 지급(루비·골드·개봉권). 같은 거래 ID는 한 번만.
 * enforceLimit: 앱 기록으로 기간마다 limit회 확인(테스트·예전 경로). 서버가 이미 확인한 지급은 false(돈을 낸 결제는 반드시 지급).
 * at: 구매 시각(shopLog의 기간 키 — 자정 직전 결제가 다음 날 반영돼도 산 날로 센다).
 */
export function grantVerifiedPackage(p: PlayerProgress, transactionId: string, productId: string, now = Date.now(), enforceLimit = true, at = now): Result {
  const def = allPackages().find((x) => x.productId === productId);
  if (!def) return { ok: false, reason: 'product' };
  if (enforceLimit && packageBought(p, productId, now) >= def.limit) return { ok: false, reason: 'limit' };
  return withTx(p, `pkg:${productId}:${transactionId}`, () => ({
    ok: true,
    progress: {
      ...addGrant(p, { rubies: def.rubies ?? 0, gold: def.gold ?? 0, dragonTickets: def.dragonTickets ?? 0, equipTickets: def.equipTickets ?? 0, runeTickets: def.runeTickets ?? 0 }),
      shopLog: [...p.shopLog, `${productId}@${dealPeriodKey(def.period ?? 'once', at)}#${transactionId}`].slice(-300),
    },
  }));
}

function addGrant(p: PlayerProgress, g: IapGrant): PlayerProgress {
  return {
    ...p,
    rubies: p.rubies + g.rubies,
    gold: p.gold + g.gold,
    summon: {
      ...p.summon,
      legacyTickets: p.summon.legacyTickets + g.dragonTickets,
      equipTickets: (p.summon.equipTickets ?? 0) + g.equipTickets,
      runeTickets: (p.summon.runeTickets ?? 0) + g.runeTickets,
    },
  };
}

/**
 * 서버 장부의 지급 한 건을 진행 저장에 반영. 서버가 이미 결제·횟수를 확인했으므로 앱은 다시 막지 않는다.
 * - 같은 거래는 한 번만(거래 ID) → 'duplicate'(이미 받음, ack 해도 됨)
 * - 패스는 구매한 시즌이 지났으면 'expired'(지난 시즌 칸은 받을 수 없음 — docs/PAYMENTS.md 결정 대기)
 */
export function applyServerGrant(p: PlayerProgress, g: ServerGrant, now: number): Result {
  const def = iapProduct(g.productId);
  if (!def) return { ok: false, reason: 'product' };
  if (def.kind === 'ruby') return grantVerifiedRubies(p, g.transactionId, g.grant.rubies);
  if (def.kind === 'package') return grantVerifiedPackage(p, g.transactionId, g.productId, now, false, g.purchasedAt);
  if (def.kind === 'skinkey') return grantVerifiedSkinKeys(p, g.transactionId, g.grant.skinKeys ?? def.grant.skinKeys ?? 1);
  const season = g.season ?? passSeasonOf(g.purchasedAt);
  if (season !== passSeasonOf(now)) return { ok: false, reason: 'expired' };
  return grantVerifiedPass(p, g.transactionId, g.grant.pass ?? 'premium', now);
}

export interface Delivered {
  /** 이번에 새로 받은 지급 */
  applied: ServerGrant[];
  /** 지급 합계(화면 안내용) */
  total: IapGrant;
}

let delivering: Promise<Delivered> | null = null;

/** 서버가 돌려준 "아직 안 받은 지급"을 모두 반영하고 받았다고 알린다. 동시에 여러 번 불러도 한 번만 돈다. */
export function deliverPending(now = Date.now()): Promise<Delivered> {
  if (!purchases.available) return Promise.resolve({ applied: [], total: emptyTotal() });
  delivering ??= (async () => {
    try {
      const list = await purchases.pending();
      const applied: ServerGrant[] = [];
      const done: string[] = [];
      for (const g of list) {
        const r = applyServerGrant(Progress.load(), g, now);
        if (r.ok) {
          Progress.save(r.progress);
          applied.push(g);
        }
        // 성공·이미 받음·지난 시즌 패스 모두 "처리 끝". 상품을 모르는 것(앱이 옛 버전)은 남겨 두고 업데이트 뒤 받는다
        if (r.ok || r.reason !== 'product') done.push(g.id);
      }
      if (done.length) await purchases.ack(done).catch((e) => console.warn('지급 확인 알림 실패(다음에 다시)', e));
      const total = emptyTotal();
      for (const g of applied) {
        for (const k of ['rubies', 'gold', 'dragonTickets', 'equipTickets', 'runeTickets'] as const) total[k] += g.grant[k] ?? 0;
        total.skinKeys = (total.skinKeys ?? 0) + (g.grant.skinKeys ?? 0);
      }
      return { applied, total };
    } finally {
      delivering = null;
    }
  })();
  return delivering;
}

const emptyTotal = (): IapGrant => ({ rubies: 0, gold: 0, dragonTickets: 0, equipTickets: 0, runeTickets: 0 });

export type BuyResult =
  | { ok: true; delivered: Delivered }
  | { ok: false; reason: 'unavailable' | 'busy' | 'cancelled' | 'pending' | 'limit' | 'owned' | 'product' | 'offline' | 'failed' | 'undelivered' };

let buying = false;

/** 상점 버튼 하나로: 서버 확인 → 결제 → 서버 검증 → 지급. 결과에 따라 화면이 안내만 하면 된다. */
export async function buyProduct(productId: string): Promise<BuyResult> {
  if (!purchases.available) return { ok: false, reason: 'unavailable' };
  if (buying) return { ok: false, reason: 'busy' };
  buying = true;
  try {
    const c = await purchases.check(productId);
    if (!c.ok) return { ok: false, reason: c.reason };
    const r = await purchases.purchase(productId);
    if (r !== 'done') return { ok: false, reason: r };
    const delivered = await deliverPending();
    // 결제는 됐는데 서버 확인이 아직이면(드묾) 다음 실행·구매 복원 때 지급된다
    return delivered.applied.length ? { ok: true, delivered } : { ok: false, reason: 'undelivered' };
  } catch (e) {
    console.warn('결제 실패', e);
    return { ok: false, reason: 'failed' };
  } finally {
    buying = false;
  }
}

/** 구매 복원: 스토어 복원 + 서버 장부에서 아직 안 받은 지급 */
export async function restoreAll(): Promise<Delivered | null> {
  if (!purchases.available) return null;
  await purchases.restore().catch((e) => console.warn('스토어 복원 실패(서버 장부는 계속 확인)', e));
  return deliverPending();
}

/** 결제 전 안내(상점·루비 충전·패스 화면 공통, 전자상거래법 청약철회 고지 — 법률 검토 전 초안, docs/legal/) */
export const PAY_NOTICE =
  '결제·환불은 App Store 정책을 따라요 · 미성년자는 보호자 동의 후 구매해 주세요\n' +
  '받은 유료 상품을 쓰지 않았다면 7일 안에 청약철회를 요청할 수 있고,\n쓰거나 연 상품은 철회가 제한돼요 · 유료 상품은 결제 서버 확인 뒤 지급돼요';

/** 화면 안내 문구 */
export function buyFailText(reason: Exclude<BuyResult, { ok: true }>['reason']): string | null {
  switch (reason) {
    case 'cancelled':
    case 'busy':
      return null;
    case 'unavailable':
      return '결제는 App Store 앱에서 할 수 있어요';
    case 'limit':
      return '이번 기간에 살 수 있는 횟수를 모두 샀어요';
    case 'owned':
      return '이미 가지고 있어요';
    case 'pending':
      return '결제 승인을 기다리는 중이에요. 승인되면 자동으로 지급돼요';
    case 'undelivered':
      return '결제 확인이 늦어지고 있어요. 잠시 뒤 "구매 복원"을 눌러 주세요';
    case 'offline':
      return '인터넷 연결을 확인해 주세요';
    default:
      return '결제를 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요';
  }
}

/** 지급 합계 → "루비 550 · 골드 20,000 · 드래곤 개봉권 3" */
export function grantLine(t: IapGrant): string {
  const parts: string[] = [];
  if (t.rubies) parts.push(`루비 ${t.rubies.toLocaleString()}`);
  if (t.gold) parts.push(`골드 ${t.gold.toLocaleString()}`);
  if (t.dragonTickets) parts.push(`드래곤 개봉권 ${t.dragonTickets}`);
  if (t.equipTickets) parts.push(`장비 개봉권 ${t.equipTickets}`);
  if (t.runeTickets) parts.push(`룬 개봉권 ${t.runeTickets}`);
  if (t.skinKeys) parts.push(`스킨 열쇠 ${t.skinKeys}`);
  return parts.join(' · ');
}

/** 무료 일일 선물: KST 하루 1번 골드·루비 */
export const freeDailyClaimed = (p: PlayerProgress, now: number) => p.shopLog.includes(`free@${dealPeriodKey('daily', now)}`);
export function claimFreeDaily(p: PlayerProgress, now: number): Result {
  if (freeDailyClaimed(p, now)) return { ok: false, reason: 'claimed' };
  return {
    ok: true,
    progress: { ...p, gold: p.gold + FREE_DAILY_GIFT.gold, rubies: p.rubies + FREE_DAILY_GIFT.rubies, shopLog: [...p.shopLog, `free@${dealPeriodKey('daily', now)}`].slice(-300) },
  };
}
