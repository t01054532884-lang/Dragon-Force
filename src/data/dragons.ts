import { M } from './stats';
import { RED_BASIC } from './basicAttack';

// 개발 6단계 — 드래곤 10종 (제작자 기획서 6단계 v1.0, 2026-11-18)
// 원문에 없는 전투 수치(공격 주기·계수·상태이상 확률 등)는 AI 1차안이다. 모두 이 파일에 모아
// 테스트로 조정한다. 1차안 기준: 공격력 100일 때 Lv.5 단일 대상 DPS가 레드(152.9)와 크게 벌어지지 않게,
// 대신 다수 대상·제어·생존에서 차이를 낸다(`docs/DRAGONS.md` 측정표).

export type DragonId = 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'black' | 'stone' | 'wind' | 'water' | 'arcane';
export type DragonRarity = 'starter' | 'common' | 'rare' | 'epic' | 'legendary';
export type DragonElement = 'fire' | 'ice' | 'lightning' | 'poison' | 'light' | 'dark' | 'earth' | 'wind' | 'water' | 'arcane';

export const RARITY_LABEL: Record<DragonRarity, string> = { starter: '기본', common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };
export const RARITY_COLOR: Record<DragonRarity, number> = { starter: 0xb0bec5, common: 0x9ccc65, rare: 0x4fc3f7, epic: 0xba68c8, legendary: 0xffb300 };
export const ELEMENT_LABEL: Record<DragonElement, string> = {
  fire: '화염', ice: '얼음', lightning: '번개', poison: '독', light: '빛', dark: '암흑', earth: '대지', wind: '바람', water: '물', arcane: '신비',
};

/** 기본 공격 한 레벨의 상태(앞 레벨 효과를 모두 포함한 누적값) */
export interface BasicLevel {
  shots: number; // 한 공격 주기의 투사체 수
  coef: number; // 한 발 피해 계수(1.0 = 공격력 100%)
  levelMod: number; // 레벨 강화 배율(피해 +20% 같은 것)
  interval: number; // 공격 주기(ms)
  speed: number; // 탄속(px/초)
  homing: number; // 추적 회전 속도(라디안/초). 0이면 직선
  pierce: number; // 추가로 꿰뚫는 적 수
  scale: number; // 투사체 크기 배율(시각·명중 판정)
  chain: number; // 적중 후 튀는 횟수(번개)
  slow?: { ratio: number; ms: number };
  freeze?: { chance: number; ms: number; burst?: { radius: number; coef: number } };
  burn?: boolean; // 레드 화상(초당 20%, 3초, 3중첩)
  poison?: { perSec: number; ms: number; maxStacks: number };
  shock?: { mult: number; ms: number }; // 감전: 받는 피해 증가
  knock?: { speed: number; ms: number };
  stun?: { chance: number; ms: number };
  explodeEvery?: number; // N번째 발사 묶음의 첫 발이 적중하면 폭발(1이면 매번)
  explosion?: { radius: number; coef: number; color: number };
  splash?: { radius: number; coef: number; knock?: number }; // 적중 지점 주변 다른 적에게 피해(충격파)
  split?: { count: number; coef: number; homing: number }; // 적중 시 분열
  shardsOnKill?: { count: number; coef: number }; // 기본 공격으로 처치 시 파편
  cloud?: { every: number; radius: number; ms: number }; // N번째 묶음마다 독구름(0.5초마다 중독 1중첩)
  poisonBurst?: { radius: number; coef: number }; // 중독된 적이 죽으면 독 폭발
  healChance?: number; // 처치 회복 확률(화이트 Lv.5 강화)
  spin?: { count: number; radius: number; coef: number; speed: number }; // 회전 칼날
  wave?: { every: number; radius: number; coef: number }; // 주기적 파도
  // ── 6단계 v1.2 영구 성장(permGrowth.ts)이 덧붙이는 값. 전투 중 Lv.1~7 데이터에는 없다 ──
  bounce?: number; // 적중 후 근처 다른 적으로 튕기는 횟수
  burnMult?: number; // 화상 피해 배율
  freezeShards?: { count: number; coef: number }; // 얼어붙는 순간 파편
  blast?: { every: number; radius: number; coef: number; color: number; status: boolean }; // 최종 고유 공격 폭발
  areaBonus?: number; // 범위 +x
  text: string; // 카드 설명
}

export interface BasicSpec {
  name: string;
  icon: string;
  texture: string; // 투사체 그림
  range: number; // 사거리(px)
  life: number; // 투사체 최대 비행 시간(ms)
  retarget: number; // 추적탄: 대상이 죽으면 이 반경에서 새 대상
  sameVolley: number; // 같은 묶음이 같은 적을 다시 맞히면 이 배율(레드 규칙을 모두에게)
  chainRange: number;
  chainFalloff: number; // 연쇄 1회마다 피해 감소율(0.3 = 30% 감소)
  levels: BasicLevel[];
}

/** 드래곤 고유 특성 중 기본 공격 엔진이 직접 쓰는 값(별 등급 특성 강화까지 반영된 값) */
export interface BasicTraits {
  intervalMult: number; // 아케인: 재사용 대기시간 −10%
  poisonDurMult: number; // 그린: 중독 지속 +30%
  slowDurMult: number; // 워터: 둔화 지속 +15%
  chainRelief: number; // 옐로: 연쇄 감소율 20% 완화(상대값)
  killHealChance: number; // 화이트: 처치 회복 확률
  killHealPct: number;
  healAdd: number; // 화이트 영구 성장: 처치 회복 확률 +x
  executeBonus: number; // 블랙: HP 30% 이하 적에게 기본 공격 피해 +x(특성 + 영구 성장)
  extraChain: number; // 천둥의 문장(장착형 특수 스킬): 연쇄가 있는 기본 공격의 연쇄 +n
}

export const NO_TRAITS: BasicTraits = { intervalMult: 1, poisonDurMult: 1, slowDurMult: 1, chainRelief: 0, killHealChance: 0, killHealPct: 0, healAdd: 0, executeBonus: 0, extraChain: 0 };

export interface DragonDef {
  id: DragonId;
  name: string; // 레드 드래곤
  short: string; // 레드
  element: DragonElement;
  rarity: DragonRarity;
  role: string;
  /** 대표 색(그림·UI), 콘셉트 아틀라스 색을 참고 */
  color: number;
  accent: number;
  belly: number;
  baseAttack: number;
  baseHp: number;
  baseMoveSpeed: number;
  trait: { id: string; text: string; value: number };
  basic: BasicSpec;
}

// ───────── 레벨 누적 도우미: Lv.1 상태에 레벨별 변경분을 차례로 덧붙인다 ─────────
type Delta = Partial<BasicLevel> & { text: string };
function build(base: Omit<BasicLevel, 'text'>, deltas: Delta[]): BasicLevel[] {
  const out: BasicLevel[] = [];
  let cur = { ...base, text: '' } as BasicLevel;
  for (const d of deltas) {
    cur = { ...cur, ...d };
    out.push(cur);
  }
  return out;
}

const STRAIGHT = { speed: 560, homing: 0, pierce: 0, scale: 1, chain: 0 };
const common = (name: string, icon: string, texture: string, levels: BasicLevel[], extra: Partial<BasicSpec> = {}): BasicSpec => ({
  name, icon, texture, range: 12 * M, life: 1600, retarget: 3 * M, sameVolley: RED_BASIC.sameVolley, chainRange: 3.5 * M, chainFalloff: 0.3, levels, ...extra,
});

// ───────── 레드: 기존 구현(기획서 v0.2·BALANCE.md 검증값)을 그대로 보존 ─────────
// 6단계 기획서 표(Lv.2 2발 · Lv.3 +20% · Lv.5 범위 · Lv.7 매 적중 폭발 +30%)와 다르지만,
// 기획서 지시대로 "기존 수치를 보존하고 별도 밸런스 변경으로" 처리한다(검토 기록 참고).
const RED: BasicSpec = {
  name: RED_BASIC.name, icon: RED_BASIC.icon, texture: 'fireball', range: RED_BASIC.range, life: RED_BASIC.life,
  retarget: RED_BASIC.retarget, sameVolley: RED_BASIC.sameVolley, chainRange: 0, chainFalloff: 0,
  levels: RED_BASIC.levels.map((L) => ({
    shots: L.shots, coef: L.coef, levelMod: L.levelMod, interval: L.interval, speed: RED_BASIC.speed, homing: RED_BASIC.turnRate,
    pierce: 0, scale: 1, chain: 0, burn: L.burn,
    explodeEvery: L.explodeEvery || undefined,
    explosion: L.explodeEvery ? { radius: RED_BASIC.explosion.radius, coef: RED_BASIC.explosion.coef, color: 0xff4500 } : undefined,
    text: L.text,
  })),
};

// ───────── 블루: 얼음탄 — 둔화·빙결 ─────────
const BLUE = common('얼음탄', '🧊', 'bolt-ice', build(
  { ...STRAIGHT, speed: 520, shots: 1, coef: 1.0, levelMod: 1, interval: 1200, slow: { ratio: 0.3, ms: 1500 } },
  [
    { text: '가장 가까운 적에게 얼음탄 1발, 맞은 적 30% 둔화(1.5초)' },
    { shots: 2, coef: 0.75, text: '얼음탄 2발(각 75%)' },
    { slow: { ratio: 0.45, ms: 2000 }, text: '둔화 강화: 45%, 2초' },
    { shots: 3, coef: 0.65, text: '얼음탄 3발(각 65%)' },
    { levelMod: 1.15, text: '피해 +15%' },
    { freeze: { chance: 0.1, ms: 1000 }, text: '빙결: 10% 확률로 1초 얼림(엘리트·보스는 강한 둔화)' },
    { freeze: { chance: 0.1, ms: 1000, burst: { radius: 1.8 * M, coef: 1.2 } }, text: '진화 — 빙결 폭발: 얼어붙는 순간 주변 1.8m 얼음 폭발(120%)' },
  ],
));

// ───────── 옐로: 번개탄 — 연쇄 ─────────
const YELLOW = common('번개탄', '⚡', 'bolt-lightning', build(
  { ...STRAIGHT, speed: 900, shots: 1, coef: 1.05, levelMod: 1, interval: 1150 },
  [
    { text: '빠른 번개탄 1발(105%)' },
    { chain: 1, text: '연쇄 1회: 맞은 적 근처(3.5m) 다른 적에게 튐(튈 때마다 피해 −30%)' },
    { levelMod: 1.2, text: '피해 +20%' },
    { shots: 2, coef: 0.8, text: '번개탄 2발(각 80%)' },
    { chain: 2, text: '연쇄 2회' },
    { shock: { mult: 1.1, ms: 2000 }, text: '감전: 맞은 적이 2초 동안 모든 피해를 10% 더 받음' },
    { chain: 4, text: '진화 — 연쇄 4회' },
  ],
));

// ───────── 그린: 독액탄 — 중독 ─────────
const POISON = (perSec: number, ms: number) => ({ perSec, ms, maxStacks: 5 });
const GREEN = common('독액탄', '🧪', 'bolt-poison', build(
  { ...STRAIGHT, speed: 480, shots: 1, coef: 0.8, levelMod: 1, interval: 1200, poison: POISON(0.08, 3000) },
  [
    { text: '독액탄 1발(80%) + 중독(초당 8%, 3초, 최대 5중첩)' },
    { poison: POISON(0.12, 3000), text: '중독 강화: 초당 12%' },
    { shots: 2, coef: 0.65, text: '독액탄 2발(각 65%)' },
    { poison: POISON(0.12, 3750), text: '독 지속 +25%' },
    { shots: 3, coef: 0.55, text: '독액탄 3발(각 55%)' },
    { cloud: { every: 3, radius: 1.5 * M, ms: 2500 }, text: '독구름: 3번째 공격마다 적중 지점에 2.5초 독구름(0.5초마다 중독 1중첩)' },
    { poisonBurst: { radius: 1.8 * M, coef: 0.8 }, text: '진화 — 독 폭발: 중독된 적이 죽으면 주변 1.8m 폭발(80%) + 중독 전염' },
  ],
));

// ───────── 화이트: 빛탄 — 관통·회복 ─────────
const WHITE = common('빛탄', '✨', 'bolt-light', build(
  { ...STRAIGHT, speed: 640, shots: 1, coef: 1.0, levelMod: 1, interval: 1150 },
  [
    { text: '빛탄 1발' },
    { pierce: 1, text: '관통 1회' },
    { levelMod: 1.2, text: '피해 +20%' },
    { shots: 2, coef: 0.8, text: '빛탄 2발(각 80%)' },
    { healChance: 0.04, text: '회복 확률 증가: 기본 공격 처치 시 4% 확률로 최대 HP 1% 회복' },
    { pierce: 3, text: '관통 3회' },
    { explodeEvery: 4, explosion: { radius: 2 * M, coef: 1.4, color: 0xfff3c4 }, text: '진화 — 빛 폭발: 4번째 공격마다 반경 2m 폭발(140%)' },
  ],
));

// ───────── 블랙: 암흑탄 — 관통·추가 피해 ─────────
const BLACK = common('암흑탄', '🌑', 'bolt-dark', build(
  { ...STRAIGHT, speed: 600, shots: 1, coef: 1.05, levelMod: 1, interval: 1200 },
  [
    { text: '암흑탄 1발(105%)' },
    { pierce: 1, text: '관통 1회' },
    { levelMod: 1.2, text: '피해 +20%' },
    { shots: 2, coef: 0.8, text: '암흑탄 2발(각 80%)' },
    { pierce: 3, text: '관통 3회' },
    { shardsOnKill: { count: 3, coef: 0.5 }, text: '처치 시 파편: 기본 공격으로 처치하면 암흑 파편 3개(각 50%)' },
    { explodeEvery: 5, explosion: { radius: 2.2 * M, coef: 1.6, color: 0x7e57c2 }, text: '진화 — 암흑 폭발: 5번째 공격마다 반경 2.2m 폭발(160%)' },
  ],
));

// ───────── 스톤: 바위탄 — 넉백·방어 ─────────
const STONE = common('바위탄', '🪨', 'bolt-rock', build(
  { ...STRAIGHT, speed: 430, shots: 1, coef: 1.2, levelMod: 1, interval: 1400, scale: 1.2, knock: { speed: 300, ms: 120 } },
  [
    { text: '묵직한 바위탄 1발(120%), 맞은 적을 밀어냄' },
    { knock: { speed: 460, ms: 150 }, text: '넉백 강화' },
    { levelMod: 1.25, text: '피해 +25%' },
    { shots: 2, coef: 0.95, text: '바위탄 2발(각 95%)' },
    { scale: 1.44, splash: { radius: 1.0 * M, coef: 0.4 }, text: '범위 +20%: 더 큰 바위, 맞은 자리 1m 파편(40%)' },
    { stun: { chance: 0.12, ms: 800 }, text: '기절: 12% 확률로 0.8초 기절(엘리트·보스는 강한 둔화)' },
    { splash: { radius: 1.8 * M, coef: 0.6, knock: 380 }, text: '진화 — 충격파: 맞은 자리 1.8m 충격파(60%) + 밀쳐냄' },
  ],
));

// ───────── 윈드: 바람 칼날 — 다중 투사체·연사 ─────────
const WIND = common('바람 칼날', '🌪️', 'bolt-wind', build(
  { ...STRAIGHT, speed: 720, shots: 1, coef: 0.75, levelMod: 1, interval: 900 },
  [
    { text: '빠른 바람 칼날 1개(75%), 0.9초마다' },
    { shots: 2, coef: 0.6, text: '칼날 2개(각 60%)' },
    { interval: 783, text: '연사 +15%(0.78초마다)' },
    { shots: 3, coef: 0.52, text: '칼날 3개(각 52%)' },
    { pierce: 1, text: '관통 1회' },
    { shots: 4, coef: 0.46, text: '칼날 4개(각 46%)' },
    { spin: { count: 2, radius: 1.5 * M, coef: 0.45, speed: 4.5 }, text: '진화 — 회전 칼날: 드래곤 주위를 도는 칼날 2개(45%)' },
  ],
), { life: 1100, range: 10 * M });

// ───────── 워터: 물탄 — 둔화·감속 ─────────
const WATER = common('물탄', '💧', 'bolt-water', build(
  { ...STRAIGHT, speed: 500, shots: 1, coef: 1.0, levelMod: 1, interval: 1200 },
  [
    { text: '물탄 1발' },
    { slow: { ratio: 0.25, ms: 1500 }, text: '둔화: 맞은 적 25% 느려짐(1.5초)' },
    { shots: 2, coef: 0.8, text: '물탄 2발(각 80%)' },
    { splash: { radius: 1.2 * M, coef: 0.35 }, text: '충격파: 맞은 자리 1.2m 물보라(35%) + 둔화' },
    { levelMod: 1.2, text: '피해 +20%' },
    { knock: { speed: 360, ms: 140 }, text: '넉백 강화: 맞은 적을 밀어냄' },
    { wave: { every: 4000, radius: 3.2 * M, coef: 1.0 }, text: '진화 — 파도: 4초마다 드래곤 주위 3.2m 파도(100%) + 둔화·밀쳐냄' },
  ],
));

// ───────── 아케인: 추적 마력탄 — 분열·추가 발동 ─────────
const ARCANE = common('추적 마력탄', '🔮', 'bolt-arcane', build(
  { ...STRAIGHT, speed: 520, homing: Math.PI * 1.5, shots: 1, coef: 0.9, levelMod: 1, interval: 1200 },
  [
    { text: '적을 쫓는 마력탄 1발(90%)' },
    { shots: 2, coef: 0.7, text: '마력탄 2발(각 70%)' },
    { homing: Math.PI * 4, speed: 620, text: '추적 강화: 더 빠르고 날카롭게 꺾임' },
    { shots: 3, coef: 0.6, text: '마력탄 3발(각 60%)' },
    { levelMod: 1.2, text: '피해 +20%' },
    { split: { count: 2, coef: 0.3, homing: 0 }, text: '적중 시 분열: 작은 마력탄 2개(각 30%)로 갈라짐' },
    { split: { count: 3, coef: 0.35, homing: Math.PI * 3 }, text: '진화 — 분열 + 추적: 3개(각 35%)로 갈라져 다른 적을 쫓음' },
  ],
), { life: 2000 });

// ───────── 10종 정의 ─────────
// 기본 능력치: 기획 수정안 v1.2 2장 표(Lv.1·1성·장비·연구소 미적용 기준). 레드는 기존과 같은 10 / 100 / 260.
const B = (baseAttack: number, baseHp: number, baseMoveSpeed: number) => ({ baseAttack, baseHp, baseMoveSpeed });

export const DRAGONS: Record<DragonId, DragonDef> = {
  red: { id: 'red', name: '레드 드래곤', short: '레드', element: 'fire', rarity: 'starter', role: '안정적인 범용 딜러', color: 0xd23b2a, accent: 0xff9a3c, belly: 0xf3d6a2, ...B(10, 100, 260), trait: { id: 'burnBonus', text: '5성부터: 화상 상태 적에게 피해 +20%', value: 0.2 }, basic: RED },
  blue: { id: 'blue', name: '블루 드래곤', short: '블루', element: 'ice', rarity: 'common', role: '둔화·빙결', color: 0x9cc8f0, accent: 0xe3f4ff, belly: 0xdcecff, ...B(10, 105, 255), trait: { id: 'slowBonus', text: '둔화된 적에게 추가 피해 +20%', value: 0.2 }, basic: BLUE },
  yellow: { id: 'yellow', name: '옐로 드래곤', short: '옐로', element: 'lightning', rarity: 'common', role: '연쇄 공격', color: 0xf2c230, accent: 0xfff27a, belly: 0xfff0c2, ...B(10.5, 95, 270), trait: { id: 'chainRelief', text: '연쇄 공격 피해 감소율 20% 완화', value: 0.2 }, basic: YELLOW },
  green: { id: 'green', name: '그린 드래곤', short: '그린', element: 'poison', rarity: 'common', role: '지속 피해', color: 0x4f9a3a, accent: 0xa35cff, belly: 0xc9e6a0, ...B(9.8, 110, 255), trait: { id: 'poisonDuration', text: '중독 지속시간 +30%', value: 0.3 }, basic: GREEN },
  white: { id: 'white', name: '화이트 드래곤', short: '화이트', element: 'light', rarity: 'rare', role: '관통·회복', color: 0xf2efe6, accent: 0xe7c25a, belly: 0xffffff, ...B(10.8, 120, 255), trait: { id: 'killHeal', text: '기본 공격 처치 시 2% 확률로 최대 HP 1% 회복', value: 0.02 }, basic: WHITE },
  black: { id: 'black', name: '블랙 드래곤', short: '블랙', element: 'dark', rarity: 'rare', role: '관통·추가 피해', color: 0x2e2540, accent: 0xa66bff, belly: 0x4a3d63, ...B(12, 100, 260), trait: { id: 'execute', text: 'HP 30% 이하인 적에게 기본 공격 피해 +20%', value: 0.2 }, basic: BLACK },
  stone: { id: 'stone', name: '스톤 드래곤', short: '스톤', element: 'earth', rarity: 'rare', role: '넉백·방어', color: 0x8d7558, accent: 0x7fae4e, belly: 0xb9a383, ...B(10.5, 135, 240), trait: { id: 'guard', text: '받는 피해 −10%', value: 0.1 }, basic: STONE },
  wind: { id: 'wind', name: '윈드 드래곤', short: '윈드', element: 'wind', rarity: 'epic', role: '다중 투사체·연사', color: 0x6fd6b8, accent: 0xd8fff3, belly: 0xe6fff7, ...B(12, 105, 285), trait: { id: 'swift', text: '이동속도 +10%', value: 0.1 }, basic: WIND },
  water: { id: 'water', name: '워터 드래곤', short: '워터', element: 'water', rarity: 'epic', role: '둔화·감속', color: 0x2fa6d9, accent: 0xff9ec4, belly: 0xbdeeff, ...B(11.5, 125, 260), trait: { id: 'slowDuration', text: '기본 공격 둔화 지속시간 +15%', value: 0.15 }, basic: WATER },
  arcane: { id: 'arcane', name: '아케인 드래곤', short: '아케인', element: 'arcane', rarity: 'legendary', role: '분열·추가 발동', color: 0x9b6fe0, accent: 0xff8de8, belly: 0xe9d9ff, ...B(14, 120, 275), trait: { id: 'haste', text: '기본 공격 재사용 대기시간 −10%', value: 0.1 }, basic: ARCANE },
};

export const DRAGON_ORDER: DragonId[] = ['red', 'blue', 'yellow', 'green', 'white', 'black', 'stone', 'wind', 'water', 'arcane'];

// ───────── 영구 육성 (6단계 기획서 6장) ─────────
export const GROWTH = {
  maxLevel: 40, // v1.2: 30 → 40
  attackPerLevel: 0.01, // Lv.1 초과 레벨마다 +1% (Lv.40 = +39%)
  hpPerLevel: 0.015, // Lv.40 = +58.5%
  maxStars: 5,
  starCost: [20, 40, 80, 160], // 1→2, 2→3, 3→4, 4→5성
  /**
   * 레벨업 골드 비용: ceil(60 × 1.12^(현재레벨−1)). Lv.1→30 누적 12,890G(기존 그대로).
   * Lv.31→40은 같은 곡선을 연장(제작자 결정 2026-11-18, 임시 밸런스 수치).
   */
  levelCost: (level: number) => Math.ceil(60 * Math.pow(1.12, level - 1)),
  /** 레벨업 카드 비용(v1.2 5장): 도달 레벨 2~10 1장 · 11~20 2장 · 21~30 3장 · 31~40 4장 → Lv.1→40 총 99장 */
  cardCost: (level: number) => (level < 10 ? 1 : level < 20 ? 2 : level < 30 ? 3 : 4),
};

/** 별 등급 보너스(누적): 2성 공격력 +5% · 3성 HP +5% · 4성 특성 강화 · 5성 공격력 +10%·특성 추가 강화 */
export function starBonus(stars: number): { attack: number; hp: number; traitMult: number } {
  return {
    attack: (stars >= 2 ? 0.05 : 0) + (stars >= 5 ? 0.1 : 0),
    hp: stars >= 3 ? 0.05 : 0,
    // v1.2 7장: 레드 외 9종은 1~3성 기본, 4성 ×1.5, 5성 ×2.0
    traitMult: stars >= 5 ? 2 : stars >= 4 ? 1.5 : 1,
  };
}

/** 고유 특성 배율. 레드는 1~4성 비활성(기존 DPS 보존), 5성부터 +20%(v1.2 7장) */
export function traitMultFor(id: DragonId, stars: number): number {
  if (id === 'red') return stars >= 5 ? 1 : 0;
  return starBonus(stars).traitMult;
}

export function levelBonus(level: number): { attack: number; hp: number } {
  const n = Math.max(0, Math.min(GROWTH.maxLevel, level) - 1);
  return { attack: n * GROWTH.attackPerLevel, hp: n * GROWTH.hpPerLevel };
}

// ───────── 소환 (6단계 기획서 5장) ─────────
export const SUMMON = {
  pool: DRAGON_ORDER.filter((id) => id !== 'red'),
  rarityWeights: { common: 70, rare: 22, epic: 7, legendary: 1 } as Record<Exclude<DragonRarity, 'starter'>, number>,
  rareGuarantee: 10, // 연속 9번 일반이면 10번째는 희귀 이상
  legendaryGuarantee: 90, // 89번 연속 전설이 아니면 90번째는 전설
};

/** 소환권 획득처(원문: 최초 클리어·이벤트·업적·튜토리얼). 수량은 원문 미정 → AI 1차안 */
export const TICKET_REWARDS = {
  tutorial: 1, // 처음 시작(기존 저장 이어받기 포함)
  firstClear: 10, // 단계 첫 클리어
  achievements: [
    { id: 'first-run', text: '첫 출격: 30초 이상 전투', tickets: 1 },
    { id: 'first-elite', text: '엘리트 첫 처치', tickets: 2 },
    { id: 'kills-1000', text: '마수 누적 1,000마리 처치', tickets: 2 },
    { id: 'kills-10000', text: '마수 누적 10,000마리 처치', tickets: 5 },
    { id: 'collector-3', text: '드래곤 3종 보유', tickets: 2 },
  ],
};
