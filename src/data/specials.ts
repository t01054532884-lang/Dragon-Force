// 개발 6단계 v1.2 9장 — 장착형 특수 스킬 15종(드래곤 전용 60초 액티브와 다른 데이터·이름).
// 이름·설명은 원문. 수치는 AI 1차안(제작자 승인 2026-11-18: 기존 제안 효과 기반, 전투력 보정 S는 우선 0).
// 초기 운영안(원문): 슬롯 1개, 스킬별 조각 50개로 해금. 모두 자동 발동(조작 과밀 방지, 패시브 중심).

export type SpecialId =
  | 'rage' | 'aegis' | 'burst' | 'flameSeal' | 'iceHeart' | 'thunderCrest' | 'venomMark' | 'darkPact'
  | 'stormBless' | 'earthWill' | 'holyLight' | 'ancientEye' | 'starMana' | 'treasure' | 'resonance';

export interface SpecialDef {
  id: SpecialId;
  name: string;
  icon: string;
  text: string; // 원문 설명
  detail: string; // 임시 수치 설명
  color: number;
}

export const SPECIAL_RULES = { unlockFragments: 50, slots: 1, cpBonus: 0 /* 전투력 S: 우선 0(제작자 임시) */ };

/** 효과 수치(임시 밸런스) */
export const SPECIAL_VALUES = {
  rage: { every: 20_000, ms: 6_000, attack: 0.25 },
  aegis: { every: 15_000, ms: 3_000, reduce: 0.4 },
  burst: { every: 10_000, radius: 3, coef: 1.5 },
  flameSeal: { burn: 0.5 },
  iceHeart: { slow: 0.3 },
  thunderCrest: { chain: 1 },
  venomMark: { poisonMs: 0.5 },
  darkPact: { hpBelow: 0.5, attack: 0.2 },
  stormBless: { move: 0.08, haste: 0.08 },
  earthWill: { hp: 0.1 },
  holyLight: { chance: 0.02, heal: 0.02 },
  ancientEye: { crit: 0.08 },
  starMana: { cooldown: 0.1 },
  treasure: { gold: 0.1 },
  resonance: { chance: 0.15 },
};

const S = (id: SpecialId, name: string, icon: string, text: string, detail: string, color: number): SpecialDef => ({ id, name, icon, text, detail, color });
export const SPECIALS: SpecialDef[] = [
  S('rage', '용의 분노', '⚔', '일정 시간 공격력 증가', '20초마다 6초 동안 공격력 +25%', 0xff6e52),
  S('aegis', '고대의 보호막', '⬟', '짧은 시간 피해 감소', '15초마다 3초 동안 받는 피해 −40%', 0x68a7ff),
  S('burst', '마력 폭발', '✦', '주변 광역 피해', '10초마다 주변 3m 피해(공격력 150%)', 0xb693ff),
  S('flameSeal', '화염의 인장', '🔥', '화상 피해 강화', '화상 피해 +50%', 0xff8a4a),
  S('iceHeart', '얼음의 심장', '❄', '적 둔화 강화', '둔화 세기 +30%', 0x79c8ff),
  S('thunderCrest', '천둥의 문장', 'ϟ', '번개 연쇄 횟수 증가', '연쇄 공격 +1회', 0xf1cb55),
  S('venomMark', '맹독의 낙인', '☠', '중독 지속시간 증가', '중독 시간 +50%', 0x72d47d),
  S('darkPact', '암흑의 계약', '◐', '낮은 HP에서 공격력 증가', 'HP 50% 이하일 때 피해 +20%', 0x9e7bc8),
  S('stormBless', '폭풍의 축복', '≈', '이동·공격속도 증가', '이동속도 +8%, 기본 공격 주기 −8%', 0x63d9cd),
  S('earthWill', '대지의 의지', '◆', '최대 HP·넉백 저항', '최대 HP +10%(드래곤은 밀려나지 않아 넉백 저항은 효과 없음)', 0xc79b75),
  S('holyLight', '신성한 빛', '✚', '일정 확률 HP 회복', '처치 시 2% 확률로 최대 HP 2% 회복', 0xf6e8a7),
  S('ancientEye', '고대의 눈', '◉', '치명타 확률 증가', '치명타 확률 +8%p', 0xf2bc5c),
  S('starMana', '별의 마력', '✧', '스킬 쿨타임 감소', '액티브·전용 액티브 재사용 대기시간 −10%', 0xb5a0ff),
  S('treasure', '용의 보물', '¤', '골드 획득 보너스', '전투 골드 +10%', 0xffd35f),
  S('resonance', '영혼의 공명', '◎', '일부 스킬 추가 발동', '액티브 스킬 발동 시 15% 확률로 한 번 더', 0xcf8eff),
];
export const SPECIAL_IDS = SPECIALS.map((s) => s.id);
export const specialDef = (id: string) => SPECIALS.find((s) => s.id === id);
