import { M, type RunStats } from './stats';
import { RED_BASIC } from './basicAttack';

// 레벨업 카드 (기획서 v0.1·v0.2).
// - basic:   드래곤 고유 기본공격 강화 (고유 슬롯 1, Lv.7까지, Lv.7 = 진화)
// - active:  공격 스킬 (액티브 슬롯 최대 6, Lv.5까지). 효과는 src/systems/Skills.ts
// - passive: 능력치 (패시브 슬롯 최대 4, Lv.5까지)
// - filler:  유효 후보가 3장보다 적을 때 채우는 보조 카드
export type CardKind = 'basic' | 'active' | 'passive' | 'filler';

export interface Upgrade {
  id: string;
  kind: CardKind;
  icon: string;
  name: string;
  maxLevel: number;
  /** 다음 레벨(1부터)을 골랐을 때 카드에 보일 설명 */
  describe(nextLevel: number): string;
  /** 골랐을 때 능력치를 바꾼다(패시브) */
  apply?(stats: RunStats, nextLevel: number): void;
  /** 조합 태그(2026-11-20 개선 6번): 화염·빙결·연쇄·범위 … 같은 태그끼리 "보유 스킬과 연계" */
  tags?: string[];
  /** 레벨별 핵심 수치(이름 → 보기 좋은 값). 강화 전후 차이를 숫자로 보여 줄 때 쓴다 */
  stat?(level: number): Record<string, string>;
}

export const ACTIVE_SLOTS = 6;

/** 기본공격 카드가 보여 줄 드래곤 기본 공격(판 시작 때 게임 장면이 정한다) */
type BasicCardLevel = { text: string; shots?: number; coef?: number; levelMod?: number; interval?: number; pierce?: number; chain?: number };
let currentBasic: { name: string; icon: string; levels: BasicCardLevel[] } = RED_BASIC;
let currentBasicTags: string[] = ['화염', '투사체'];
/** tags: 드래곤 속성 조합 태그(예: 레드 화염·투사체) */
export function setBasicCard(spec: { name: string; icon: string; levels: BasicCardLevel[] }, tags?: string[]): void {
  currentBasic = spec;
  if (tags) currentBasicTags = tags;
}

/** 드래곤별 기본 공격 조합 태그 */
export const BASIC_TAGS: Record<string, string[]> = {
  red: ['화염', '투사체'], blue: ['빙결', '투사체'], yellow: ['번개', '연쇄'], green: ['독', '투사체'], white: ['빛', '관통'],
  black: ['암흑', '관통'], stone: ['범위', '밀쳐내기'], wind: ['투사체', '연사'], water: ['빙결', '밀쳐내기'], arcane: ['분열', '투사체'],
};
export const PASSIVE_SLOTS = 4;

// ── 액티브 스킬 수치: 레벨(1~5)을 넣으면 값이 나오는 함수. 피해는 "공격력 대비 계수"(1.0 = 100%).
// 범위·주기에는 마력 확장(areaMult)·고대의 시계(cooldownMult)가 Skills.ts에서 곱해진다.
export const SKILL = {
  // 화염 브레스: 기획서 v0.1 4장 예시표를 그대로 따른다.
  breath: {
    interval: () => 2000,
    range: (lv: number) => 4.4 * M * (lv >= 3 ? 1.2 : 1), // Lv.3 범위 +20%
    angle: (lv: number) => 60 * (lv >= 3 ? 1.2 : 1), // 부채꼴 전체 각도(도)
    coef: (lv: number) => 1.5 * (lv >= 2 ? 1.2 : 1), // Lv.2 피해 +20%
    extraBurst: (lv: number) => lv >= 4, // Lv.4 추가 화염 공격(0.3초 뒤 한 번 더)
    burn: (lv: number) => lv >= 5, // Lv.5 화상 부여(기본공격 화상과 같은 상태)
  },
  ice: {
    interval: () => 1500,
    count: (lv: number) => 1 + Math.floor(lv / 2),
    coef: (lv: number) => 0.6 + lv * 0.3,
    slow: (lv: number) => 0.35 + lv * 0.05, // 느려지는 비율
    slowMs: () => 2000,
  },
  lightning: {
    interval: (lv: number) => 2300 - lv * 150,
    chains: (lv: number) => 2 + lv, // 첫 대상 + 튀는 횟수
    jump: () => 4 * M, // 다음 적으로 튈 수 있는 거리
    coef: (lv: number) => 1.0 + lv * 0.5,
  },
  meteor: {
    interval: (lv: number) => 5200 - lv * 500,
    count: (lv: number) => (lv >= 4 ? 2 : 1),
    radius: (lv: number) => 2 * M + lv * 15,
    coef: (lv: number) => 2.5 + lv * 1.2,
    warnMs: () => 700, // 떨어지기 전 경고 원 표시 시간
  },
  orb: {
    count: (lv: number) => Math.min(lv, 4) + (lv >= 5 ? 1 : 0),
    radius: () => 2.6 * M, // 드래곤에서 오브까지 거리
    spin: (lv: number) => 2.6 + lv * 0.2, // 초당 회전(라디안)
    coef: (lv: number) => 0.6 + lv * 0.3,
    hitCooldown: () => 450, // 같은 적을 다시 때리기까지(ms)
  },
  wind: {
    interval: (lv: number) => 3200 - lv * 200,
    radius: (lv: number) => 2.8 * M + lv * 15,
    coef: (lv: number) => 0.8 + lv * 0.3,
    push: (lv: number) => 420 + lv * 40, // 밀쳐내는 속도(px/초)
    pushMs: () => 250,
  },
} as const;

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const m1 = (px: number) => `${(px / M).toFixed(1)}m`;
/** 패시브 누적 수치(레벨 × 한 번 값) */
const passiveStat = (label: string, per: number, unit: string, sign = '+') => (lv: number): Record<string, string> => ({ [label]: `${sign}${Math.round(per * lv * 100) / 100}${unit}` });

export const UPGRADES: Upgrade[] = [
  // ───────── 고유 기본공격 (레드 드래곤) ─────────
  // 6단계: 이름·아이콘·설명은 지금 출격한 드래곤의 기본 공격을 따른다(setBasicCard). 최대 Lv.7은 10종 공통.
  {
    id: 'basic', kind: 'basic', maxLevel: 7,
    get icon() {
      return currentBasic.icon;
    },
    get name() {
      return currentBasic.name;
    },
    describe: (lv) => currentBasic.levels[lv - 1].text,
    get tags() {
      return currentBasicTags;
    },
    stat: (lv) => {
      const L = currentBasic.levels[lv - 1];
      if (!L || L.shots == null) return {};
      const out: Record<string, string> = { 투사체: `${L.shots}발`, '한 발 피해': pct((L.coef ?? 1) * (L.levelMod ?? 1)) };
      if (L.interval) out['공격 간격'] = sec(L.interval);
      if (L.pierce) out['관통'] = `${L.pierce}`;
      if (L.chain) out['연쇄'] = `${L.chain}회`;
      return out;
    },
  },

  // ───────── 액티브 6종 (기획서 v0.1 핵심 공격 스킬) ─────────
  {
    id: 'breath', kind: 'active', icon: '🔥', name: '화염 브레스', maxLevel: 5, tags: ['화염', '범위'],
    stat: (lv) => ({ 피해: pct(SKILL.breath.coef(lv)), 범위: m1(SKILL.breath.range(lv)), 각도: `${Math.round(SKILL.breath.angle(lv))}°`, 공격: SKILL.breath.extraBurst(lv) ? '2회' : '1회', 화상: SKILL.breath.burn(lv) ? '있음' : '없음' }),
    describe: (lv) =>
      [
        `${sec(SKILL.breath.interval())}마다 앞쪽 부채꼴 화염 (${pct(SKILL.breath.coef(1))})`,
        '피해량 +20%',
        '범위·각도 +20%',
        '추가 화염 공격 (0.3초 뒤 한 번 더)',
        '화상 부여 (초당 공격력 20%, 3초, 최대 3중첩)',
      ][lv - 1],
  },
  {
    id: 'ice', kind: 'active', icon: '❄️', name: '얼음 파편', maxLevel: 5, tags: ['빙결', '투사체'],
    stat: (lv) => ({ 투사체: `${SKILL.ice.count(lv)}개`, 피해: pct(SKILL.ice.coef(lv)), 둔화: pct(SKILL.ice.slow(lv)) }),
    describe: (lv) =>
      lv === 1
        ? `가까운 적에게 얼음 파편 (${pct(SKILL.ice.coef(1))}), 맞으면 ${pct(SKILL.ice.slow(1))} 느려짐`
        : `파편 ${SKILL.ice.count(lv)}개, 피해 ${pct(SKILL.ice.coef(lv))}, 둔화 ${pct(SKILL.ice.slow(lv))}`,
  },
  {
    id: 'lightning', kind: 'active', icon: '⚡', name: '번개 숨결', maxLevel: 5, tags: ['번개', '연쇄'],
    stat: (lv) => ({ 연쇄: `${SKILL.lightning.chains(lv)}마리`, 피해: pct(SKILL.lightning.coef(lv)), 간격: sec(SKILL.lightning.interval(lv)) }),
    describe: (lv) =>
      lv === 1
        ? `적 ${SKILL.lightning.chains(1)}마리 사이를 튀는 번개 (${pct(SKILL.lightning.coef(1))})`
        : `${SKILL.lightning.chains(lv)}마리 연쇄, 피해 ${pct(SKILL.lightning.coef(lv))}`,
  },
  {
    id: 'meteor', kind: 'active', icon: '☄️', name: '드래곤 메테오', maxLevel: 5, tags: ['화염', '범위'],
    stat: (lv) => ({ 운석: `${SKILL.meteor.count(lv)}개`, 피해: pct(SKILL.meteor.coef(lv)), 범위: m1(SKILL.meteor.radius(lv)), 간격: sec(SKILL.meteor.interval(lv)) }),
    describe: (lv) =>
      lv === 1
        ? `${sec(SKILL.meteor.interval(1))}마다 적 밀집 지점에 운석 (${pct(SKILL.meteor.coef(1))})`
        : `운석 ${SKILL.meteor.count(lv)}개, 피해 ${pct(SKILL.meteor.coef(lv))}, 간격 ${sec(SKILL.meteor.interval(lv))}`,
  },
  {
    id: 'orb', kind: 'active', icon: '🐲', name: '드래곤 오브', maxLevel: 5, tags: ['회전', '근접'],
    stat: (lv) => ({ 보주: `${SKILL.orb.count(lv)}개`, 피해: pct(SKILL.orb.coef(lv)), 회전: `${SKILL.orb.spin(lv).toFixed(1)}` }),
    describe: (lv) =>
      lv === 1
        ? `주위를 도는 보주 1개 (닿은 적 ${pct(SKILL.orb.coef(1))})`
        : `보주 ${SKILL.orb.count(lv)}개, 피해 ${pct(SKILL.orb.coef(lv))}, 더 빠르게 회전`,
  },
  {
    id: 'wind', kind: 'active', icon: '🌪️', name: '날개 폭풍', maxLevel: 5, tags: ['범위', '밀쳐내기'],
    stat: (lv) => ({ 피해: pct(SKILL.wind.coef(lv)), 범위: m1(SKILL.wind.radius(lv)), 간격: sec(SKILL.wind.interval(lv)) }),
    describe: (lv) =>
      lv === 1
        ? `${sec(SKILL.wind.interval(1))}마다 주변 회오리, 적을 밀쳐냄 (${pct(SKILL.wind.coef(1))})`
        : `피해 ${pct(SKILL.wind.coef(lv))}, 범위·밀쳐내기 증가, 간격 ${sec(SKILL.wind.interval(lv))}`,
  },

  // ───────── 패시브 8종 (기획서 v0.1 5장: 최대 레벨 효과를 5레벨로 나눔) ─────────
  { id: 'heart', kind: 'passive', icon: '❤️', name: '용의 심장', maxLevel: 5, tags: ['생존'], stat: passiveStat('최대 HP', 10, ''), describe: () => '최대 HP +10% (늘어난 만큼 회복)', apply: (s) => (s.maxHp += 10) },
  { id: 'scale', kind: 'passive', icon: '🛡️', name: '용의 비늘', maxLevel: 5, tags: ['생존'], stat: passiveStat('받는 피해', 4, '%', '−'), describe: () => '받는 피해 −4%', apply: (s) => (s.damageTaken -= 0.04) },
  { id: 'amp', kind: 'passive', icon: '🔮', name: '마력 증폭', maxLevel: 5, tags: ['액티브 강화'], stat: passiveStat('스킬 피해', 8, '%'), describe: () => '액티브 스킬 피해 +8% (기본공격 제외)', apply: (s) => (s.skillDamageMult += 0.08) },
  { id: 'clock', kind: 'passive', icon: '⏳', name: '고대의 시계', maxLevel: 5, tags: ['액티브 강화'], stat: passiveStat('재사용 대기', 5, '%', '−'), describe: () => '액티브 재사용 대기시간 −5% (기본공격 제외)', apply: (s) => (s.cooldownMult -= 0.05) },
  { id: 'eye', kind: 'passive', icon: '👁️', name: '용의 눈', maxLevel: 5, tags: ['치명'], stat: passiveStat('치명타 확률', 3, '%'), describe: () => '치명타 확률 +3% (치명타 피해 150%)', apply: (s) => (s.critChance += 0.03) },
  { id: 'wings', kind: 'passive', icon: '🪽', name: '폭풍의 날개', maxLevel: 5, tags: ['이동'], stat: passiveStat('이동 속도', 5, '%'), describe: () => '이동 속도 +5%', apply: (s) => (s.speed += 260 * 0.05) },
  { id: 'reach', kind: 'passive', icon: '🌀', name: '마력 확장', maxLevel: 5, tags: ['범위'], stat: passiveStat('공격 범위', 6, '%'), describe: () => '공격 범위 +6%', apply: (s) => (s.areaMult += 0.06) },
  { id: 'greed', kind: 'passive', icon: '💎', name: '탐욕의 보석', maxLevel: 5, tags: ['성장'], stat: passiveStat('경험치', 6, '%'), describe: () => '경험치 획득량 +6%', apply: (s) => (s.xpMult += 0.06) },
];

// 후보가 3장보다 적을 때 채우는 보조 카드
export const FILLERS: Upgrade[] = [
  { id: 'heal', kind: 'filler', icon: '🍖', name: '용의 만찬', maxLevel: 99, describe: () => '체력 30% 회복' },
  { id: 'gold', kind: 'filler', icon: '🪙', name: '보물 더미', maxLevel: 99, describe: () => '골드 +20' },
];

// 카드 유형 가중치 (기획서 v0.2 9쪽): 새 액티브 35 / 액티브 강화 30 / 기본공격 강화 15 / 패시브 20
type OfferType = 'newActive' | 'upActive' | 'basic' | 'passive';
const WEIGHTS: Record<OfferType, number> = { newActive: 35, upActive: 30, basic: 15, passive: 20 };

export interface OfferState {
  levels: Map<string, number>; // 카드별 현재 레벨(0 = 없음)
  playerLevel: number; // 이번 카드로 도달한 전투 레벨
  basicEverOffered: boolean; // 지금까지 기본공격 카드가 한 번이라도 나왔는지
}

/**
 * 레벨업 카드 3장 만들기 (기획서 v0.2 13쪽 순서):
 * 1) 슬롯·최대 레벨로 유효 후보를 거르고  2) 보장 규칙과 가중치로 유형을 뽑고
 * 3) 한 화면에 같은 카드가 없게 3장을 채운다. 모자라면 보조 카드.
 */
export function rollOffer(st: OfferState, rnd: () => number = Math.random): Upgrade[] {
  const lv = (id: string) => st.levels.get(id) ?? 0;
  const owned = (kind: CardKind) => UPGRADES.filter((u) => u.kind === kind && lv(u.id) > 0).length;
  const notMax = (u: Upgrade) => lv(u.id) < u.maxLevel;

  const pools: Record<OfferType, Upgrade[]> = {
    newActive: owned('active') < ACTIVE_SLOTS ? UPGRADES.filter((u) => u.kind === 'active' && lv(u.id) === 0) : [],
    upActive: UPGRADES.filter((u) => u.kind === 'active' && lv(u.id) > 0 && notMax(u)),
    basic: UPGRADES.filter((u) => u.kind === 'basic' && notMax(u)),
    passive: UPGRADES.filter(
      (u) => u.kind === 'passive' && notMax(u) && (lv(u.id) > 0 || owned('passive') < PASSIVE_SLOTS),
    ),
  };

  const picked: Upgrade[] = [];
  const take = (type: OfferType) => {
    const pool = pools[type].filter((u) => !picked.includes(u));
    if (pool.length === 0) return false;
    picked.push(pool[Math.floor(rnd() * pool.length)]);
    return true;
  };

  // 보장 규칙: 레벨 4까지 기본공격 카드가 한 번도 안 나왔거나, 레벨 9까지 기본공격 Lv.3 미만이면 한 칸 보장
  const basicLv = lv('basic');
  const guarantee = (st.playerLevel > 4 && !st.basicEverOffered) || (st.playerLevel > 9 && basicLv < 3);
  if (guarantee) take('basic');
  // 초반(첫 두 번의 레벨업)에는 공격 방식이 눈에 띄게 바뀌는 새 액티브를 한 장 보장(2026-11-20 개선 6번)
  if (st.playerLevel <= 3 && owned('active') < st.playerLevel - 1) take('newActive');

  while (picked.length < 3) {
    const types = (Object.keys(WEIGHTS) as OfferType[]).filter((t) => pools[t].some((u) => !picked.includes(u)));
    if (types.length === 0) break;
    const total = types.reduce((a, t) => a + WEIGHTS[t], 0);
    let r = rnd() * total;
    const type = types.find((t) => (r -= WEIGHTS[t]) < 0) ?? types[types.length - 1];
    take(type);
  }
  for (const f of FILLERS) if (picked.length < 3) picked.push(f);
  return picked;
}

// ───────── 조합 안내(2026-11-20 개선 6번) ─────────
/** 연계 판단에서 빼는 너무 흔한 태그 */
const WEAK_TAGS = ['투사체'];

/**
 * 이 카드가 지금 보유한 스킬과 어울리면 그 스킬 이름을 돌려준다(없으면 null).
 * - 같은 조합 태그(화염·빙결·연쇄·범위 …)를 가진 보유 스킬
 * - 마력 증폭·고대의 시계(액티브 강화)는 보유 액티브와 연계
 */
export function synergyWith(u: Upgrade, levels: Map<string, number>): string | null {
  if (u.kind === 'filler') return null;
  const owned = UPGRADES.filter((o) => o.id !== u.id && (levels.get(o.id) ?? 0) > 0);
  if (u.tags?.includes('액티브 강화')) return owned.find((o) => o.kind === 'active')?.name ?? null;
  const mine = (u.tags ?? []).filter((t) => !WEAK_TAGS.includes(t));
  // 겹치는 태그가 가장 많은 보유 스킬(예: 메테오 화염·범위 → 브레스 화염·범위가 화염탄 화염보다 우선)
  let best: Upgrade | null = null;
  let bestN = 0;
  for (const o of owned) {
    const n = (o.tags ?? []).filter((t) => mine.includes(t)).length;
    if (n > bestN) {
      bestN = n;
      best = o;
    }
  }
  if (best) return best.name;
  if (u.kind === 'active') return owned.find((o) => o.tags?.includes('액티브 강화'))?.name ?? null;
  return null;
}

/** 강화 전후 차이 한 줄: "피해 150% → 180% · 범위 4.4m → 5.3m". 새 스킬(nextLevel 1)이면 얻는 값만 */
export function compareText(u: Upgrade, nextLevel: number): string {
  if (!u.stat) return '';
  const after = u.stat(nextLevel);
  if (nextLevel <= 1) return Object.entries(after).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ');
  const before = u.stat(nextLevel - 1);
  return Object.keys(after).filter((k) => before[k] !== after[k]).map((k) => `${k} ${before[k] ?? '—'} → ${after[k]}`).join(' · ');
}
