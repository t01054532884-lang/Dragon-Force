import type { SpecialId } from './specials';
import { SPECIALS } from './specials';

// v1.2 시스템 개편 1장(2026-11-21): 장착형 특수 스킬 15종 → **룬 15종**.
// - 장착 칸 없이, 해금한 룬은 모두 항상 적용된다(능력치 증가형). 자동 발동형(20초마다 공격력 등)은 없앴다.
// - 조각으로 해금(기존과 같은 50개) → 조각 + 골드로 강화. 아이디는 특수 스킬과 같아 저장 데이터를 그대로 이어받는다.
// - 레벨당 수치·최대 레벨·비용은 AI 1차안(밸런스 검토 후 조정). 연구소 "룬" 탭에서 관리.

export const RUNE_RULES = {
  unlockFragments: 50, // 기존 특수 스킬 해금과 같음 → 이미 해금한 것은 룬 Lv.1
  maxLevel: 10,
  /** 전투력 보정 S: 룬 레벨 1당 +0.1%(15종 만렙 150레벨 = +15%) */
  cpPerLevel: 0.001,
};

/** Lv.n → n+1 강화 비용(n = 1~9): 조각과 골드 */
export function runeUpgradeCost(level: number): { fragments: number; gold: number } {
  const frag = [10, 15, 20, 25, 30, 40, 50, 60, 80][Math.max(0, Math.min(8, level - 1))];
  return { fragments: frag, gold: Math.ceil(300 * Math.pow(1.4, Math.max(0, level - 1))) };
}

/** 룬 한 레벨당 효과(능력치 증가형). label·unit은 화면 표시용 */
export const RUNE_STAT: Record<SpecialId, { label: string; per: number; unit: '%' | '%p' }> = {
  rage: { label: '공격력', per: 0.02, unit: '%' },
  aegis: { label: '받는 피해 감소', per: 0.015, unit: '%' },
  burst: { label: '액티브 스킬 피해', per: 0.03, unit: '%' },
  flameSeal: { label: '화상 피해', per: 0.05, unit: '%' },
  iceHeart: { label: '둔화 세기', per: 0.03, unit: '%' },
  thunderCrest: { label: '연쇄 피해 감소 완화', per: 0.03, unit: '%' },
  venomMark: { label: '중독 지속시간', per: 0.05, unit: '%' },
  darkPact: { label: 'HP 50% 이하일 때 피해', per: 0.025, unit: '%' },
  stormBless: { label: '이동 속도', per: 0.01, unit: '%' },
  earthWill: { label: '최대 HP', per: 0.02, unit: '%' },
  holyLight: { label: '처치 시 HP 2% 회복 확률', per: 0.003, unit: '%p' },
  ancientEye: { label: '치명타 확률', per: 0.01, unit: '%p' },
  starMana: { label: '스킬 재사용 대기시간 감소', per: 0.01, unit: '%' },
  treasure: { label: '전투 골드', per: 0.02, unit: '%' },
  resonance: { label: '액티브 스킬 추가 발동 확률', per: 0.015, unit: '%p' },
};

export const RUNES = SPECIALS; // 이름·색·임시 기호는 특수 스킬 데이터를 그대로(그림은 sp-<id> 요청 중)

export const runeValue = (id: SpecialId, level: number): number => RUNE_STAT[id].per * Math.max(0, Math.min(RUNE_RULES.maxLevel, level));

/** "공격력 +6%"처럼 */
export function runeText(id: SpecialId, level: number): string {
  const s = RUNE_STAT[id];
  const v = Math.round(runeValue(id, level) * 1000) / 10;
  return `${s.label} +${v}${s.unit}`;
}

/** 모든 룬 효과를 한 묶음으로(전투·전투력 계산이 같이 씀) */
export interface RuneEffects {
  attack: number;
  damageReduce: number;
  skillDamage: number;
  burn: number;
  slow: number;
  chainRelief: number;
  poisonDur: number;
  lowHpDamage: number;
  move: number;
  hp: number;
  killHealChance: number;
  crit: number;
  cooldown: number;
  gold: number;
  echo: number;
  totalLevels: number;
}

export function runeEffects(levels: Partial<Record<SpecialId, number>>): RuneEffects {
  const v = (id: SpecialId) => runeValue(id, levels[id] ?? 0);
  return {
    attack: v('rage'),
    damageReduce: v('aegis'),
    skillDamage: v('burst'),
    burn: v('flameSeal'),
    slow: v('iceHeart'),
    chainRelief: v('thunderCrest'),
    poisonDur: v('venomMark'),
    lowHpDamage: v('darkPact'),
    move: v('stormBless'),
    hp: v('earthWill'),
    killHealChance: v('holyLight'),
    crit: v('ancientEye'),
    cooldown: v('starMana'),
    gold: v('treasure'),
    echo: v('resonance'),
    totalLevels: Object.values(levels).reduce<number>((a, b) => a + (b ?? 0), 0),
  };
}

// ───────── 룬 상자(v1.2 2장: 1회 100 · 10회 900루비) ─────────
/**
 * 룬 상자 1회 = 룬 조각 한 묶음(15종 균등). 묶음 크기 확률(AI 1차안, 장비 상자 등급 70/22/7/1과 같은 비율):
 * 5개 70% · 10개 22% · 20개 7% · 50개 1% → 1회 기대 7.6개.
 * 보장: 매 10회째는 10개 이상(10·20·50을 22:7:1로). 드래곤·스킬 상자와 보상이 겹치지 않는다(룬 조각은 룬 상자에서만 + 미션·이벤트).
 */
export const RUNE_BOX = {
  bundles: [[5, 70], [10, 22], [20, 7], [50, 1]] as [number, number][],
  guaranteeEvery: 10,
  guaranteeBundles: [[10, 22], [20, 7], [50, 1]] as [number, number][],
};
