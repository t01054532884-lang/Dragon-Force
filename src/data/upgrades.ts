import type { RunStats } from './stats';

// 레벨업 때 나오는 카드 한 장. 3단계 스킬(화염 브레스·번개 숨결 등)도 같은 모양으로 여기에 추가한다.
export interface Upgrade {
  id: string;
  icon: string;
  name: string;
  maxLevel: number;
  /** 다음 레벨(1부터)을 골랐을 때 카드에 보일 설명 */
  describe(nextLevel: number): string;
  /** 골랐을 때 능력치를 바꾼다 */
  apply(stats: RunStats, nextLevel: number): void;
}

export const UPGRADES: Upgrade[] = [
  {
    id: 'fire-power',
    icon: '🔥',
    name: '화염 강화',
    maxLevel: 5,
    describe: () => '화염 공격 피해 +25%',
    apply: (s) => (s.fireDamage *= 1.25),
  },
  {
    id: 'fire-rate',
    icon: '💨',
    name: '빠른 숨결',
    maxLevel: 5,
    describe: () => '화염탄 발사 간격 −15%',
    apply: (s) => (s.fireInterval *= 0.85),
  },
  {
    id: 'wings',
    icon: '🪽',
    name: '튼튼한 날개',
    maxLevel: 3,
    describe: () => '이동 속도 +12%',
    apply: (s) => (s.speed *= 1.12),
  },
  {
    id: 'heart',
    icon: '❤️',
    name: '용의 심장',
    maxLevel: 5,
    describe: () => '최대 체력 +20 (늘어난 만큼 회복)',
    apply: (s) => (s.maxHp += 20),
  },
  {
    id: 'scale',
    icon: '🛡️',
    name: '용의 비늘',
    maxLevel: 5,
    describe: () => '받는 피해 −10%',
    apply: (s) => (s.armor = Math.min(0.6, s.armor + 0.1)),
  },
  {
    id: 'greed',
    icon: '💎',
    name: '보물 감각',
    maxLevel: 3,
    describe: () => '경험치 보석 끌어당기는 거리 +40%',
    apply: (s) => (s.magnet *= 1.4),
  },
];

/** 아직 최대 레벨이 아닌 카드 중에서 무작위로 n장 고른다. */
export function rollChoices(levels: Map<string, number>, n = 3): Upgrade[] {
  const pool = UPGRADES.filter((u) => (levels.get(u.id) ?? 0) < u.maxLevel);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
