import { M } from './stats';
import { DRAGONS, type DragonId } from './dragons';

// 드래곤 전용 액티브(기획 v1.2 3장 + v1.3 2장).
// v1.3(제작자 2026-11-18): "공격력 총 5배" 규칙 폐기 → 쓰는 순간의 **현재 기본 공격 DPS**를 기준으로 한다.
//   단일 공격형 DPS × 4초 · 광역 공격형 대상당 DPS × 3초(총합 최대 DPS × 12초) · 지속 피해형 5초간 DPS × 3초
//   회복형 현재 최대 HP 15% · 방어형 4초간 받는 피해 −25% · 이동 강화형 5초간 이동속도 +25% + 약한 범위 공격
// - 피해는 DPS로 이미 계산된 값이라 공격력·특성·치명타·마력 증폭 같은 보너스를 다시 곱하지 않는다(중복 적용 금지).
// - 전용 액티브 피해는 기본 공격 DPS 계산에 넣지 않는다.
// - 기본 공격 DPS = 공격력 × 한 발 계수 × 레벨 배율 × (1 + 추가 탄 × 같은 묶음 50%) ÷ 공격 주기(단일 대상, 화상·폭발 제외).
// 범위·지속시간·틱 수·이동 강화형의 "약한" 범위 공격 크기는 AI 1차안. 재사용 60초(원문). 실제 보스 처치 시간으로 다시 맞춘다.

export type SignatureKind = 'aoe' | 'beam' | 'single' | 'dot' | 'heal' | 'guard' | 'move' | 'counter';

export interface SignatureDef {
  name: string;
  icon: string;
  text: string; // 원문 효과
  detail: string; // 수치 설명
  kind: SignatureKind;
  cooldownMs: number;
  radius?: number; // px
  length?: number; // 전방형 길이(px)
  width?: number; // 전방형 폭의 절반(px)
  durationMs?: number;
  ticks?: number;
  slow?: { ratio: number; ms: number };
  freezeMs?: number;
  burn?: boolean;
  poison?: boolean;
  shock?: boolean;
  knock?: number;
  weaken?: { ratio: number; ms: number }; // 약화(신규: 샌드)
  root?: number; // 속박 ms(신규: 블룸)
  stunMs?: number; // 일반 적 기절 ms(신규: 하울, 엘리트·보스는 15% 둔화 1초)
  every?: number; // kind 'counter': 기본 공격 몇 번마다 자동 발동(전설 3종)
  perTargetSec?: number; // kind 'counter': 적마다 DPS × 이 초(총합은 aoeTotalCapSec 기준으로 나눔)
  color: number;
}

/**
 * 임시 밸런스 수치(설정 데이터).
 * 2026-11-20 전투 속도·성장 체감 개선 5번 "한 번 쓰면 주변 상황이 바뀌는 느낌": 10종 모두 강화.
 * (괄호 = 이전 값) 광역 반경 +25%, 대상당 3 → 4초, 총합 상한 12 → 24초(적이 많아도 약해지지 않게),
 * 단일 4 → 9초(엘리트·보스 우선), 지속 3 → 5초, 회복 15 → 30% + 피해 −30% 4초, 방어 −25%·4초 → −40%·6초 + 밀치며 피해,
 * 이동 +25%·5초 → +40%·6초, 회오리 1 → 3초. 보스는 한 번 사용에 최대 HP의 8%까지만(한 번에 사라지지 않게), 엘리트 25%.
 */
export const SIGNATURE_RULES = {
  cooldownMs: 60_000,
  singleSec: 9, // 단일 공격형: DPS × 9초(엘리트·보스 우선 조준)
  aoePerTargetSec: 4, // 광역: 대상당 DPS × 4초
  aoeTotalCapSec: 24, // 광역: 총합 최대 DPS × 24초
  dotSec: 5, // 지속 피해형: 5초 동안 대상당 총 DPS × 5초
  dotMs: 5000,
  heal: 0.3, // 회복형: 현재 최대 HP의 30%
  healGuardReduce: 0.3, // 회복형: 이어서 4초 동안 받는 피해 −30%
  healGuardMs: 4000,
  guardReduce: 0.4, // 방어형: 받는 피해 −40%
  guardMs: 6000,
  guardHitSec: 2, // 방어형: 밀쳐내며 대상당 DPS × 2초
  moveBoost: 0.4, // 이동 강화형: 이동속도 +40%
  moveMs: 6000,
  moveWeakSec: 3, // 이동 강화형 회오리: 6초 동안 대상당 총 DPS × 3초
  bossCapPct: 0.08, // 보스: 한 번 사용 피해 상한(최대 HP 비율)
  eliteCapPct: 0.25, // 엘리트: 한 번 사용 피해 상한
};

const R = SIGNATURE_RULES;
const CD = R.cooldownMs;
export const SIGNATURES: Record<DragonId, SignatureDef> = {
  red: { name: '화염 폭풍', icon: '🔥', text: '주변 광역 화염 피해', detail: `광역: 주변 5m, 적마다 DPS×${R.aoePerTargetSec}초(합계 최대 ${R.aoeTotalCapSec}초) + 화상`, kind: 'aoe', cooldownMs: CD, radius: 5 * M, burn: true, color: 0xff5a3d },
  blue: { name: '얼음 감옥', icon: '🧊', text: '주변 둔화·일반 적 빙결', detail: `광역: 주변 5.6m, 적마다 DPS×${R.aoePerTargetSec}초 + 일반 적 2.5초 빙결·50% 둔화 4초`, kind: 'aoe', cooldownMs: CD, radius: 5.6 * M, freezeMs: 2500, slow: { ratio: 0.5, ms: 4000 }, color: 0x9be7ff },
  yellow: { name: '천둥 폭발', icon: '⚡', text: '범위 내 연쇄 전격', detail: `광역: 주변 6.2m, 적마다 DPS×${R.aoePerTargetSec}초 + 감전 3초`, kind: 'aoe', cooldownMs: CD, radius: 6.2 * M, shock: true, color: 0xfff176 },
  green: { name: '독의 영역', icon: '☠', text: '일정 시간 독구름 생성', detail: `지속 피해: 드래곤을 따라다니는 4.4m 독구름 5초, 머문 적마다 총 DPS×${R.dotSec}초 + 중독`, kind: 'dot', cooldownMs: CD, radius: 4.4 * M, durationMs: R.dotMs, ticks: 10, poison: true, color: 0x8bc34a },
  white: { name: '신성한 가호', icon: '✚', text: 'HP 회복·짧은 피해 감소', detail: `회복: 최대 HP ${R.heal * 100}% 회복 + ${R.healGuardMs / 1000}초 동안 받는 피해 −${R.healGuardReduce * 100}% + 주변 3m 밀쳐냄`, kind: 'heal', cooldownMs: CD, radius: 3 * M, knock: 420, color: 0xfff3c4 },
  black: { name: '암흑 폭발', icon: '🌑', text: '전방 관통 광역 공격', detail: `광역: 적이 가장 많은 방향으로 12m·폭 4.5m 관통, 적마다 DPS×${R.aoePerTargetSec}초(합계 최대 ${R.aoeTotalCapSec}초)`, kind: 'beam', cooldownMs: CD, length: 12 * M, width: 2.25 * M, color: 0x7e57c2 },
  stone: { name: '대지의 수호', icon: '🪨', text: '일시적 피해 감소', detail: `방어: ${R.guardMs / 1000}초 동안 받는 피해 −${R.guardReduce * 100}% + 주변 4m 밀쳐내며 적마다 DPS×${R.guardHitSec}초`, kind: 'guard', cooldownMs: CD, radius: 4 * M, knock: 600, color: 0xb08d57 },
  wind: { name: '폭풍의 질주', icon: '🌪️', text: '이동속도 강화·주변 공격', detail: `이동 강화: ${R.moveMs / 1000}초 동안 이동속도 +${R.moveBoost * 100}% + 주변 3.2m 회오리(적마다 총 DPS×${R.moveWeakSec}초)`, kind: 'move', cooldownMs: CD, radius: 3.2 * M, durationMs: R.moveMs, ticks: 12, color: 0xb2fff0 },
  water: { name: '해일', icon: '🌊', text: '전방 넓은 파도 공격', detail: `광역: 적이 가장 많은 방향으로 8.5m·폭 7.6m, 적마다 DPS×${R.aoePerTargetSec}초 + 밀쳐냄·40% 둔화 3초`, kind: 'beam', cooldownMs: CD, length: 8.5 * M, width: 3.8 * M, knock: 520, slow: { ratio: 0.4, ms: 3000 }, color: 0x4fc3f7 },
  // 신규 1묶음(2026-11-22, AI 1차안 — docs/NEW_DRAGONS_SKILLS.md): 같은 예산 규칙(지속형 DPS×5초 · 단일형 DPS×9초 · 광역 총 24초)
  sand: { name: '모래 늪', icon: '🏜️', text: '주변에 모래 늪', detail: `지속: 주변 5m 모래 늪 6초, 안의 적 50% 둔화·약화(공격 피해 −20%) + 머문 적마다 총 DPS×${R.dotSec}초`, kind: 'dot', cooldownMs: CD, radius: 5 * M, durationMs: 6000, slow: { ratio: 0.5, ms: 700 }, weaken: { ratio: 0.2, ms: 1000 }, color: 0xd8b27a },
  steel: { name: '칼날비', icon: '⚔️', text: '하늘에서 강철 검이 떨어짐', detail: `단일+범위: 1.5초 동안 검 12자루가 적이 많은 곳에 떨어짐(처음 3자루는 엘리트·보스 우선), 자루마다 1.2m, 합계 DPS×${R.singleSec}초`, kind: 'single', cooldownMs: CD, durationMs: 1500, radius: 10 * M, color: 0xc9d0d6 },
  bloom: { name: '가시 정원', icon: '🌸', text: '가시 꽃이 다가온 적을 붙잡음', detail: '함정: 주변 4곳에 가시 꽃 8초, 다가온 적 속박 1.5초 + 피해(꽃마다 최대 3번, 한 번에 DPS×2초)', kind: 'aoe', cooldownMs: CD, radius: 2.6 * M, durationMs: 8000, root: 1500, color: 0xf48fb1 },
  howl: { name: '용의 포효', icon: '🐉', text: '사방으로 퍼지는 포효 3겹', detail: `광역: 주변 5.2m 음파 3겹, 적마다 DPS×${R.aoePerTargetSec}초(3겹 합) + 일반 적 1.5초 기절·밀쳐냄, 엘리트·보스 30% 둔화 3초`, kind: 'aoe', cooldownMs: CD, radius: 5.2 * M, stunMs: 1500, knock: 480, slow: { ratio: 0.3, ms: 3000 }, color: 0x8fa8ff },
  crimson: { name: '진홍의 갈증', icon: '🩸', text: '주변 베기 + 준 피해만큼 회복', detail: `광역: 주변 4.5m, 적마다 DPS×${R.aoePerTargetSec}초 + 준 피해의 10% 회복(최대 HP 25%까지)`, kind: 'aoe', cooldownMs: CD, radius: 4.5 * M, color: 0xc2185b },
  mirror: { name: '만화경', icon: '🪞', text: '거울 분신 3개가 함께 쏨', detail: `단일: 6초 동안 거울 분신 3개가 0.5초마다 가까운 적을 쏨(엘리트·보스 우선), 합계 DPS×${R.singleSec}초`, kind: 'single', cooldownMs: CD, durationMs: 6000, radius: 10 * M, color: 0x9be7ff },
  // 신규 3묶음(전설): 60초 전용 스킬 대신 기본 공격 N회마다 자동 발동하는 고유 공격(제작자 결정 2026-11-22)
  chrono: { name: '시계 폭탄', icon: '⏰', text: '기본 공격 5회마다 시계를 던져 3초 뒤 폭발', detail: '자동: 기본 공격 5회마다 적이 많은 곳에 시계 폭탄 → 3초 뒤 2.6m 폭발, 적마다 DPS×2.5초', kind: 'counter', cooldownMs: 0, every: 5, radius: 2.6 * M, durationMs: 3000, perTargetSec: 2.5, color: 0xe0a14a },
  void: { name: '중력 붕괴', icon: '🕳️', text: '기본 공격 10회마다 블랙홀로 끌어당김', detail: '자동: 기본 공격 10회마다 적이 많은 곳에 3m 블랙홀 2.5초 — 일반 적을 가운데로 끌어당기며 적마다 총 DPS×4초(엘리트·보스는 끌리지 않음)', kind: 'counter', cooldownMs: 0, every: 10, radius: 3 * M, durationMs: 2500, perTargetSec: 4, color: 0x7c4dff },
  aurora: { name: '극광의 장막', icon: '🌌', text: '기본 공격 20회마다 바라보는 방향으로 극광이 휩쓺', detail: '자동: 기본 공격 20회마다 드래곤이 바라보는 방향 14m·폭 4.4m 극광 휩쓸기, 적마다 DPS×6초', kind: 'counter', cooldownMs: 0, every: 20, length: 14 * M, width: 2.2 * M, perTargetSec: 6, color: 0x7cf2c4 },
  arcane: { name: '마력 폭주', icon: '🔮', text: '짧은 시간 추가 마력탄', detail: `단일: 4초 동안 마력탄 10발, 엘리트·보스 우선, 합계 DPS×${R.singleSec}초`, kind: 'single', cooldownMs: CD, durationMs: 4000, ticks: 10, radius: 11 * M, color: 0xb693ff },
};

/**
 * 필살기(2026-11-25 제작자 확정, docs/ULTIMATE.md): 60초 전용 스킬 → 3초 컷신이 나오는 필살기.
 * - 쿨타임: 일반~영웅 180초, 전설 120초. 전설 3종(크로노·보이드·오로라)의 "기본 공격 N회마다 자동"은 없애고 버튼 필살기로.
 * - 컷신이 끝나는 순간: 화면에 보이는 **일반 몬스터는 모두 처치**, 엘리트·보스는 D × 등급 배율
 *   (D = 지금 기본 공격 DPS × 광역 대상당 초 = 60초 스킬 한 번의 대상당 피해) — 일반·희귀 4배, 영웅 5배, 전설 6배(레드는 일반).
 *   체력이 많으면 살아남는다. 한 번 상한은 60초 스킬 3번 몫(보스 24%·엘리트 75%, 임시 — 봇으로 측정).
 * - 그 드래곤의 원래 전용 스킬 효과(화상·빙결·회복 등)도 같이 나간다(원래 상한 그대로).
 */
export const ULT_RULES = {
  cooldownMs: 180_000,
  legendaryCooldownMs: 120_000,
  mult: { starter: 4, common: 4, rare: 4, epic: 5, legendary: 6 } as Record<string, number>,
  bossCapPct: 0.24,
  eliteCapPct: 0.75,
  cutsceneMs: 3000,
};
export const ultCooldown = (id: DragonId): number => (DRAGONS[id].rarity === 'legendary' ? ULT_RULES.legendaryCooldownMs : ULT_RULES.cooldownMs);
export const ultMult = (id: DragonId): number => ULT_RULES.mult[DRAGONS[id].rarity] ?? 4;
/** 필살기가 엘리트·보스에게 한 번에 넣는 피해 상한 */
export const ultCap = (rank: 'normal' | 'elite' | 'boss', maxHp: number): number =>
  rank === 'boss' ? maxHp * ULT_RULES.bossCapPct : rank === 'elite' ? maxHp * ULT_RULES.eliteCapPct : Infinity;
/** 화면 설명: "필살기: 3초 연출 뒤 …" 한 줄 */
export function ultSummary(id: DragonId): string {
  return `연출 뒤 화면 안 일반 몬스터 모두 처치 · 엘리트·보스 피해 ×${ultMult(id)} · 재사용 ${ultCooldown(id) / 60_000}분`;
}
/** 같이 나가는 원래 전용 스킬 효과 설명(전설 3종의 "자동: 기본 공격 N회마다" 표현은 뺌) */
export function ultEffectText(id: DragonId): string {
  return SIGNATURES[id].detail.replace(/^자동: 기본 공격 \d+회마다 /, '');
}
/** 필살기 이름(시트 "180초 필살기" 1차안) */
export const ULT_NAMES: Record<DragonId, string> = {
  red: '불의 파도', blue: '절대영도', yellow: '천둥 그물', green: '독의 폭우', sand: '사막의 균열', steel: '천 개의 검',
  white: '성광의 기둥', black: '그림자 포식', stone: '운석 낙하', bloom: '천화의 만개', howl: '천지의 포효',
  wind: '대폭풍', water: '심해의 격류', crimson: '핏빛 초승달', mirror: '거울 세계',
  chrono: '시간 정지', void: '사건의 지평선', aurora: '극광의 심판', arcane: '마력 강림',
};

/** 광역형 한 마리당 피해: 대상당 DPS × 4초, 맞은 적이 많으면 총합 DPS × 24초를 나눈다 */
export function aoePerTarget(dps: number, targets: number): number {
  if (targets <= 0) return 0;
  return Math.min(dps * R.aoePerTargetSec, (dps * R.aoeTotalCapSec) / targets);
}

/** 엘리트·보스가 한 번 사용에 받는 피해 상한(최대 HP 비율). 일반 적은 상한 없음 */
export function signatureCap(rank: 'normal' | 'elite' | 'boss', maxHp: number): number {
  if (rank === 'boss') return maxHp * R.bossCapPct;
  if (rank === 'elite') return maxHp * R.eliteCapPct;
  return Infinity;
}

// ───────── 전용 스킬 성장(2026-11-21 종합 개선 기획서 3.4) ─────────
// 새 재화를 만들지 않고 기존 "드래곤 영구 레벨(카드+골드)"에 연결한다: Lv.10 · Lv.20 · Lv.30에서 한 단계씩.
// 피해는 단계당 +8%만(이펙트와 피해가 동시에 크게 오르지 않게), 나머지는 범위·개수·남는 시간 같은 "전투 방식" 변화.
export const SIG_TIER_LEVELS = [10, 20, 30];
export const sigTier = (dragonLevel: number): number => SIG_TIER_LEVELS.filter((l) => dragonLevel >= l).length;

export interface SigGrowth {
  dmg: number; // 피해 배율
  radius: number; // 범위·폭 배율
  count: number; // 칼날·빔·파도·마력탄·연쇄 수(종류별 의미)
  lingerMs: number; // 바닥에 남는 효과·보호막 등 유지 시간
}

/** 드래곤별 단계 값. 수치는 플레이 테스트용 1차안(docs/SIGNATURE_V2.md) */
export function sigGrowth(id: DragonId, tier: number): SigGrowth {
  const t = Math.max(0, Math.min(3, tier));
  const dmg = 1 + 0.08 * t;
  switch (id) {
    case 'red': return { dmg, radius: 1 + 0.08 * t, count: 0, lingerMs: 3000 + 1000 * t }; // 폭발 뒤 불길
    case 'blue': return { dmg, radius: 1 + 0.08 * t, count: 0, lingerMs: 3000 + 1000 * t }; // 냉기 장판
    case 'yellow': return { dmg, radius: 1 + 0.06 * t, count: 3 + 2 * t, lingerMs: 0 }; // 범위 밖으로 튀는 연쇄 번개
    case 'green': return { dmg, radius: 1 + 0.1 * t, count: 0, lingerMs: 5000 + 1000 * t }; // 따라다니는 독구름
    case 'white': return { dmg, radius: 1 + 0.1 * t, count: 0, lingerMs: 4000 + 1000 * t }; // 빛의 보호막
    case 'black': return { dmg, radius: 1 + 0.1 * t, count: 1 + Math.ceil(t / 2), lingerMs: 0 }; // 그림자 분신이 빔 추가
    case 'stone': return { dmg, radius: 1 + 0.08 * t, count: t >= 3 ? 3 : t >= 2 ? 2 : 1, lingerMs: 0 }; // 바위 파동 횟수
    case 'wind': return { dmg, radius: 1 + 0.1 * t, count: 2 + t, lingerMs: 500 * t }; // 회전 바람 칼날
    case 'water': return { dmg, radius: 1 + 0.1 * t, count: t >= 2 ? 2 : 1, lingerMs: 0 }; // 해일 횟수
    case 'arcane': return { dmg, radius: 1, count: 10 + 2 * t, lingerMs: 0 }; // 마력탄 수
    case 'sand': return { dmg, radius: 1 + 0.08 * t, count: 0, lingerMs: 6000 + 1000 * t }; // 모래 늪 유지
    case 'steel': return { dmg, radius: 1, count: 12 + 3 * t, lingerMs: 0 }; // 검 수
    case 'bloom': return { dmg, radius: 1 + 0.06 * t, count: 4 + t, lingerMs: 8000 + 1000 * t }; // 가시 꽃 수·유지
    case 'howl': return { dmg, radius: 1 + 0.08 * t, count: t >= 2 ? 4 : 3, lingerMs: 0 }; // 포효 겹 수
    case 'crimson': return { dmg, radius: 1 + 0.08 * t, count: 0, lingerMs: 0 };
    case 'mirror': return { dmg, radius: 1, count: t >= 2 ? 4 : 3, lingerMs: 6000 + 1000 * t }; // 분신 수·유지
    case 'chrono': return { dmg, radius: 1 + 0.08 * t, count: 0, lingerMs: 0 }; // 시계 폭탄 범위
    case 'void': return { dmg, radius: 1 + 0.08 * t, count: 0, lingerMs: 2500 + 500 * t }; // 블랙홀 범위·유지
    case 'aurora': return { dmg, radius: 1 + 0.1 * t, count: 0, lingerMs: 0 }; // 극광 폭
  }
}

/** 성장 표시용 핵심 수치 한 줄씩(드래곤 화면 "현재 → 다음") */
export function sigGrowthLines(id: DragonId, tier: number): Record<string, string> {
  const g = sigGrowth(id, tier);
  const d = SIGNATURES[id];
  const m = (px: number) => `${((px * g.radius) / M).toFixed(1)}m`;
  const out: Record<string, string> = { 피해: `${Math.round(g.dmg * 100)}%` };
  if (d.radius) out['범위'] = m(d.radius);
  if (d.length) out['길이·폭'] = `${m(d.length)} · ${m(d.width! * 2)}`;
  if (d.kind === 'counter') out['발동'] = `기본 공격 ${d.every}회마다`;
  const label: Partial<Record<DragonId, string>> = { yellow: '연쇄 번개', black: '암흑 빔', stone: '바위 파동', wind: '바람 칼날', water: '해일', arcane: '마력탄', steel: '강철 검', bloom: '가시 꽃', howl: '포효', mirror: '거울 분신' };
  const unit: Partial<Record<DragonId, string>> = { yellow: '갈래', arcane: '개', wind: '개', steel: '자루', bloom: '송이', howl: '겹', mirror: '개' };
  if (label[id]) out[label[id]!] = `${g.count}${unit[id] ?? '번'}`;
  const linger: Partial<Record<DragonId, string>> = { red: '남는 불길', blue: '냉기 장판', green: '독구름', white: '보호막', wind: '질주 추가', sand: '모래 늪', bloom: '꽃 유지', mirror: '분신 유지', void: '블랙홀 유지' };
  if (linger[id] && g.lingerMs) out[linger[id]!] = `${(g.lingerMs / 1000).toFixed(1)}초`;
  return out;
}
