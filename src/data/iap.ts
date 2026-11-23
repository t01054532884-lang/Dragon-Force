import { DEALS, PACKAGES, RUBY_PRODUCTS, type PackageDef } from './economy';
import { PASS } from './pass';
import { SKIN_ROULETTE } from './skins';

/**
 * 인앱결제 상품표 17종(루비 5 · 패키지 3 · 특혜 6 · 패스 2 · 스킨 열쇠 1) — 앱과 서버(functions/)가 같이 쓴다(docs/PAYMENTS.md).
 * - 지급 내용·구매 제한은 economy.ts·pass.ts 값을 그대로 옮긴 것(숫자는 거기서만 바꾼다).
 * - 서버는 RevenueCat이 확인한 거래만 이 표로 지급 내용을 정해 장부에 적고, 앱은 그 장부 내용만 지급한다.
 * - 이 파일은 순수 데이터·함수만(Progress·플랫폼을 불러오지 않음 → 서버 번들에 그대로 들어감).
 */

export type IapKind = 'ruby' | 'package' | 'pass' | 'skinkey';
/** 구매 제한 기간: 일일·주간·월간(KST) · 계정당 1번(once) · 패스 시즌 · 제한 없음(루비) */
export type IapPeriod = 'daily' | 'weekly' | 'monthly' | 'once' | 'season' | 'none';

/** 한 번 결제로 지급하는 것 */
export interface IapGrant {
  rubies: number;
  gold: number;
  dragonTickets: number;
  equipTickets: number;
  runeTickets: number;
  pass?: 'premium' | 'royal';
  /** 스킨 룰렛 열쇠(2026-11-23 밤) */
  skinKeys?: number;
}

export interface IapProduct {
  productId: string;
  kind: IapKind;
  name: string;
  krw: number; // 기획 가격(App Store 가격 등급에서 가장 가까운 값으로 등록)
  grant: IapGrant;
  period: IapPeriod;
  limit: number; // 기간마다 구매 횟수(루비는 제한 없음 = Infinity)
}

const emptyGrant: IapGrant = { rubies: 0, gold: 0, dragonTickets: 0, equipTickets: 0, runeTickets: 0 };
const pkg = (d: PackageDef): IapProduct => ({
  productId: d.productId,
  kind: 'package',
  name: d.name,
  krw: d.krw,
  grant: { rubies: d.rubies ?? 0, gold: d.gold ?? 0, dragonTickets: d.dragonTickets ?? 0, equipTickets: d.equipTickets ?? 0, runeTickets: d.runeTickets ?? 0 },
  period: d.period ?? 'once',
  limit: d.limit,
});

export const IAP_PRODUCTS: IapProduct[] = [
  ...RUBY_PRODUCTS.map((r): IapProduct => ({
    productId: r.productId,
    kind: 'ruby',
    name: `루비 ${(r.rubies + r.bonus).toLocaleString('ko-KR')}`,
    krw: r.krw,
    grant: { ...emptyGrant, rubies: r.rubies + r.bonus },
    period: 'none',
    limit: Infinity,
  })),
  ...PACKAGES.map(pkg),
  ...DEALS.map(pkg),
  { productId: PASS.productId.premium, kind: 'pass', name: '드래곤 패스 프리미엄', krw: PASS.price.premium, grant: { ...emptyGrant, pass: 'premium' }, period: 'season', limit: 1 },
  { productId: PASS.productId.royal, kind: 'pass', name: '드래곤 패스 로열', krw: PASS.price.royal, grant: { ...emptyGrant, pass: 'royal' }, period: 'season', limit: 1 },
  // 스킨 룰렛 열쇠 1개(제작자 결정 2026-11-23 밤: 4,900원, 현금 결제만). 소모성, 구매 제한 없음
  { productId: SKIN_ROULETTE.keyProductId, kind: 'skinkey', name: '스킨 룰렛 열쇠', krw: SKIN_ROULETTE.keyKrw, grant: { ...emptyGrant, skinKeys: 1 }, period: 'none', limit: Infinity },
];

export const iapProduct = (productId: string): IapProduct | undefined => IAP_PRODUCTS.find((x) => x.productId === productId);

// ───────── 기간 키(KST) — Progress.dealPeriodKey·Pass.seasonOf와 같은 규칙(tests/iap.test.ts가 일치 확인) ─────────
const KST_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const passSeasonOf = (now: number) => Math.max(1, Math.floor((now - PASS.epoch) / (PASS.seasonDays * DAY_MS)) + 1);

/** 구매 시각이 속한 제한 기간 키: 'YYYY-MM-DD' · 'wYYYY-MM-DD'(그 주 월요일) · 'YYYY-MM' · 'once' · 's<시즌>' · 'none' */
export function iapPeriodKey(period: IapPeriod, at: number): string {
  if (period === 'once' || period === 'none') return period;
  if (period === 'season') return `s${passSeasonOf(at)}`;
  const d = new Date(at + KST_MS);
  if (period === 'daily') return ymd(d);
  if (period === 'monthly') return ymd(d).slice(0, 7);
  const dow = (d.getUTCDay() + 6) % 7; // 월요일 0
  return `w${ymd(new Date(d.getTime() - dow * DAY_MS))}`;
}

/** 서버 장부 한 줄(필요한 것만) */
export interface LedgerLite {
  productId: string;
  periodKey: string;
  refunded?: boolean;
}

/**
 * 지금 이 상품을 더 살 수 있나(서버가 결제 창을 열기 전에 확인). 환불된 거래는 세지 않는다.
 * 패스: 프리미엄은 이번 시즌 프리미엄·로열 중 하나라도 있으면 막고, 로열은 로열이 있으면 막는다.
 */
export function canBuy(productId: string, ledger: LedgerLite[], now: number): { ok: true } | { ok: false; reason: 'product' | 'limit' | 'owned' } {
  const def = iapProduct(productId);
  if (!def) return { ok: false, reason: 'product' };
  if (def.limit === Infinity) return { ok: true };
  const key = iapPeriodKey(def.period, now);
  const live = ledger.filter((e) => !e.refunded && e.periodKey === key);
  if (def.kind === 'pass') {
    const owned = (id: string) => live.some((e) => e.productId === id);
    if (owned(PASS.productId.royal) || (def.grant.pass === 'premium' && owned(PASS.productId.premium))) return { ok: false, reason: 'owned' };
    return { ok: true };
  }
  return live.filter((e) => e.productId === productId).length >= def.limit ? { ok: false, reason: 'limit' } : { ok: true };
}

// ───────── RevenueCat 응답 읽기(REST v1 GET /subscribers/{앱 사용자 ID}) ─────────
export interface RcTransaction {
  productId: string;
  transactionId: string; // App Store 거래 ID(없으면 RevenueCat 거래 ID)
  purchasedAt: number;
  sandbox: boolean;
  store: string;
}

/** subscriber.non_subscriptions 에서 우리 상품표에 있는 거래만 뽑는다(모르는 상품은 버림) */
export function readRcTransactions(body: unknown): RcTransaction[] {
  const ns = (body as { subscriber?: { non_subscriptions?: Record<string, unknown> } })?.subscriber?.non_subscriptions;
  if (!ns || typeof ns !== 'object') return [];
  const out: RcTransaction[] = [];
  for (const [productId, list] of Object.entries(ns)) {
    if (!iapProduct(productId) || !Array.isArray(list)) continue;
    for (const t of list as Record<string, unknown>[]) {
      const transactionId = String(t.store_transaction_id ?? t.id ?? '');
      const purchasedAt = Date.parse(String(t.purchase_date ?? ''));
      if (!transactionId || !Number.isFinite(purchasedAt)) continue;
      out.push({ productId, transactionId, purchasedAt, sandbox: !!t.is_sandbox, store: String(t.store ?? 'app_store') });
    }
  }
  return out;
}

/** 서버가 앱에 돌려주는 지급 한 건(장부 문서 ID = id) */
export interface ServerGrant {
  id: string;
  productId: string;
  transactionId: string;
  purchasedAt: number;
  grant: IapGrant;
  season?: number; // 패스: 구매한 시즌
}

/** 장부 문서 ID: 스토어 + 거래 ID(같은 거래는 한 번만 기록·지급) */
export const ledgerId = (store: string, transactionId: string) => `${store}_${transactionId}`.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 200);
