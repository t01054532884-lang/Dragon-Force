// 전투 중 드롭 아이템 (5단계 기획서 v1.2, 2026-11-18 → 2026-11-20 전투 속도·성장 체감 개선 2번). 수치는 모두 여기서 조정한다.

export type ItemId = 'box' | 'potion' | 'magnet' | 'shield' | 'coin';

export const ITEMS: Record<ItemId, { name: string; color: string }> = {
  box: { name: '스킬 강화 상자', color: '#ffd34d' },
  potion: { name: '회복 물약', color: '#ff6b6b' },
  magnet: { name: '경험치 자석', color: '#4fc3f7' },
  shield: { name: '용의 수호막', color: '#9be7ff' },
  coin: { name: '골드', color: '#ffd34d' },
};

/**
 * 일반 몬스터 1마리당 드롭 확률. 처치마다 한 번만 판정, 최대 1종.
 * 2026-11-20: 몬스터 수 −30%·판 길이 단축에 맞춰 물약 0.18 → 0.45%, 자석 0.12 → 0.30%(각 2.5배),
 * 수호막 0.10 → 0.15%. 강화 상자는 성장량이 커서 따로: 0.02 → 0.04%(판당 처치 수가 줄어든 만큼만 보정 — 판당 기대 개수 유지).
 * 골드(coin)는 새로 추가: 줍는 재미용, 결과 정산의 "일반 적 처치 골드"를 대신한다(판당 총량은 그대로 — progression.ts GOLD).
 */
export const NORMAL_DROP: [ItemId, number][] = [
  ['box', 0.0004],
  ['potion', 0.0045],
  ['magnet', 0.003],
  ['shield', 0.0015],
  ['coin', 0.03],
];

export const ITEM_RULES = {
  lifetimeMs: 30_000, // 일반 드롭은 30초 뒤 소멸(엘리트 확정 상자는 획득 전까지 유지)
  blinkMs: 5_000, // 사라지기 5초 전부터 깜박임
  potionHeal: 0.25, // 실제 최대 HP의 25%
  shieldMs: 60_000, // 수호막 60초, 최대 1개(다시 얻으면 시간 갱신)
  boxChoices: 3,
  /** 오랫동안 안 나오는 상황 막기(천장): 이 수만큼 일반 몬스터를 잡는 동안 물약·자석이 하나도 안 나오면 다음 처치에 확정 */
  pityKills: { potion: 140, magnet: 160 },
  /** 체력이 이 비율 이하면 물약 확률 ×2(위급할 때 도움) */
  lowHp: 0.4,
  lowHpPotionMult: 2,
  /** 무한 생존 방지: 한 판에 물약은 최대 6개까지만 떨어진다(이후 그 몫은 드롭 없음). 물약 천장은 체력 60% 이하일 때만 */
  potionMaxPerRun: 6,
  potionPityHpBelow: 0.6,
  /** 첫 판: 이 시각 이후 첫 처치 자리에 자석 확정(기능 배우기). 한 번 주우면 다시 안 나옴 */
  firstMagnetAtMs: 40_000,
  /** 골드 한 개 = 골드(단계 배율 전). 결과 화면에서 단계·결과 배율이 곱해진다.
   *  자동 측정: 1단계 클리어 판 처치 340~530마리 × 3% × 6G ≈ 60~95G → 상한 80G(예전 처치 골드 최대치와 같음) */
  coinGold: 6,
};

/** 0~1 난수 하나로 드롭 결정(누적 확률표). potionMult: 위급할 때 물약 확률 배율. 없으면 null. */
export function rollNormalDrop(r: number, potionMult = 1): ItemId | null {
  let acc = 0;
  for (const [id, p] of NORMAL_DROP) {
    acc += id === 'potion' ? p * potionMult : p;
    if (r < acc) return id;
  }
  return null;
}

/** 판 안의 드롭 천장 상태(순수 함수로 테스트) */
export interface DropState {
  sincePotion: number;
  sinceMagnet: number;
  potions: number;
}
export const newDropState = (): DropState => ({ sincePotion: 0, sinceMagnet: 0, potions: 0 });

/**
 * 일반 몬스터 처치 한 번의 드롭: 확률 판정 → 천장 보정 → 물약 상한.
 * hpRatio: 지금 체력 비율(0~1). 반환값과 함께 상태를 갱신한다.
 */
export function decideDrop(st: DropState, r: number, hpRatio: number): ItemId | null {
  const R = ITEM_RULES;
  st.sincePotion++;
  st.sinceMagnet++;
  let id = rollNormalDrop(r, hpRatio <= R.lowHp ? R.lowHpPotionMult : 1);
  if (!id || id === 'coin') {
    // 천장: 자석이 먼저(성장 체감), 물약은 체력이 부족할 때만
    if (st.sinceMagnet >= R.pityKills.magnet) id = 'magnet';
    else if (st.sincePotion >= R.pityKills.potion && hpRatio <= R.potionPityHpBelow) id = 'potion';
  }
  if (id === 'potion') {
    if (st.potions >= R.potionMaxPerRun) return null;
    st.potions++;
    st.sincePotion = 0;
  }
  if (id === 'magnet') st.sinceMagnet = 0;
  return id;
}
