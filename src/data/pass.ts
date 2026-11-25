/**
 * 드래곤 패스(제작자 요청 2026-11-23, 예시 화면 "드래곤 패스 시즌 1"을 우리 경제에 맞게 조정).
 * - 28일 시즌 · 30레벨. 패스 포인트 = 이번 시즌에 모은 계정 경험치(클리어 100 · 실패 30 · 엘리트 10 · 일반 10마리당 1).
 * - 레벨 필요 포인트(제작자 2026-11-25: "쉬움 13단계 깼는데 패스 25레벨" → 너무 빠름): 예전 레벨마다 100P(합 2,900P) →
 *   Lv.n → n+1 = 100 + 50 × (n − 1)(계정 레벨과 같은 곡선, Lv.30까지 합 23,200P ≈ 클리어 120~140판 ≈ 하루 4~5판 × 28일).
 * - 무료 / 프리미엄(₩9,900) / 로열(₩19,000, 프리미엄 포함) 세 줄. 레벨에 닿으면 그 칸을 받을 수 있다(유료 줄은 구매 후).
 * - 예시의 승급석·드래곤 정수·장비 스크롤 같은 없는 재화는 우리 재화로 바꿈: 범용 조각, 드래곤·장비·룬 개봉권, 랜덤 조각.
 * - 조각 칸(제작자 2026-11-25): 레드 고정 → 랜덤 드래곤 조각. 등급 확률 RANDOM_FRAGMENT_RARITY(일반 60·희귀 28·영웅 10·전설 2, 레드는 일반)로
 *   등급을 먼저 뽑고 그 등급 안에서 균등 — 보유하지 않은 드래곤도 나온다(모이면 조각 → 정수 교환으로 해금).
 * ⚠ 보상 수치·가격은 AI 1차안(제작자 확정 전). 가치(%)는 아래 기준으로 계산한 값을 그대로 보여 준다(부풀리지 않음).
 */
export type PassItem =
  | { kind: 'gold'; n: number }
  | { kind: 'rubies'; n: number }
  | { kind: 'redFrag'; n: number } // (예전) 레드 드래곤 조각 — 보상표는 randFrag로 바뀜
  | { kind: 'randFrag'; n: number } // 랜덤 드래곤 조각(2026-11-25): 등급 확률로 드래곤을 뽑아 n개, 미보유 드래곤도 나옴
  | { kind: 'uniFrag'; n: number } // 범용 조각(어느 드래곤 승급에나)
  | { kind: 'dragonTicket'; n: number } // 드래곤·스킬 상자 무료 개봉권
  | { kind: 'equipTicket'; n: number }
  | { kind: 'runeTicket'; n: number };

export type PassTrack = 'free' | 'premium' | 'royal';

export const PASS = {
  seasonDays: 28,
  levels: 30,
  /** Lv.n → n+1 필요 포인트(n = 1~29): 100 · 150 · 200 … 1,500 */
  levelCost: (n: number) => 100 + 50 * (n - 1),
  /** 시즌 1 시작(KST 2026-11-23 0시). 그 뒤 28일마다 다음 시즌 */
  epoch: Date.parse('2026-11-23T00:00:00+09:00'),
  price: { premium: 9_900, royal: 19_000 },
  productId: { premium: 'pass_premium_s', royal: 'pass_royal_s' },
} as const;

const g = (n: number): PassItem => ({ kind: 'gold', n });
const r = (n: number): PassItem => ({ kind: 'rubies', n });
const red = (n: number): PassItem => ({ kind: 'randFrag', n }); // 예전 레드 조각 칸 → 랜덤 조각(수량 그대로)
const uni = (n: number): PassItem => ({ kind: 'uniFrag', n });
const dt = (n: number): PassItem => ({ kind: 'dragonTicket', n });
const et = (n: number): PassItem => ({ kind: 'equipTicket', n });
const rt = (n: number): PassItem => ({ kind: 'runeTicket', n });

/**
 * 조각 칸 수량(제작자 2026-11-25): 범용 조각을 없애고 레드·범용 칸 모두 랜덤 조각으로, 줄마다 레벨 순서대로 두 칸마다 올라감.
 * - 무료: 5 · 5 · 10 · 10 · 20 · 20 · 30(제작자 안 그대로)
 * - 유료(프리미엄·로열): 30 · 30 · 40 · 40 · 50 · 50 · 60 — 제작자 요청 "가치 1,000%대가 되게 조각 수량을 늘리자"(프리미엄 조각 칸이 4개뿐이라
 *   무료와 같은 사다리로는 930%에 그쳐 유료 줄만 크게). 결과 프리미엄 1,000% · 로열 1,510%(passValuePct 계산값).
 */
export const PASS_FRAG_STEPS: Record<PassTrack, number[]> = {
  free: [5, 5, 10, 10, 20, 20, 30],
  premium: [30, 30, 40, 40, 50, 50, 60],
  royal: [30, 30, 40, 40, 50, 50, 60],
};
const escalateFrags = (row: PassItem[], steps: number[]): PassItem[] => {
  let k = 0;
  return row.map((it) => (it.kind === 'randFrag' || it.kind === 'uniFrag' || it.kind === 'redFrag' ? { kind: 'randFrag', n: steps[Math.min(k++, steps.length - 1)] } : it));
};

/** 레벨 1~30의 보상(인덱스 0 = Lv.1). 조각 칸 수량은 escalateFrags가 다시 정한다(아래 표의 숫자는 예전 값) */
const RAW_REWARDS: Record<PassTrack, PassItem[]> = {
  free: [
    g(1000), r(30), red(10), g(1500), rt(1), et(1), g(2000), r(50), red(15), dt(1),
    g(3000), r(50), uni(5), g(3000), rt(1), et(1), r(50), red(20), g(4000), dt(1),
    g(5000), r(60), uni(10), g(5000), et(2), r(80), red(25), g(6000), rt(2), r(300),
  ],
  premium: [
    et(2), g(3000), rt(2), r(100), dt(1), red(20), g(5000), dt(1), et(2), r(300),
    rt(2), g(8000), red(30), r(150), dt(3), g(10000), et(3), rt(3), r(200), dt(3),
    et(3), g(12000), red(40), r(250), rt(3), dt(3), g(15000), r(300), uni(40), dt(8),
  ],
  royal: [
    dt(3), rt(3), red(30), uni(15), g(10000), r(200), et(3), dt(4), uni(20), r(600),
    et(3), red(40), rt(3), g(15000), dt(5), r(600), uni(25), g(20000), et(4), dt(5),
    rt(4), r(800), red(50), uni(30), g(25000), dt(5), et(4), r(1000), rt(4), dt(20),
  ],
};
export const PASS_REWARDS: Record<PassTrack, PassItem[]> = {
  free: escalateFrags(RAW_REWARDS.free, PASS_FRAG_STEPS.free),
  premium: escalateFrags(RAW_REWARDS.premium, PASS_FRAG_STEPS.premium),
  royal: escalateFrags(RAW_REWARDS.royal, PASS_FRAG_STEPS.royal),
};

/**
 * 가치 계산 기준(루비로 환산, 상점 가격에서): 드래곤 상자 1회 250 · 장비·룬 상자 1회 100 · 골드 20 = 루비 1(골드 상점 20,000G = 1,000루비)
 * · 조각은 상점에서 팔지 않아 보수적으로 레드 조각 10 · 범용 조각 15. 루비 1개 = ₩11,000 ÷ 1,350(루비 1,350 상품).
 */
export const RUBY_KRW = 11_000 / 1_350;
const RUBY_VALUE: Record<PassItem['kind'], number> = { gold: 1 / 20, rubies: 1, redFrag: 10, randFrag: 10, uniFrag: 15, dragonTicket: 250, equipTicket: 100, runeTicket: 100 };
export const itemRubyValue = (it: PassItem) => it.n * RUBY_VALUE[it.kind];
export const trackRubyValue = (t: PassTrack) => PASS_REWARDS[t].reduce((s, it) => s + itemRubyValue(it), 0);

/** 가격 대비 가치(%) — 로열은 프리미엄 줄까지 받으므로 두 줄 합계 */
export function passValuePct(kind: 'premium' | 'royal'): number {
  const rubies = trackRubyValue('premium') + (kind === 'royal' ? trackRubyValue('royal') : 0);
  return Math.round(((rubies * RUBY_KRW) / PASS.price[kind]) * 100 / 10) * 10;
}

export const PASS_ITEM_LABEL: Record<PassItem['kind'], string> = {
  gold: '골드', rubies: '루비', redFrag: '레드 조각', randFrag: '랜덤 조각', uniFrag: '범용 조각', dragonTicket: '드래곤 개봉권', equipTicket: '장비 개봉권', runeTicket: '룬 개봉권',
};
export const PASS_ITEM_ICON: Record<PassItem['kind'], string> = {
  gold: 'ui-gold', rubies: 'ui-ruby', redFrag: 'portrait-red', randFrag: 'ui-fragment', uniFrag: 'ui-fragment', dragonTicket: 'ui-ticket', equipTicket: 'ui-ticket-equip', runeTicket: 'ui-ticket-rune',
};
