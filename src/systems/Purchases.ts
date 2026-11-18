import { RUBY_PRODUCTS } from '../data/economy';
import { withTx, type PlayerProgress, type Result } from './Progress';

// 인앱결제 자리(구조만, 첫 출시에는 현금 결제 없음 — 제작자 결정 2026-11-18).
// 루비는 지금 게임 안 보상·이벤트로만 얻는다. 결제를 붙일 때 할 일:
// 1) 플랫폼별 구현을 만든다(iOS: StoreKit/RevenueCat, 토스: 앱인토스 인앱결제 — 사업자등록 필요).
// 2) 결제 영수증은 반드시 서버에서 검증하고 거래 기록을 남긴다(기획 v1.2 15장: 유료 루비·확률형 결과는 서버 검증).
// 3) 검증된 거래만 grantVerifiedRubies로 지급한다(거래 ID로 중복 지급 방지).
// 4) 확률 고지·환불·스토어 정책을 출시 전에 확인한다.

export interface RubyProduct {
  productId: string;
  rubies: number;
  priceLabel: string; // 스토어가 알려 주는 현지 가격 문자열
}

export interface PurchaseProvider {
  /** 이 플랫폼에서 결제를 쓸 수 있나 */
  readonly available: boolean;
  products(): Promise<RubyProduct[]>;
  /** 결제 → 서버 검증까지 끝난 거래 ID를 돌려준다(실패·취소면 null) */
  buy(productId: string): Promise<{ transactionId: string; rubies: number } | null>;
}

/** 첫 출시용: 결제 없음 */
export const NoPurchases: PurchaseProvider = {
  available: false,
  products: async () => [],
  buy: async () => null,
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
