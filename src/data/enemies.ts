import { M } from './stats';

// 스테이지 1 "불타는 왕국" 적 (기획서 v0.1 9장). 숫자만 바꿔 난이도를 조절할 수 있게 코드와 나눠 둔다.
// 체력은 공격력 10 스케일(기본공격 Lv.1 한 발 = 10).
export type EnemyKind = 'soldier' | 'slime' | 'archer' | 'charger' | 'golem' | 'boss';
export type Behavior = 'chase' | 'ranged' | 'charger' | 'elite' | 'boss';

export interface EnemyDef {
  name: string;
  texture: string;
  behavior: Behavior;
  hp: number;
  speed: number; // 초당 px
  contactDamage: number; // 몸에 닿았을 때 드래곤이 받는 피해
  radius: number; // 충돌 원 반지름
  xp: number; // 처치 시 경험치
  heavy?: number; // 밀쳐내기 저항(0 = 그대로 밀림, 1 = 안 밀림)
  // 궁수처럼 멀리서 쏘는 적
  ranged?: { keepDistance: number; interval: number; damage: number; boltSpeed: number; texture: string };
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  soldier: { name: '왕국 병사', texture: 'knight', behavior: 'chase', hp: 12, speed: 80, contactDamage: 10, radius: 16, xp: 1 },
  slime: { name: '불꽃 슬라임', texture: 'slime', behavior: 'chase', hp: 7, speed: 105, contactDamage: 6, radius: 13, xp: 1 },
  archer: {
    name: '왕국 궁수', texture: 'archer', behavior: 'ranged', hp: 10, speed: 85, contactDamage: 6, radius: 15, xp: 2,
    ranged: { keepDistance: 6.8 * M, interval: 2400, damage: 8, boltSpeed: 300, texture: 'arrow' },
  },
  charger: { name: '돌격 창기병', texture: 'charger', behavior: 'charger', hp: 22, speed: 75, contactDamage: 14, radius: 17, xp: 3, heavy: 0.3 },
  golem: { name: '성벽 골렘(엘리트)', texture: 'golem', behavior: 'elite', hp: 650, speed: 55, contactDamage: 20, radius: 28, xp: 30, heavy: 1 },
  boss: { name: '철갑기사단장', texture: 'boss', behavior: 'boss', hp: 5200, speed: 70, contactDamage: 25, radius: 40, xp: 0, heavy: 1 },
};

// 돌진형·엘리트·보스 패턴 수치
export const PATTERN = {
  charger: { trigger: 6 * M, windup: 600, dashMs: 450, dashSpeed: 560, cooldown: 2600 },
  golem: { trigger: 5.5 * M, every: 4200, windup: 1000, radius: 3 * M, damage: 28 },
  boss: {
    every: 2600, // 패턴 사이 간격(ms)
    dash: { windup: 750, ms: 550, speed: 760, damage: 30 },
    sword: { count: 5, spread: 0.9, speed: 380, damage: 16 }, // 검기 부채꼴
    ring: { windup: 1000, radius: 4.6 * M, damage: 26 }, // 범위 내려찍기
    enrageMult: 2, // 8분 격노: 피해·패턴 속도 배율(기획서에 없음 — AI 제안)
  },
};
