import { RUBY_KRW } from './pass';

/**
 * 루비 패스(제작자 요청 2026-11-26, 다른 게임의 "모험 기금"을 참고해 우리 것으로):
 * - 시즌 없는 영구 패스. 레벨 = 계정 레벨(1~30) — 게임을 하면 저절로 오른다.
 * - 무료 줄: 레벨마다 루비 조금(5의 배수 레벨은 더 많이). 유료 줄(₩25,000, 계정당 1번): 레벨마다 큰 루비, 구매 전에는 상자가 잠겨 있다.
 * - 가치(%) = 유료 줄 루비 합계 × 루비 1개 값(드래곤 패스와 같은 기준 RUBY_KRW = ₩11,000 ÷ 1,350) ÷ 가격.
 *   처음 목표 1,500%(46,000루비)는 루비 경제에 너무 커서 제작자가 500%로 바꿈(2026-11-26): 유료 줄 합계 15,350루비 ≈ ₩125,100 → 500%.
 */
export const RUBY_PASS = {
  levels: 30,
  price: 25_000,
  productId: 'ruby_pass_1',
  /** 무료 줄: 레벨마다 30, 5의 배수 레벨 100 (합 1,320) */
  free: Array.from({ length: 30 }, (_, i) => ((i + 1) % 5 === 0 ? 100 : 30)),
  /** 유료 줄: 1~10레벨 300 · 11~20레벨 500 · 21~29레벨 700 · 30레벨 1,050 (합 15,350 → 500%) */
  paid: Array.from({ length: 30 }, (_, i) => (i < 10 ? 300 : i < 20 ? 500 : i < 29 ? 700 : 1_050)),
} as const;

export const rubyPassPaidTotal = () => RUBY_PASS.paid.reduce((a, b) => a + b, 0);

/** 가격 대비 가치(%) — 10 단위 반올림(드래곤 패스와 같은 방식) */
export function rubyPassValuePct(): number {
  return Math.round(((rubyPassPaidTotal() * RUBY_KRW) / RUBY_PASS.price) * 100 / 10) * 10;
}
