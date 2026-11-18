import type { Rarity } from './economy';

// 개발 6단계 v1.2 8장 — 장비 4슬롯 · Lv.1~10 · 동일 장비 3개 합성.
// 무기 공격력·갑옷 HP 기본치와 +5%/Lv은 원문. 강화비는 제작자 임시(Lv.1→2 100G, 단계마다 ×1.25, 올림).
// 갑옷 피해 감소·목걸이·반지 수치와 장비 종류(슬롯마다 2종)는 AI 1차안. 모두 임시 밸런스 수치.

export type Slot = 'weapon' | 'armor' | 'necklace' | 'ring';
export const SLOTS: Slot[] = ['weapon', 'armor', 'necklace', 'ring'];
// 슬롯 이름(제작자 결정 2026-11-18): 드래곤이 검을 드는 게 어색해 무기 → 발톱 장식, 갑옷 → 비늘 갑주. 저장 키(weapon·armor)는 호환 때문에 그대로.
export const SLOT_LABEL: Record<Slot, string> = { weapon: '발톱 장식', armor: '비늘 갑주', necklace: '목걸이', ring: '반지' };
export const SLOT_ICON: Record<Slot, string> = { weapon: '⚔', armor: '⬟', necklace: '◈', ring: '◉' };

export interface EquipDef {
  id: string;
  name: string;
  slot: Slot;
}
export const EQUIPS: EquipDef[] = [
  { id: 'sword', name: '용린 발톱', slot: 'weapon' }, // 아이디(sword 등)는 저장 호환 때문에 그대로
  { id: 'spear', name: '화룡 발톱', slot: 'weapon' },
  { id: 'scale', name: '용린 갑주', slot: 'armor' },
  { id: 'plate', name: '화룡 갑주', slot: 'armor' },
  { id: 'fang', name: '송곳니 목걸이', slot: 'necklace' },
  { id: 'rune', name: '룬 목걸이', slot: 'necklace' },
  { id: 'ember', name: '불씨 반지', slot: 'ring' },
  { id: 'gale', name: '돌풍 반지', slot: 'ring' },
];
export const equipDef = (id: string) => EQUIPS.find((e) => e.id === id);

/** 등급별 Lv.1 기본치. 한 슬롯에 두 능력치(a·b) */
export const EQUIP_BASE: Record<Slot, { a: string; b: string; unitA: string; unitB: string; values: Record<Rarity, [number, number]> }> = {
  // v1.3(제작자 2026-11-18): 고정값(+5~30, HP +20~110) 폐기 → 드래곤 기본 공격력·HP에 대한 비율 보너스 4/7/11/16%.
  // 무기 = 공격력 %, 갑옷 = HP %(해석: AI). 연구소·영구 레벨·승급 %와 같은 자리에 더한다(합산 규칙 유지).
  weapon: { a: '공격력', b: '', unitA: '%', unitB: '', values: { common: [4, 0], rare: [7, 0], epic: [11, 0], legendary: [16, 0] } },
  armor: { a: '최대 HP', b: '피해 감소', unitA: '%', unitB: '%', values: { common: [4, 1], rare: [7, 2], epic: [11, 3], legendary: [16, 5] } }, // 피해 감소는 v1.2 AI 1차안 유지
  necklace: { a: '스킬 피해', b: '쿨타임 감소', unitA: '%', unitB: '%', values: { common: [4, 2], rare: [8, 3], epic: [12, 5], legendary: [18, 8] } }, // AI 1차안
  ring: { a: '치명타', b: '이동속도', unitA: '%', unitB: '%', values: { common: [2, 2], rare: [4, 3], epic: [6, 5], legendary: [10, 8] } }, // AI 1차안
};

export const EQUIP_RULES = {
  maxLevel: 10,
  perLevel: 0.05, // +5%/Lv(원문): 값 = 기본치 × (1 + 0.05 × (Lv−1))
  fuseCount: 3, // 같은 장비·같은 등급 3개 → 한 등급 위 1개(Lv.1)
  /** 강화비: Lv.1→2 100G, 이후 ×1.25, 올림(제작자 임시). 등급과 무관 */
  upgradeCost: (level: number) => Math.ceil(100 * Math.pow(1.25, level - 1)),
};

/**
 * 소수점 규칙 하나로 통일(원문 요구): 모든 장비 수치(%)는 소수 둘째 자리 반올림. 화면·전투·전투력 모두 이 값을 쓴다.
 * v1.3에서 % 보너스로 바뀌며 둘째 자리로 바꿈(희귀 7% × 1.45 = 10.15%가 10.1로 잘리지 않게).
 */
export const round2 = (v: number) => Math.round(v * 100 + 1e-9) / 100;

export function equipValue(slot: Slot, rarity: Rarity, level: number): [number, number] {
  const [a, b] = EQUIP_BASE[slot].values[rarity];
  const m = 1 + EQUIP_RULES.perLevel * (level - 1);
  return [round2(a * m), round2(b * m)];
}

export const NEXT_RARITY: Record<Rarity, Rarity | null> = { common: 'rare', rare: 'epic', epic: 'legendary', legendary: null };
