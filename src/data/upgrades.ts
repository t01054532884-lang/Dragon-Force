import type { RunStats } from './stats';

// 레벨업 때 나오는 카드 한 장.
// - skill: 새 공격 방식을 얻는다(처음 고르면 Lv.1 획득, 다시 고르면 강해짐). 효과는 src/systems/Skills.ts
// - passive: 능력치만 바꾼다.
export interface Upgrade {
  id: string;
  kind: 'skill' | 'passive';
  icon: string;
  name: string;
  maxLevel: number;
  /** 다음 레벨(1부터)을 골랐을 때 카드에 보일 설명 */
  describe(nextLevel: number): string;
  /** 골랐을 때 능력치를 바꾼다(패시브만) */
  apply?(stats: RunStats, nextLevel: number): void;
}

// ── 스킬 수치: 레벨(1~5)을 넣으면 값이 나오는 함수로 둔다. 카드 설명과 실제 효과가 같은 식을 쓰게.
export const SKILL = {
  breath: {
    interval: (lv: number) => 2200 - lv * 150,
    range: (lv: number) => 200 + lv * 25,
    angle: (lv: number) => 50 + lv * 6, // 부채꼴 전체 각도(도)
    damage: (lv: number) => 10 + lv * 6,
  },
  ice: {
    interval: () => 1500,
    count: (lv: number) => 1 + Math.floor(lv / 2),
    damage: (lv: number) => 6 + lv * 3,
    slow: (lv: number) => 0.35 + lv * 0.05, // 느려지는 비율
    slowMs: () => 2000,
  },
  lightning: {
    interval: (lv: number) => 2300 - lv * 150,
    chains: (lv: number) => 2 + lv, // 첫 대상 + 튀는 횟수
    jump: () => 200, // 다음 적으로 튈 수 있는 거리
    damage: (lv: number) => 10 + lv * 5,
  },
  meteor: {
    interval: (lv: number) => 5200 - lv * 500,
    count: (lv: number) => (lv >= 4 ? 2 : 1),
    radius: (lv: number) => 100 + lv * 15,
    damage: (lv: number) => 25 + lv * 12,
    warnMs: () => 700, // 떨어지기 전 경고 원 표시 시간
  },
  orb: {
    count: (lv: number) => Math.min(lv, 4) + (lv >= 5 ? 1 : 0),
    radius: () => 130, // 드래곤에서 오브까지 거리
    spin: (lv: number) => 2.6 + lv * 0.2, // 초당 회전(라디안)
    damage: (lv: number) => 6 + lv * 3,
    hitCooldown: () => 450, // 같은 적을 다시 때리기까지(ms)
  },
} as const;

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}초`;

export const UPGRADES: Upgrade[] = [
  // ───────── 스킬 6종 (3단계) ─────────
  {
    id: 'breath', kind: 'skill', icon: '🔥', name: '화염 브레스', maxLevel: 5,
    describe: (lv) =>
      lv === 1
        ? `${sec(SKILL.breath.interval(1))}마다 앞쪽 부채꼴에 불길 (피해 ${SKILL.breath.damage(1)})`
        : `피해 ${SKILL.breath.damage(lv)}, 범위·각도 증가, 간격 ${sec(SKILL.breath.interval(lv))}`,
  },
  {
    id: 'ice', kind: 'skill', icon: '❄️', name: '얼음 파편', maxLevel: 5,
    describe: (lv) =>
      lv === 1
        ? `가까운 적에게 얼음 파편, 맞으면 ${Math.round(SKILL.ice.slow(1) * 100)}% 느려짐`
        : `파편 ${SKILL.ice.count(lv)}개, 피해 ${SKILL.ice.damage(lv)}, 둔화 ${Math.round(SKILL.ice.slow(lv) * 100)}%`,
  },
  {
    id: 'lightning', kind: 'skill', icon: '⚡', name: '번개 숨결', maxLevel: 5,
    describe: (lv) =>
      lv === 1
        ? `적 ${SKILL.lightning.chains(1)}마리 사이를 튀는 번개 (피해 ${SKILL.lightning.damage(1)})`
        : `${SKILL.lightning.chains(lv)}마리 연쇄, 피해 ${SKILL.lightning.damage(lv)}`,
  },
  {
    id: 'meteor', kind: 'skill', icon: '☄️', name: '드래곤 메테오', maxLevel: 5,
    describe: (lv) =>
      lv === 1
        ? `${sec(SKILL.meteor.interval(1))}마다 적 무리에 운석 (피해 ${SKILL.meteor.damage(1)})`
        : `운석 ${SKILL.meteor.count(lv)}개, 피해 ${SKILL.meteor.damage(lv)}, 간격 ${sec(SKILL.meteor.interval(lv))}`,
  },
  {
    id: 'orb', kind: 'skill', icon: '🐲', name: '드래곤 오브', maxLevel: 5,
    describe: (lv) =>
      lv === 1
        ? `드래곤 주위를 도는 오브 1개 (닿은 적 피해 ${SKILL.orb.damage(1)})`
        : `오브 ${SKILL.orb.count(lv)}개, 피해 ${SKILL.orb.damage(lv)}, 더 빠르게 회전`,
  },
  {
    id: 'scale', kind: 'skill', icon: '🛡️', name: '용의 비늘', maxLevel: 5,
    describe: () => '받는 피해 −10%',
    apply: (s) => (s.armor = Math.min(0.6, s.armor + 0.1)),
  },

  // ───────── 패시브 ─────────
  {
    id: 'fire-power', kind: 'passive', icon: '🔺', name: '화염 강화', maxLevel: 5,
    describe: () => '화염탄·화염 브레스·메테오 피해 +20%',
    apply: (s) => (s.fireMult += 0.2),
  },
  {
    id: 'fire-rate', kind: 'passive', icon: '💨', name: '빠른 숨결', maxLevel: 5,
    describe: () => '화염탄 발사 간격 −15%',
    apply: (s) => (s.fireInterval *= 0.85),
  },
  {
    id: 'wings', kind: 'passive', icon: '🪽', name: '튼튼한 날개', maxLevel: 3,
    describe: () => '이동 속도 +12%',
    apply: (s) => (s.speed *= 1.12),
  },
  {
    id: 'heart', kind: 'passive', icon: '❤️', name: '용의 심장', maxLevel: 5,
    describe: () => '최대 체력 +20 (늘어난 만큼 회복)',
    apply: (s) => (s.maxHp += 20),
  },
  {
    id: 'greed', kind: 'passive', icon: '💎', name: '보물 감각', maxLevel: 3,
    describe: () => '경험치 보석 끌어당기는 거리 +40%',
    apply: (s) => (s.magnet *= 1.4),
  },
];

const MAX_SKILLS = 4; // 한 판에 가질 수 있는 공격 스킬 수(고르는 재미를 위해 제한)

/**
 * 아직 최대 레벨이 아닌 카드 중에서 무작위로 n장 고른다.
 * 스킬을 이미 MAX_SKILLS개 가졌으면 새 스킬은 나오지 않는다(가진 스킬 강화만).
 * 3장 중 최소 1장은 스킬(새 스킬 또는 가진 스킬 강화)이 나오게 해서 성장이 밋밋하지 않게 한다.
 */
export function rollChoices(levels: Map<string, number>, n = 3): Upgrade[] {
  const owned = UPGRADES.filter((u) => u.kind === 'skill' && (levels.get(u.id) ?? 0) > 0).length;
  const pool = UPGRADES.filter((u) => {
    const lv = levels.get(u.id) ?? 0;
    if (lv >= u.maxLevel) return false;
    if (u.kind === 'skill' && lv === 0 && owned >= MAX_SKILLS) return false;
    return true;
  });
  shuffle(pool);
  const picked = pool.slice(0, n);
  if (!picked.some((u) => u.kind === 'skill')) {
    const skill = pool.find((u) => u.kind === 'skill');
    if (skill && picked.length > 0) picked[picked.length - 1] = skill;
  }
  return picked;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
