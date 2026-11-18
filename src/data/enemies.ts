import { M } from './stats';

// 적 데이터 (4단계 기획서 7·8장: 1~10단계 마수 지역). 체력은 공격력 10 스케일.
// MVP는 1단계 잿빛 숲에 필요한 5종만: 일반 2 + 엘리트 2 + 보스 1.
export type EnemyKind = 'shadow_wolf' | 'iron_boar' | 'moonfang_alpha' | 'ironback_matriarch' | 'graymane_alpha';
export type Rank = 'normal' | 'elite' | 'boss';
export type Behavior = 'flank' | 'charger' | 'moonfang' | 'matriarch' | 'graymane';

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
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shadow_wolf: { name: '그림자 늑대', texture: 'wolf', rank: 'normal', behavior: 'flank', hp: 9, speed: 125, contactDamage: 8, radius: 15, xp: 1 },
  iron_boar: { name: '철갑 멧돼지', texture: 'boar', rank: 'normal', behavior: 'charger', hp: 26, speed: 70, contactDamage: 12, radius: 19, xp: 2 },
  moonfang_alpha: { name: '월광송곳니', texture: 'moonfang', rank: 'elite', behavior: 'moonfang', hp: 520, speed: 95, contactDamage: 16, radius: 34, xp: 25 },
  ironback_matriarch: { name: '철갑어미', texture: 'matriarch', rank: 'elite', behavior: 'matriarch', hp: 850, speed: 60, contactDamage: 18, radius: 40, xp: 25 },
  graymane_alpha: { name: '회색갈기 우두머리', texture: 'graymane', rank: 'boss', behavior: 'graymane', hp: 3000, speed: 80, contactDamage: 20, radius: 52, xp: 0 },
};

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
