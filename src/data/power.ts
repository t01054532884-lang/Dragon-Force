import type { Difficulty } from './economy';
import { hardStage } from './hardStages';

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

/**
 * 1~20단계 쉬움 권장 CP — v1.3 임시값(제작자 2026-11-18). v1.2 표(900~5,000)는 장비가 비율 보너스로 바뀌며 레드 최대 성장(약 2,700)으로 닿지 않아 교체.
 * 입장 제한이 아닌 참고 수치. 몬스터 능력치와 연결되지 않는다. 클리어 시간 실측으로 다시 맞춘다.
 * 어려움 ×1.5, 매우 어려움 ×2.2는 아직 확정 아님(해당 난이도 구현 때 다시 설정).
 */
export const RECOMMENDED_EASY = [900, 960, 1020, 1080, 1150, 1220, 1300, 1380, 1460, 1550, 1640, 1730, 1820, 1920, 2020, 2120, 2220, 2320, 2410, 2500];
const DIFF_MULT: Record<Difficulty, number> = { easy: 1, hard: 1.5, extreme: 2.2 };

/** 어려움은 단계별 배율 ×1.50~×2.00(어려움 기획서 4장, 2026-11-21). 매우 어려움은 아직 일괄 ×2.2(미출시) */
export function recommendedCp(stageId: number, d: Difficulty): number {
  const s = Math.max(1, Math.min(20, stageId));
  const m = d === 'hard' ? hardStage(s).recommendedPowerMultiplier : DIFF_MULT[d];
  return Math.round(RECOMMENDED_EASY[s - 1] * m);
}

/** 입장 비교 문구(원문 계산기): 100% 이상 권장 이상 · 80% 이상 도전 가능 · 그 아래 성장 권장. 입장은 항상 허용. */
export function cpVerdict(cp: number, rec: number): { text: string; color: string } {
  const r = cp / rec;
  if (r >= 1) return { text: '권장 이상', color: '#5bd69a' };
  if (r >= 0.8) return { text: '도전 가능', color: '#ffd34d' };
  return { text: '성장 권장', color: '#ff6b6b' };
}
