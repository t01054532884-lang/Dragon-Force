import { M } from './stats';
import type { DragonId } from './dragons';

// 드래곤 전용 액티브(기획 v1.2 3장 + v1.3 2장).
// v1.3(제작자 2026-11-18): "공격력 총 5배" 규칙 폐기 → 쓰는 순간의 **현재 기본 공격 DPS**를 기준으로 한다.
//   단일 공격형 DPS × 4초 · 광역 공격형 대상당 DPS × 3초(총합 최대 DPS × 12초) · 지속 피해형 5초간 DPS × 3초
//   회복형 현재 최대 HP 15% · 방어형 4초간 받는 피해 −25% · 이동 강화형 5초간 이동속도 +25% + 약한 범위 공격
// - 피해는 DPS로 이미 계산된 값이라 공격력·특성·치명타·마력 증폭 같은 보너스를 다시 곱하지 않는다(중복 적용 금지).
// - 전용 액티브 피해는 기본 공격 DPS 계산에 넣지 않는다.
// - 기본 공격 DPS = 공격력 × 한 발 계수 × 레벨 배율 × (1 + 추가 탄 × 같은 묶음 50%) ÷ 공격 주기(단일 대상, 화상·폭발 제외).
// 범위·지속시간·틱 수·이동 강화형의 "약한" 범위 공격 크기는 AI 1차안. 재사용 60초(원문). 실제 보스 처치 시간으로 다시 맞춘다.

export type SignatureKind = 'aoe' | 'beam' | 'single' | 'dot' | 'heal' | 'guard' | 'move';

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
  arcane: { name: '마력 폭주', icon: '🔮', text: '짧은 시간 추가 마력탄', detail: `단일: 4초 동안 마력탄 10발, 엘리트·보스 우선, 합계 DPS×${R.singleSec}초`, kind: 'single', cooldownMs: CD, durationMs: 4000, ticks: 10, radius: 11 * M, color: 0xb693ff },
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
