import type { RunStats } from './stats';

// 5단계 영구 성장 수치 (제작자 기획서 v1.0 + v1.1 수정, 2026-11-18 확정)
// 테스트하며 조정할 수 있도록 숫자는 모두 이 파일에 모은다.

export type UpgradeType = 'attack' | 'hp' | 'speed' | 'pickup';
export const UPGRADE_TYPES: UpgradeType[] = ['attack', 'hp', 'speed', 'pickup'];

export interface PermanentUpgradeDef {
  name: string;
  icon: string;
  maxLevel: number;
  bonusPerLevel: number; // 레벨당 증가율(0.02 = +2%)
  effect: string; // 화면에 보일 효과 이름
}

export const PERMANENT_UPGRADES: Record<UpgradeType, PermanentUpgradeDef> = {
  attack: { name: '공격력 강화', icon: '⚔️', maxLevel: 20, bonusPerLevel: 0.02, effect: '모든 공격 피해' },
  hp: { name: '생명력 강화', icon: '❤️', maxLevel: 20, bonusPerLevel: 0.03, effect: '최대 HP' },
  speed: { name: '비행속도 강화', icon: '🪽', maxLevel: 10, bonusPerLevel: 0.01, effect: '이동속도' },
  pickup: { name: '경험치 흡수 강화', icon: '💎', maxLevel: 10, bonusPerLevel: 0.05, effect: '보석 획득 반경' },
};

// 비용: C(n) = ceil(50 × 1.20^(n−1)), n = 구매 후 도달 레벨
export const COST = { base: 50, growth: 1.2 };

/** currentLevel에서 한 레벨 올리는 비용. currentLevel=0 → 50G, 9 → 258G, 19 → 1598G */
export function getUpgradeCost(currentLevel: number): number {
  return Math.ceil(COST.base * Math.pow(COST.growth, currentLevel));
}

/** 강화 레벨에 따른 보정치: 1 + 레벨 × 증가율 */
export function upgradeMult(type: UpgradeType, level: number): number {
  return 1 + level * PERMANENT_UPGRADES[type].bonusPerLevel;
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

// ───────── 골드 보상 (기획서 v1.0 4장 + v1.1) ─────────
export const GOLD = {
  base: 30, // 기본 보상
  survivalPer30s: 10, // 생존 30초마다
  killsPerStep: 20, // 일반 적 20마리마다
  goldPerKillStep: 5,
  killGoldCap: 80,
  elite: 20, // 엘리트 1마리당
  boss: 50,
  clear: 100,
  failRate: 0.5, // 사망·시간 초과·30초 이후 포기: 50% (11/17 확정 규칙 유지)
  quitGraceMs: 30_000, // 30초 미만 자발적 포기는 0G
};

/** 단계별 골드 배율: 1단계 1.0 ~ 5단계 1.8 (v1.1). 6단계 이후는 아직 미정 → 같은 규칙(+0.2)으로 늘려 둠 */
export function stageGoldMult(stageId: number): number {
  return Math.round((1 + 0.2 * (stageId - 1)) * 100) / 100;
}

export type RunOutcome = 'clear' | 'dead' | 'timeout' | 'quit';

export interface RunSummary {
  stageId: number;
  durationMs: number; // 스테이지 길이(8분)
  outcome: RunOutcome;
  elapsedMs: number; // 실제 버틴 시간(카드 고르는 시간 제외)
  normalKills: number;
  eliteKills: number;
  bossKilled: boolean;
  treasureGold: number; // 보물 더미 카드로 모은 골드(전투 중 임시 기록)
}

export interface GoldBreakdown {
  lines: { label: string; gold: number }[];
  subtotal: number; // 원금 합계
  stageMult: number;
  resultMult: number; // 클리어 1.0 / 실패 0.5 / 30초 전 포기 0
  total: number; // 최종 지급(버림)
}

/** 한 판의 골드 계산. 순수 함수라 테스트로 바로 확인할 수 있다. */
export function computeRunGold(r: RunSummary): GoldBreakdown {
  const clear = r.outcome === 'clear';
  // 클리어는 보스를 언제 잡든 8분 전체 생존 보상(v1.1 1번)
  const survivedMs = clear ? r.durationMs : r.elapsedMs;
  const survival = Math.floor(survivedMs / 30_000) * GOLD.survivalPer30s;
  const killGold = Math.min(GOLD.killGoldCap, Math.floor(r.normalKills / GOLD.killsPerStep) * GOLD.goldPerKillStep);
  const lines = [
    { label: '기본 보상', gold: GOLD.base },
    { label: clear ? '생존 보상(클리어: 8분 전체)' : `생존 보상(${Math.floor(r.elapsedMs / 1000)}초)`, gold: survival },
    { label: `일반 적 ${r.normalKills}마리`, gold: killGold },
    { label: `엘리트 ${r.eliteKills}마리`, gold: r.eliteKills * GOLD.elite },
    { label: '보스 처치', gold: r.bossKilled ? GOLD.boss : 0 },
    { label: '스테이지 클리어', gold: clear ? GOLD.clear : 0 },
    { label: '보물 더미', gold: r.treasureGold },
  ];
  const subtotal = lines.reduce((a, l) => a + l.gold, 0);
  const stageMult = stageGoldMult(r.stageId);
  const resultMult = clear ? 1 : r.outcome === 'quit' && r.elapsedMs < GOLD.quitGraceMs ? 0 : GOLD.failRate;
  // 배율을 모두 곱한 뒤 최종 금액만 버림(v1.1 4번)
  const total = Math.floor(subtotal * stageMult * resultMult + 1e-9);
  return { lines, subtotal, stageMult, resultMult, total };
}
