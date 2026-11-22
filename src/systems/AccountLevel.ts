import type { PlayerProgress } from './Progress';

/**
 * 계정 레벨(제작자 요청 2026-11-23: 로비 왼쪽 위는 드래곤 레벨이 아니라 계정 레벨, 나중에 계정 레벨 패스).
 * 저장 필드를 새로 만들지 않고 이미 있는 평생 기록에서 계산 → 예전 저장도 바로 레벨이 나옴(소급).
 * 경험치(AI 1차안): 클리어 100 · 실패·포기한 판 30 · 엘리트 처치 10 · 일반 몬스터 10마리당 1.
 * 필요 경험치: Lv.n → n+1 = 100 + 50 × (n − 1). 최대 Lv.99.
 */
export const ACCOUNT_XP = { clear: 100, run: 30, elite: 10, normalPer: 10 } as const;
export const ACCOUNT_MAX_LEVEL = 99;
export const xpToNext = (level: number) => 100 + 50 * (level - 1);

export function accountXp(p: Pick<PlayerProgress, 'lifetime'>): number {
  const l = p.lifetime;
  const fails = Math.max(0, l.runs - l.clears);
  return l.clears * ACCOUNT_XP.clear + fails * ACCOUNT_XP.run + l.eliteKills * ACCOUNT_XP.elite + Math.floor(l.normalKills / ACCOUNT_XP.normalPer);
}

/** 계정 레벨 · 이번 레벨에서 모은 경험치 · 다음 레벨까지 필요한 양 */
export function accountLevel(p: Pick<PlayerProgress, 'lifetime'>): { level: number; xp: number; need: number } {
  let xp = accountXp(p);
  let level = 1;
  while (level < ACCOUNT_MAX_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
  }
  return { level, xp, need: level >= ACCOUNT_MAX_LEVEL ? 0 : xpToNext(level) };
}
