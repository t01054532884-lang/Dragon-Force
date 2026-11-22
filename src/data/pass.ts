/**
 * 드래곤 패스(제작자 요청 2026-11-23, 예시 화면 "드래곤 패스 시즌 1"을 우리 경제에 맞게 조정).
 * - 28일 시즌 · 30레벨 · 레벨마다 100P. 패스 포인트 = 이번 시즌에 모은 계정 경험치(클리어 100 · 실패 30 · 엘리트 10 · 일반 10마리당 1).
 * - 무료 / 프리미엄(₩9,900) / 로열(₩19,000, 프리미엄 포함) 세 줄. 레벨에 닿으면 그 칸을 받을 수 있다(유료 줄은 구매 후).
 * - 예시의 승급석·드래곤 정수·장비 스크롤 같은 없는 재화는 우리 재화로 바꿈: 범용 조각, 드래곤·장비·룬 개봉권, 레드 조각(제작자: 더 줘도 됨).
 * ⚠ 보상 수치·가격은 AI 1차안(제작자 확정 전). 가치(%)는 아래 기준으로 계산한 값을 그대로 보여 준다(부풀리지 않음).
 */
export type PassItem =
  | { kind: 'gold'; n: number }
  | { kind: 'rubies'; n: number }
  | { kind: 'redFrag'; n: number } // 레드 드래곤 조각(승급용)
  | { kind: 'uniFrag'; n: number } // 범용 조각(어느 드래곤 승급에나)
  | { kind: 'dragonTicket'; n: number } // 드래곤·스킬 상자 무료 개봉권
  | { kind: 'equipTicket'; n: number }
  | { kind: 'runeTicket'; n: number };

export type PassTrack = 'free' | 'premium' | 'royal';

export const PASS = {
  seasonDays: 28,
  levels: 30,
  pointsPerLevel: 100,
  /** 시즌 1 시작(KST 2026-11-23 0시). 그 뒤 28일마다 다음 시즌 */
  epoch: Date.parse('2026-11-23T00:00:00+09:00'),
  price: { premium: 9_900, royal: 19_000 },
  productId: { premium: 'pass_premium_s', royal: 'pass_royal_s' },
} as const;

const g = (n: number): PassItem => ({ kind: 'gold', n });
const r = (n: number): PassItem => ({ kind: 'rubies', n });
const red = (n: number): PassItem => ({ kind: 'redFrag', n });
const uni = (n: number): PassItem => ({ kind: 'uniFrag', n });
const dt = (n: number): PassItem => ({ kind: 'dragonTicket', n });
const et = (n: number): PassItem => ({ kind: 'equipTicket', n });
const rt = (n: number): PassItem => ({ kind: 'runeTicket', n });

/** 레벨 1~30의 보상(인덱스 0 = Lv.1) */
export const PASS_REWARDS: Record<PassTrack, PassItem[]> = {
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

/**
 * 가치 계산 기준(루비로 환산, 상점 가격에서): 드래곤 상자 1회 250 · 장비·룬 상자 1회 100 · 골드 20 = 루비 1(골드 상점 20,000G = 1,000루비)
 * · 조각은 상점에서 팔지 않아 보수적으로 레드 조각 10 · 범용 조각 15. 루비 1개 = ₩11,000 ÷ 1,350(루비 1,350 상품).
 */
export const RUBY_KRW = 11_000 / 1_350;
const RUBY_VALUE: Record<PassItem['kind'], number> = { gold: 1 / 20, rubies: 1, redFrag: 10, uniFrag: 15, dragonTicket: 250, equipTicket: 100, runeTicket: 100 };
export const itemRubyValue = (it: PassItem) => it.n * RUBY_VALUE[it.kind];
export const trackRubyValue = (t: PassTrack) => PASS_REWARDS[t].reduce((s, it) => s + itemRubyValue(it), 0);

/** 가격 대비 가치(%) — 로열은 프리미엄 줄까지 받으므로 두 줄 합계 */
export function passValuePct(kind: 'premium' | 'royal'): number {
  const rubies = trackRubyValue('premium') + (kind === 'royal' ? trackRubyValue('royal') : 0);
  return Math.round(((rubies * RUBY_KRW) / PASS.price[kind]) * 100 / 10) * 10;
}

export const PASS_ITEM_LABEL: Record<PassItem['kind'], string> = {
  gold: '골드', rubies: '루비', redFrag: '레드 조각', uniFrag: '범용 조각', dragonTicket: '드래곤 개봉권', equipTicket: '장비 개봉권', runeTicket: '룬 개봉권',
};
export const PASS_ITEM_ICON: Record<PassItem['kind'], string> = {
  gold: 'ui-gold', rubies: 'ui-ruby', redFrag: 'portrait-red', uniFrag: 'ui-fragment', dragonTicket: 'ui-ticket', equipTicket: 'ui-ticket-equip', runeTicket: 'ui-ticket-rune',
};
