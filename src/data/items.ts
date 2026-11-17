// 전투 중 드롭 아이템 4종 (5단계 기획서 v1.2, 2026-11-18). 수치는 모두 여기서 조정한다.

export type ItemId = 'box' | 'potion' | 'magnet' | 'shield';

export const ITEMS: Record<ItemId, { name: string; color: string }> = {
  box: { name: '스킬 강화 상자', color: '#ffd34d' },
  potion: { name: '회복 물약', color: '#ff6b6b' },
  magnet: { name: '경험치 자석', color: '#4fc3f7' },
  shield: { name: '용의 수호막', color: '#9be7ff' },
};

/** 일반 몬스터 1마리당 드롭 확률(합 0.5%). 처치마다 한 번만 판정, 최대 1종. */
export const NORMAL_DROP: [ItemId, number][] = [
  ['box', 0.001],
  ['potion', 0.0018],
  ['magnet', 0.0012],
  ['shield', 0.001],
];

export const ITEM_RULES = {
  lifetimeMs: 30_000, // 일반 드롭은 30초 뒤 소멸(엘리트 확정 상자는 획득 전까지 유지)
  blinkMs: 5_000, // 사라지기 5초 전부터 깜박임
  potionHeal: 0.25, // 실제 최대 HP의 25%
  shieldMs: 60_000, // 수호막 60초, 최대 1개(다시 얻으면 시간 갱신)
  boxChoices: 3,
};

/** 0~1 난수 하나로 드롭 결정(누적 확률표). 없으면 null. */
export function rollNormalDrop(r: number): ItemId | null {
  let acc = 0;
  for (const [id, p] of NORMAL_DROP) {
    acc += p;
    if (r < acc) return id;
  }
  return null;
}
