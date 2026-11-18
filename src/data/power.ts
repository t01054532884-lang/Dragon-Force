import type { Difficulty } from './economy';

// 개발 6단계 v1.2 10·11장 — 전투력(CP)과 권장 전투력. 진입 제한이 아닌 안내 수치.
// CP = 1000 × (A÷10)^0.75 × (H÷100)^0.35 × (V÷260)^0.15 × (1 + S)   (원문)
// A·H·V = 전투 시작 전 영구 능력치(연구소·영구 레벨·승급·장비). 전투 중 레벨업은 넣지 않는다.

export const CP_RULES = {
  /** S 보정(AI 1차안): 열린 5레벨 고유 성장 단계마다 +2%. 장착형 특수 스킬 S는 우선 0(제작자 임시). */
  perTier: 0.02,
};

export function combatPower(A: number, H: number, V: number, S: number): number {
  return Math.round(1000 * Math.pow(A / 10, 0.75) * Math.pow(H / 100, 0.35) * Math.pow(V / 260, 0.15) * (1 + S));
}

/** 1~20단계 쉬움 권장 CP(원문). 어려움 ×1.5, 매우 어려움 ×2.2 → 반올림 */
export const RECOMMENDED_EASY = [900, 1050, 1200, 1350, 1500, 1650, 1800, 2000, 2200, 2400, 2600, 2850, 3100, 3350, 3600, 3850, 4100, 4400, 4700, 5000];
const DIFF_MULT: Record<Difficulty, number> = { easy: 1, hard: 1.5, extreme: 2.2 };

export function recommendedCp(stageId: number, d: Difficulty): number {
  return Math.round(RECOMMENDED_EASY[Math.max(1, Math.min(20, stageId)) - 1] * DIFF_MULT[d]);
}

/** 입장 비교 문구(원문 계산기): 100% 이상 권장 이상 · 80% 이상 도전 가능 · 그 아래 성장 권장. 입장은 항상 허용. */
export function cpVerdict(cp: number, rec: number): { text: string; color: string } {
  const r = cp / rec;
  if (r >= 1) return { text: '권장 이상', color: '#5bd69a' };
  if (r >= 0.8) return { text: '도전 가능', color: '#ffd34d' };
  return { text: '성장 권장', color: '#ff6b6b' };
}
