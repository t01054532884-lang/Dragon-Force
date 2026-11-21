import type { RunStats } from './stats';
import { BASE_STATS } from './stats';
import { levelBonus, NO_TRAITS, starBonus, traitMultFor, type BasicTraits, type DragonDef } from './dragons';
import { permState, type PermState } from './permGrowth';

// 5단계 영구 성장 수치 (제작자 기획서 v1.0 + v1.1 수정, 2026-11-18 확정)
// 테스트하며 조정할 수 있도록 숫자는 모두 이 파일에 모은다.

export type UpgradeType = 'attack' | 'hp' | 'speed' | 'pickup';
export const UPGRADE_TYPES: UpgradeType[] = ['attack', 'hp', 'speed', 'pickup'];

export interface PermanentUpgradeDef {
  name: string;
  icon: string;
  maxLevel: number;
  bonusPerLevel: number; // 레벨당 증가율(0.02 = +2%) — breakAt 레벨까지
  /** v1.2(2026-11-21) 최대 레벨 40 확장: breakAt 레벨 다음부터는 레벨당 bonusAfter(기존 구간은 그대로 → 기존 강화 내역 효과 불변) */
  breakAt: number;
  bonusAfter: number;
  effect: string; // 화면에 보일 효과 이름
}

/**
 * 연구소 4종(5단계 + v1.2 시스템 개편 3장: 최대 레벨 각각 40).
 * 기존 구간(공격·생명 1~20, 비행·흡수 1~10)의 효과·비용은 그대로 두고 그 뒤만 이어 붙였다 → 저장된 레벨의 효과가 바뀌지 않는다.
 * 최대치: 공격 +70% · 생명 +100% · 비행 +25% · 흡수 반경 +125% (AI 1차안, 밸런스 검토 후 조정)
 */
export const PERMANENT_UPGRADES: Record<UpgradeType, PermanentUpgradeDef> = {
  attack: { name: '공격력 강화', icon: '⚔️', maxLevel: 40, bonusPerLevel: 0.02, breakAt: 20, bonusAfter: 0.015, effect: '모든 공격 피해' },
  hp: { name: '생명력 강화', icon: '❤️', maxLevel: 40, bonusPerLevel: 0.03, breakAt: 20, bonusAfter: 0.02, effect: '최대 HP' },
  speed: { name: '비행속도 강화', icon: '🪽', maxLevel: 40, bonusPerLevel: 0.01, breakAt: 10, bonusAfter: 0.005, effect: '이동속도' },
  pickup: { name: '경험치 흡수 강화', icon: '💎', maxLevel: 40, bonusPerLevel: 0.05, breakAt: 10, bonusAfter: 0.025, effect: '보석 획득 반경' },
};

/** 연구소 레벨의 누적 증가율(0.4 = +40%) */
export function labBonus(type: UpgradeType, level: number): number {
  const d = PERMANENT_UPGRADES[type];
  const lv = Math.max(0, Math.min(d.maxLevel, level));
  return Math.min(lv, d.breakAt) * d.bonusPerLevel + Math.max(0, lv - d.breakAt) * d.bonusAfter;
}

// 비용: Lv.20까지 C(n) = ceil(50 × 1.20^(n−1)) 그대로, 그 뒤는 Lv.20 비용(1,598G)에서 레벨마다 ×1.08(급등 방지 — v1.2)
export const COST = { base: 50, growth: 1.2, lateFrom: 19, lateGrowth: 1.08 };

/** currentLevel에서 한 레벨 올리는 비용. currentLevel=0 → 50G, 9 → 258G, 19 → 1598G, 39 → 7,446G */
export function getUpgradeCost(currentLevel: number): number {
  if (currentLevel <= COST.lateFrom) return Math.ceil(COST.base * Math.pow(COST.growth, currentLevel));
  return Math.ceil(COST.base * Math.pow(COST.growth, COST.lateFrom) * Math.pow(COST.lateGrowth, currentLevel - COST.lateFrom));
}

/** 강화 레벨에 따른 보정치: 1 + 누적 증가율 */
export function upgradeMult(type: UpgradeType, level: number): number {
  return 1 + labBonus(type, level);
}

export type PermanentUpgrades = Record<UpgradeType, number>;

/**
 * 판 시작 능력치 = 기본 능력치 × 연구소 보정치.
 * 전투 중 패시브는 기본값의 %만큼 더하는 방식(용의 심장 +10, 폭풍의 날개 +13)이라
 * 영구 강화와 자연스럽게 "합산"된다(기획서 v1.0 2장: 1.20 + 0.40 = 1.60배).
 */
export function applyPermanent(base: RunStats, up: PermanentUpgrades): RunStats {
  return {
    ...base,
    attack: base.attack * upgradeMult('attack', up.attack),
    maxHp: base.maxHp * upgradeMult('hp', up.hp),
    speed: base.speed * upgradeMult('speed', up.speed),
    magnet: base.magnet * upgradeMult('pickup', up.pickup),
  };
}

/**
 * 6단계: 판 시작 능력치 = 드래곤 기본값 × (1 + 연구소 + 드래곤 레벨 + 승급) — 같은 능력치의 영구 보너스는 더한다.
 * 연구소 Lv.0 · 드래곤 Lv.1 · 1성 레드는 4·5단계 `BASE_STATS`와 똑같다.
 * permHpBonus: 영구 HP 증가분 전체(연구소·레벨·승급). 35% 피해 상한 기준에서 뺀다.
 */
export function buildRunStats(
  def: DragonDef,
  up: PermanentUpgrades,
  owned: { level: number; stars: number },
): { stats: RunStats; permHpBonus: number; traitMult: number; traits: BasicTraits; perm: PermState } {
  const lb = levelBonus(owned.level);
  const sb = starBonus(owned.stars);
  const traitMult = traitMultFor(def.id, owned.stars);
  const t = def.trait.value * traitMult;
  const perm = permState(def.id, owned.level);
  const baseHp = def.baseHp;
  const stats: RunStats = {
    ...BASE_STATS,
    attack: def.baseAttack * (1 + labBonus('attack', up.attack) + lb.attack + sb.attack),
    maxHp: baseHp * (1 + labBonus('hp', up.hp) + lb.hp + sb.hp),
    speed: def.baseMoveSpeed * (1 + labBonus('speed', up.speed) + (def.trait.id === 'swift' ? t : 0) + perm.move),
    magnet: BASE_STATS.magnet * (1 + labBonus('pickup', up.pickup)),
    damageTaken: 1 - (def.trait.id === 'guard' ? t : 0) - perm.guard,
  };
  const traits: BasicTraits = {
    ...NO_TRAITS,
    intervalMult: def.trait.id === 'haste' ? 1 - t : 1,
    poisonDurMult: def.trait.id === 'poisonDuration' ? 1 + t : 1,
    slowDurMult: def.trait.id === 'slowDuration' ? 1 + t : 1,
    chainRelief: (def.trait.id === 'chainRelief' ? t : 0) + perm.chainRelief,
    killHealChance: def.trait.id === 'killHeal' ? t : 0,
    killHealPct: 0.01 * (1 + perm.healAmt),
    healAdd: perm.healAdd,
    executeBonus: (def.trait.id === 'execute' ? t : 0) + perm.executeAdd,
  };
  // 35% 한 방 상한 기준 HP = 드래곤 기본 HP(종별). 연구소·영구 레벨·승급·장비로 오른 HP는 뺀다(v1.2 12장).
  return { stats, permHpBonus: stats.maxHp - baseHp, traitMult, traits, perm };
}

// ───────── 골드 보상 (기획서 v1.0 4장 + v1.1) ─────────
export const GOLD = {
  base: 30, // 기본 보상
  survivalPer30s: 10, // 생존 30초마다
  // 2026-11-20: "일반 적 100마리당 5G(최대 80)"를 전투 중 줍는 골드(coin)로 바꿈. 상한 80G는 그대로라 판당 최대 수급량이 같다.
  killGoldCap: 80,
  /** 클리어 생존 보상은 판 길이와 상관없이 기존 8분 전체(160G) — 빨리 깨도 기본 클리어 보상이 줄지 않게 */
  clearSurvivalMs: 480_000,
  elite: 20, // 엘리트 1마리당
  boss: 50,
  clear: 100,
  failRate: 0.5, // 사망·시간 초과·30초 이후 포기: 50% (11/17 확정 규칙 유지)
  quitGraceMs: 30_000, // 30초 미만 자발적 포기는 0G
};

/** 단계별 골드 배율(v1.1·v1.2): 1~5단계 1.0·1.2·1.4·1.6·1.8, 6단계 1.9, 7단계부터 2.0 고정(후반 골드 인플레이션 방지) */
export function stageGoldMult(stageId: number): number {
  if (stageId <= 5) return Math.round((1 + 0.2 * (stageId - 1)) * 100) / 100;
  return stageId === 6 ? 1.9 : 2.0;
}

export type RunOutcome = 'clear' | 'dead' | 'timeout' | 'quit';

export interface RunSummary {
  stageId: number;
  durationMs: number; // 스테이지 제한시간
  outcome: RunOutcome;
  elapsedMs: number; // 실제 버틴 시간(카드 고르는 시간 제외)
  normalKills: number;
  eliteKills: number;
  bossKilled: boolean;
  treasureGold: number; // 보물 더미 카드로 모은 골드(전투 중 임시 기록)
  /** 전투 중 주운 골드(단계 배율 전, 상한 killGoldCap) */
  coinGold?: number;
  /** 난이도 골드 배율(어려움 1.5 — 2026-11-21, 쉬움 1) */
  goldMult?: number;
}

export interface GoldBreakdown {
  lines: { label: string; gold: number }[];
  subtotal: number; // 원금 합계
  stageMult: number;
  resultMult: number; // 클리어 1.0 / 실패 0.5 / 30초 전 포기 0
  total: number; // 최종 지급(버림)
}

/** 한 판의 골드 계산. 순수 함수라 테스트로 바로 확인할 수 있다. */
/** goldBonus: 용의 보물(장착형 특수 스킬) +10% 같은 전투 골드 보너스. 기본 0 → 5단계 정산과 같다. */
export function computeRunGold(r: RunSummary, goldBonus = 0): GoldBreakdown {
  const clear = r.outcome === 'clear';
  // 클리어는 보스를 언제 잡든 8분 전체 생존 보상(v1.1 1번, 2026-11-20: 판 길이가 짧아져도 8분 기준 유지)
  const survivedMs = clear ? GOLD.clearSurvivalMs : r.elapsedMs;
  const survival = Math.floor(survivedMs / 30_000) * GOLD.survivalPer30s;
  const killGold = Math.min(GOLD.killGoldCap, Math.floor(r.coinGold ?? 0));
  const lines = [
    { label: '기본 보상', gold: GOLD.base },
    { label: clear ? '생존 보상(클리어: 전체)' : `생존 보상(${Math.floor(r.elapsedMs / 1000)}초)`, gold: survival },
    { label: `주운 골드(일반 적 ${r.normalKills}마리)`, gold: killGold },
    { label: `엘리트 ${r.eliteKills}마리`, gold: r.eliteKills * GOLD.elite },
    { label: '보스 처치', gold: r.bossKilled ? GOLD.boss : 0 },
    { label: '스테이지 클리어', gold: clear ? GOLD.clear : 0 },
    { label: '보물 더미', gold: r.treasureGold },
  ];
  if (goldBonus > 0) {
    const base = lines.reduce((a, l) => a + l.gold, 0);
    lines.push({ label: `용의 보물 +${Math.round(goldBonus * 100)}%`, gold: Math.floor(base * goldBonus) });
  }
  const subtotal = lines.reduce((a, l) => a + l.gold, 0);
  const stageMult = stageGoldMult(r.stageId);
  const resultMult = clear ? 1 : r.outcome === 'quit' && r.elapsedMs < GOLD.quitGraceMs ? 0 : GOLD.failRate;
  // 배율을 모두 곱한 뒤 최종 금액만 버림(v1.1 4번)
  const total = Math.floor(subtotal * stageMult * resultMult * (r.goldMult ?? 1) + 1e-9);
  return { lines, subtotal, stageMult, resultMult, total };
}
