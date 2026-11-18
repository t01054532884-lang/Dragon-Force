import { M } from './stats';
import { SEASON1_ENEMIES } from './season1';

// 적 데이터. 체력은 공격력 10 스케일.
// 1단계 잿빛 숲 5종(4단계 기획서)은 고유 행동 그대로, 2~20단계(7단계 기획서)는 공통 AI 5종 + 보스 패턴 모듈을 데이터로 조합.
export type EnemyKind = string;
export type Rank = 'normal' | 'elite' | 'boss';
/** 1단계 고유 행동 5종 + 7단계 공통 AI(chase 추적 · charge 돌진 · ranged 원거리 · tank 방어 · summoner 소환) + module(엘리트·보스 패턴 모듈) */
export type Behavior = 'flank' | 'charger' | 'moonfang' | 'matriarch' | 'graymane' | 'chase' | 'charge' | 'ranged' | 'tank' | 'summoner' | 'module';

/**
 * 공통 보스·엘리트 패턴(7단계 6장 "피할 수 있는 공통 패턴 언어"). 예고시간은 종류마다 고정(난이도와 무관):
 * 투사체 0.8초 · 돌진 1.0초 · 원형 장판 1.2초 · 충격파 1.3초 · 브레스 1.5초(근접 부채꼴 베기 0.9초).
 * damage는 1단계 기준 값, 실제로는 스테이지 피해 배율을 곱하고 한 방 35% 상한 안에서 들어간다.
 */
export type PatternSpec =
  | { t: 'projectile'; count: number; spread: number; speed: number; damage: number; radial?: boolean; repeat?: number; size?: number }
  | { t: 'charge'; count: number; speed: number; ms: number; then?: PatternSpec }
  | { t: 'area'; count: number; r: number; damage: number; at: 'player' | 'scatter' | 'self'; delayMs?: number; slowPlayer?: boolean }
  | { t: 'shockwave'; r: number; damage: number }
  | { t: 'ring'; inner: number; outer: number; damage: number } // 바깥으로 퍼지는 충격파: 보스 가까이가 안전
  | { t: 'cone'; half: number; r: number; damage: number; breath?: boolean; slowPlayer?: boolean }
  | { t: 'line'; count: number; width: number; length: number; damage: number; cross?: boolean; sequential?: boolean } // 검기·뿌리·가시: 직선 범위
  | { t: 'summon'; kind: string; count: number }
  | { t: 'shield'; ms: number; reduce: number; front?: boolean } // 피해 감소(front면 정면만)
  | { t: 'teleport' } // 짧게 사라졌다가 플레이어 옆(4~5m)으로
  | { t: 'orbs'; count: number; speed: number; lifeMs: number; damage: number } // 느린 추적 구체
  | { t: 'slowZone'; r: number; ms: number; slow: number }; // 플레이어 둔화 지대

/** 도형 그림 종류(src/enemyArt.ts) */
export type ArtShape = 'beast' | 'boar' | 'humanoid' | 'knight' | 'mage' | 'archer' | 'slime' | 'spirit' | 'flyer' | 'insect' | 'golem' | 'plant' | 'imp' | 'dragon';

export interface EnemyDef {
  name: string;
  texture: string;
  rank: Rank;
  behavior: Behavior;
  hp: number; // 기본 체력(스테이지 배율 적용 전)
  speed: number; // 초당 px
  contactDamage: number; // 몸에 닿았을 때 드래곤이 받는 피해
  radius: number; // 충돌 원 반지름
  xp: number; // 처치 시 경험치
  // ── 7단계 공통 AI·패턴 설정(없으면 1단계 고유 행동) ──
  art?: { shape: ArtShape; body: number; accent: number; size: number };
  keep?: number; // 원거리·소환형이 유지하는 거리(px)
  shot?: { every: number; speed: number; damage: number; count: number; spread: number }; // 원거리형 기본 사격
  guard?: number; // 방어형: 정면(±60°)에서 받는 피해 감소
  summon?: { kind: string; count: number; every: number; max: number }; // 소환형
  patterns?: PatternSpec[]; // 엘리트·보스: 차례로 돌아가며 사용(시드 재현)
  patterns2?: PatternSpec[]; // HP 50% 이하 강화 패턴
  patternGap?: number; // 패턴 사이 대기(ms)
  phaseAt?: number; // 강화 시작 HP 비율(기본 0.5)
  lifeMs?: number; // 분신: 시간이 지나면 보상 없이 사라짐
  noReward?: boolean; // 소환수·분신: 경험치·처치 보상 없음
}

const STAGE1: Record<string, EnemyDef> = {
  shadow_wolf: { name: '그림자 늑대', texture: 'wolf', rank: 'normal', behavior: 'flank', hp: 9, speed: 125, contactDamage: 8, radius: 15, xp: 1 },
  iron_boar: { name: '철갑 멧돼지', texture: 'boar', rank: 'normal', behavior: 'charger', hp: 26, speed: 70, contactDamage: 12, radius: 19, xp: 2 },
  moonfang_alpha: { name: '월광송곳니', texture: 'moonfang', rank: 'elite', behavior: 'moonfang', hp: 520, speed: 95, contactDamage: 16, radius: 34, xp: 25 },
  ironback_matriarch: { name: '철갑어미', texture: 'matriarch', rank: 'elite', behavior: 'matriarch', hp: 850, speed: 60, contactDamage: 18, radius: 40, xp: 25 },
  graymane_alpha: { name: '회색갈기 우두머리', texture: 'graymane', rank: 'boss', behavior: 'graymane', hp: 3000, speed: 80, contactDamage: 20, radius: 52, xp: 0, phaseAt: 0.6 },
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = { ...STAGE1, ...SEASON1_ENEMIES };

// 군중제어 저항 (기획서 4장): 엘리트는 둔화 효과 60% 감소, 밀치기 거리 30%만. 보스는 밀리지 않음.
export const CC = {
  elite: { slowKeep: 0.4, knockKeep: 0.3 },
  boss: { slowKeep: 0.4, knockKeep: 0 },
  normal: { slowKeep: 1, knockKeep: 1 },
} as const;

// 패턴 수치. 큰 공격은 최소 0.8초 전에 바닥 예고(기획서 5장).
export const PATTERN = {
  wolf: { flankDist: 4 * M, flankOffset: 3 * M }, // 4m 밖에서는 옆으로 돌아 들어온다
  boar: { trigger: 6 * M, windup: 800, dashMs: 500, dashSpeed: 600, stunMs: 900, cooldown: 3200 },
  moonfang: { every: 5600, trigger: 9 * M, windup: 800, dashMs: 420, dashSpeed: 720, curve: 2.2, gap: 600, dashes: 3 }, // 연속 돌진 사이 0.6초 예고
  matriarch: { every: 6000, windup: 1000, dashSpeed: 780, maxMs: 2600, shockR: 3.4 * M, shockWarn: 800, shockDamage: 26, stunMs: 1400 },
  graymane: {
    every: 3000, // 패턴 사이 간격(ms), 2페이즈는 0.75배
    phaseAt: 0.6, // 60% 체력에 패턴 변화
    dash: { windup: 900, gap: 800, ms: 520, speed: 760 }, // 연속 돌진도 매번 0.8초 예고
    claw: { windup: 850, r: 4 * M, halfAngle: 0.7, damage: 24 }, // 전방 부채꼴 할퀴기
    howl: { wolves: 4 }, // 그림자 늑대 소환(보스전 중 유일한 일반 적)
    phase2Dashes: 3,
  },
};

// 한 번에 받는 피해 상한(플레이어 최대 HP 대비, 기획서 5장): 일반 보스·엘리트 35%, 최종보스 45%
export const HIT_CAP = { normal: 1, elite: 0.35, boss: 0.35, finalBoss: 0.45 };

// v1.2 QA: 보스(와 엘리트)는 빙결·기절로 멈추지 않고 이동속도 −15%·1초 둔화로 대체
export const HARD_CC_BOSS = { slow: 0.15, ms: 1000 };
