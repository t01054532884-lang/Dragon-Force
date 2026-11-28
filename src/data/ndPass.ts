import type { DragonId } from './dragons';
import { itemRubyValue, RUBY_KRW, type PassItem } from './pass';

/**
 * 신규 드래곤 패스(제작자 확정 2026-11-28, 기획 docs/NEW_DRAGON_PASS.md — 관리자팀 1차안 그대로 시작).
 * - 기간 한정 1회(id 'nd1'): 21일 · 20레벨. 포인트 = 패스 시작 뒤 모은 계정 경험치(드래곤 패스와 같은 계산)
 *   + 신규 드래곤 5종으로 싸운 판은 그 판 경험치의 50%를 더(새 드래곤을 써 보게).
 * - 줄: 무료(기어스 조각 60 = 20레벨까지 하면 기어스 해금) / 신규 패스 ₩11,000(실바·포지·크리스탈 중 골라 조각 100 = 해금)
 *   / 바하무트 패스 ₩33,000(구매 즉시 바하무트 해금 + 신규 패스 줄 + 프로필 테두리). 랜덤 보상 없음(확률 고지 불필요).
 * - 둘 다 계정당 1번, 패스 기간 안에만 판다(서버 canBuy). 신규 패스를 산 뒤 바하무트 패스를 사면 바하무트 해금·테두리만 더 받는다.
 * ⚠ 날짜: 1.0.5 출시(12/2~3 예상) 전 TestFlight 확인(12/1)이 되도록 12/1 0시(KST)부터 21일. 출시가 늦어지면 START만 바꾼다.
 */
export const ND_PASS = {
  id: 'nd1',
  start: Date.parse('2026-12-01T00:00:00+09:00'),
  days: 21,
  levels: 20,
  /** Lv.n → n+1 필요 포인트(n = 1~19): 250 · 275 · … 700 → 합 9,025P(하루 3~4판이면 14~16일) */
  levelCost: (n: number) => 250 + 25 * (n - 1),
  /** 신규 드래곤으로 싸운 판의 추가 포인트(그 판 계정 경험치의 50%) */
  newDragonBonus: 0.5,
  newDragons: ['gears', 'silva', 'forge', 'crystal', 'bahamut'] as DragonId[],
  freeDragon: 'gears' as DragonId,
  /** 신규 패스로 고를 수 있는 영웅 3종 */
  heroes: ['silva', 'forge', 'crystal'] as DragonId[],
  legendary: 'bahamut' as DragonId,
  /** 이미 바하무트가 있으면 즉시 해금 대신 조각(전설 해금량) */
  bahamutDupFragments: 160,
  price: { pass: 11_000, bahamut: 33_000 },
  productId: { pass: 'newdragon_pass_1', bahamut: 'newdragon_bahamut_1' },
} as const;

export const ndEnd = () => ND_PASS.start + ND_PASS.days * 86_400_000;
/** 패스 기간 안인가(판매·보상 받기 모두 이 안에서만) */
export const ndOpen = (now: number) => now >= ND_PASS.start && now < ndEnd();

/** 패스 칸 보상: 드래곤 패스 재화 + 정해진 드래곤 조각(무료 줄 기어스) + 고른 영웅 조각(신규 패스 줄) */
export type NdItem = Exclude<PassItem, { kind: 'randFrag' | 'redFrag' | 'uniFrag' }> | { kind: 'dragonFrag'; id: DragonId; n: number } | { kind: 'pickFrag'; n: number };
export type NdTrack = 'free' | 'pass';

const g = (n: number): NdItem => ({ kind: 'gold', n });
const r = (n: number): NdItem => ({ kind: 'rubies', n });
const dt = (n: number): NdItem => ({ kind: 'dragonTicket', n });
const et = (n: number): NdItem => ({ kind: 'equipTicket', n });
const rt = (n: number): NdItem => ({ kind: 'runeTicket', n });
const gears = (n: number): NdItem => ({ kind: 'dragonFrag', id: ND_PASS.freeDragon, n });
const pick = (n: number): NdItem => ({ kind: 'pickFrag', n });

/**
 * 레벨 1~20 보상(인덱스 0 = Lv.1). AI 1차안(기획서 3절):
 * - 무료: 기어스 조각 5·10·10·10·10·5·10 = 60(희귀 해금량), 골드, 루비 170, 드래곤 개봉권 2
 * - 신규 패스: 고른 영웅 조각 25 × 4(5·10·15·20레벨) = 100(영웅 해금량), 루비 1,500, 드래곤 개봉권 5, 장비·룬 개봉권 각 4
 */
export const ND_REWARDS: Record<NdTrack, NdItem[]> = {
  free: [g(1000), r(20), gears(5), g(1500), dt(1), gears(10), g(2000), r(30), gears(10), g(2500), r(30), gears(10), g(3000), dt(1), gears(10), r(40), g(4000), gears(5), r(50), gears(10)],
  pass: [r(150), et(2), dt(1), g(5000), pick(25), r(200), rt(2), dt(1), g(8000), pick(25), r(250), et(2), dt(1), rt(2), pick(25), r(300), g(10000), dt(2), r(600), pick(25)],
};

/** 드래곤 조각 값(드래곤 패스 가치 계산과 같은 기준: 조각 1개 = 루비 10) */
const FRAG_RUBY = 10;
export const ndItemRubyValue = (it: NdItem): number =>
  it.kind === 'dragonFrag' || it.kind === 'pickFrag' ? it.n * FRAG_RUBY : itemRubyValue(it as PassItem);
export const ndTrackRubyValue = (t: NdTrack) => ND_REWARDS[t].reduce((s, it) => s + ndItemRubyValue(it), 0);

/**
 * 가격 대비 가치(%) — passValuePct와 같은 방식(루비 환산 × 루비 1개 원화 ÷ 가격, 10% 단위).
 * 바하무트 패스는 신규 패스 줄 + 바하무트 즉시 해금(전설 해금량 160조각 × 10루비로 환산).
 */
export function ndValuePct(kind: 'pass' | 'bahamut'): number {
  const rubies = ndTrackRubyValue('pass') + (kind === 'bahamut' ? ND_PASS.bahamutDupFragments * FRAG_RUBY : 0);
  return Math.round(((rubies * RUBY_KRW) / ND_PASS.price[kind]) * 100 / 10) * 10;
}
