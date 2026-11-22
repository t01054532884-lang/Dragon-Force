import { DEALS, FREE_DAILY_GIFT, PACKAGES, RUBY_PRODUCTS, type PackageDef } from '../data/economy';
import { dealPeriodKey, withTx, type PlayerProgress, type Result } from './Progress';

// 인앱결제(첫 출시에 넣기 — 제작자 결정 2026-11-20: Firebase + RevenueCat, docs/MONETIZATION_PLAN.md).
// 지금은 결제 창구(인터페이스)와 지급 규칙만 있고, 기본값은 "결제 없음"(웹·데모·서버 연결 전). 할 일:
// 1) iOS 구현: RevenueCat Capacitor SDK로 상품·구매·복원 → setPurchaseProvider로 바꿔 끼움(토스는 이후).
// 2) 결제 영수증은 반드시 서버에서 검증하고 거래 기록을 남긴다(기획 v1.2 15장: 유료 루비·확률형 결과는 서버 검증).
// 3) 검증된 거래만 grantVerifiedRubies로 지급한다(거래 ID로 중복 지급 방지).
// 4) 확률 고지·환불·스토어 정책을 출시 전에 확인한다.

export interface RubyProduct {
  productId: string;
  rubies: number; // 보너스 포함 지급량
  priceLabel: string; // 스토어가 알려 주는 현지 가격 문자열(₩5,900 등)
}

export interface PurchaseProvider {
  /** 이 플랫폼에서 결제를 쓸 수 있나 */
  readonly available: boolean;
  products(): Promise<RubyProduct[]>;
  /** 결제 → 서버 검증까지 끝난 거래 ID를 돌려준다(실패·취소면 null) */
  buy(productId: string): Promise<{ transactionId: string; rubies: number } | null>;
  /** 구매 복원(애플 심사 필수 버튼). 소모형 루비는 서버 기록으로 지급 누락분만 다시 확인 → 다시 지급한 거래 수 */
  restore(): Promise<{ transactionId: string; rubies: number }[]>;
}

/** 첫 출시용: 결제 없음 */
export const NoPurchases: PurchaseProvider = {
  available: false,
  products: async () => [],
  buy: async () => null,
  restore: async () => [],
};

export let purchases: PurchaseProvider = NoPurchases;
/** 플랫폼 초기화에서 실제 구현으로 바꿔 끼운다 */
export const setPurchaseProvider = (p: PurchaseProvider) => (purchases = p);

/** 서버가 검증한 거래만 루비로 지급. 같은 거래 ID는 한 번만(재시도·중복 요청 방지). */
export function grantVerifiedRubies(p: PlayerProgress, transactionId: string, rubies: number): Result {
  if (!Number.isInteger(rubies) || rubies <= 0) return { ok: false, reason: 'amount' };
  if (RUBY_PRODUCTS.length === 0) return { ok: false, reason: 'disabled' }; // 첫 출시: 상품 없음
  return withTx(p, `iap:${transactionId}`, () => ({ ok: true, progress: { ...p, rubies: p.rubies + rubies } }));
}

const allPackages = (): PackageDef[] => [...PACKAGES, ...DEALS];

/** 이번 기간(한정은 계정 전체)에 이 상품을 산 횟수 — 상점 기록 shopLog에서 센다 */
export function packageBought(p: PlayerProgress, productId: string, now = Date.now()): number {
  const def = allPackages().find((x) => x.productId === productId);
  const key = `${productId}@${dealPeriodKey(def?.period ?? 'once', now)}#`;
  return p.shopLog.filter((t) => t.startsWith(key)).length;
}

/**
 * 서버가 검증한 패키지·특혜 거래만 지급(루비·골드·무료 개봉권). 같은 거래 ID는 한 번만, 기간마다 limit회.
 * 결제 연결 전에는 상점 화면이 부르지 않는다(구조와 규칙만 — 테스트로 확인). 최종 횟수 확인은 결제 서버 기록으로.
 */
export function grantVerifiedPackage(p: PlayerProgress, transactionId: string, productId: string, now = Date.now()): Result {
  const def = allPackages().find((x) => x.productId === productId);
  if (!def) return { ok: false, reason: 'product' };
  if (packageBought(p, productId, now) >= def.limit) return { ok: false, reason: 'limit' };
  return withTx(p, `pkg:${productId}:${transactionId}`, () => ({
    ok: true,
    progress: {
      ...p,
      rubies: p.rubies + (def.rubies ?? 0),
      gold: p.gold + (def.gold ?? 0),
      summon: {
        ...p.summon,
        legacyTickets: p.summon.legacyTickets + (def.dragonTickets ?? 0),
        equipTickets: (p.summon.equipTickets ?? 0) + (def.equipTickets ?? 0),
        runeTickets: (p.summon.runeTickets ?? 0) + (def.runeTickets ?? 0),
      },
      shopLog: [...p.shopLog, `${productId}@${dealPeriodKey(def.period ?? 'once', now)}#${transactionId}`].slice(-300),
    },
  }));
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
