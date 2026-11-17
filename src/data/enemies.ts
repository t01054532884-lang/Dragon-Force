// 일반몹 3종의 수치. 숫자만 바꿔서 난이도를 조절할 수 있게 코드와 나눠 둔다.
export type EnemyKind = 'knight' | 'mage' | 'golem';

export interface EnemyDef {
  name: string;
  texture: string;
  hp: number;
  speed: number; // 초당 px
  contactDamage: number; // 몸에 닿았을 때 드래곤이 받는 피해
  radius: number; // 충돌 원 반지름
  xp: number; // 처치 시 경험치(3단계에서 사용)
  appearsAt: number; // 몇 초부터 나오는지
  // 마법사처럼 멀리서 쏘는 적
  ranged?: { keepDistance: number; interval: number; damage: number; boltSpeed: number };
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  knight: { name: '왕국 기사', texture: 'knight', hp: 12, speed: 95, contactDamage: 10, radius: 16, xp: 1, appearsAt: 0 },
  mage: {
    name: '궁정 마법사', texture: 'mage', hp: 8, speed: 80, contactDamage: 6, radius: 15, xp: 2, appearsAt: 45,
    ranged: { keepDistance: 340, interval: 2600, damage: 8, boltSpeed: 230 },
  },
  golem: { name: '성벽 골렘', texture: 'golem', hp: 70, speed: 48, contactDamage: 20, radius: 28, xp: 5, appearsAt: 100 },
};
