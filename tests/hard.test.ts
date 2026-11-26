import { describe, expect, it } from 'vitest';
import { HARD_GOLD_MULT, HARD_STAGES, hardStage } from '../src/data/hardStages';
import { recommendedCp, RECOMMENDED_EASY } from '../src/data/power';
import { computeRunGold } from '../src/data/progression';
import { STAGES } from '../src/data/stages';
import { ENEMIES } from '../src/data/enemies';
import { defaultProgress, sanitize, settleRun } from '../src/systems/Progress';

describe('어려움 1~20단계 데이터(기획서 v1.0)', () => {
  it('20단계 모두, 원문 권장 전투력 배율 ×1.50 → ×2.00', () => {
    expect(HARD_STAGES).toHaveLength(20);
    expect(HARD_STAGES.map((h) => h.recommendedPowerMultiplier)).toEqual([1.5, 1.5, 1.55, 1.55, 1.6, 1.6, 1.65, 1.65, 1.7, 1.7, 1.75, 1.75, 1.8, 1.8, 1.85, 1.85, 1.9, 1.9, 1.95, 2.0]);
    // 예: 쉬움 10단계 1,550 → 어려움 ×1.70 × 1.2(2026-11-27 권장 상향) = 3,162
    expect(recommendedCp(10, 'hard')).toBe(Math.round(RECOMMENDED_EASY[9] * 1.7 * 1.2));
    expect(recommendedCp(10, 'easy')).toBe(Math.round(RECOMMENDED_EASY[9] * 1.2));
  });
  it('전장 크기 95% → 70%(줄어들기만), 적 체력·공격력 배율은 단계마다 같거나 증가', () => {
    expect([1, 4, 7, 10, 13, 16, 19].map((s) => hardStage(s).arenaSizeMultiplier)).toEqual([0.95, 0.9, 0.85, 0.8, 0.75, 0.72, 0.7]);
    for (let i = 1; i < 20; i++) {
      expect(HARD_STAGES[i].arenaSizeMultiplier).toBeLessThanOrEqual(HARD_STAGES[i - 1].arenaSizeMultiplier);
      expect(HARD_STAGES[i].enemyHpMultiplier).toBeGreaterThanOrEqual(HARD_STAGES[i - 1].enemyHpMultiplier);
      expect(HARD_STAGES[i].enemyDamageMultiplier).toBeGreaterThanOrEqual(HARD_STAGES[i - 1].enemyDamageMultiplier);
    }
    expect([hardStage(1).enemyHpMultiplier, hardStage(20).enemyHpMultiplier, hardStage(20).enemyDamageMultiplier]).toEqual([1.1, 1.3, 1.45]);
  });
  it('엘리트 2마리는 2단계부터, 보스 2마리는 5단계부터(5·10·14·17·19·20), 보스 2마리 각 60~65%', () => {
    expect(hardStage(1).eliteSpawnCount).toEqual([1, 1]);
    expect(hardStage(2).eliteSpawnCount).toEqual([1, 2]);
    const two = HARD_STAGES.filter((h) => h.bossSpawnCount === 2).map((h) => h.stageId);
    expect(two).toEqual([5, 10, 14, 17, 19, 20]);
    for (const h of HARD_STAGES) {
      if (h.bossSpawnCount === 2) {
        expect(h.bossHpMultiplier).toBeGreaterThanOrEqual(0.6);
        expect(h.bossHpMultiplier).toBeLessThanOrEqual(0.65);
      }
    }
  });
  it('쉬움 몬스터·보스를 그대로 쓴다(새 몬스터 없음), 모든 단계 시작 스킬 3장', () => {
    for (const h of HARD_STAGES) {
      const s = STAGES[h.stageId - 1];
      expect(ENEMIES[s.bossId]).toBeDefined();
      expect(h.startingSkillChoices).toBe(3);
    }
  });
});

describe('어려움 보상·기록', () => {
  it('반복 클리어 골드 ×1.5(쉬움은 그대로)', () => {
    const base = { stageId: 1, durationMs: 420_000, outcome: 'clear' as const, elapsedMs: 200_000, normalKills: 300, eliteKills: 2, bossKilled: true, treasureGold: 0 };
    expect(computeRunGold(base).total).toBe(380);
    expect(computeRunGold({ ...base, goldMult: HARD_GOLD_MULT }).total).toBe(570);
  });
  it('최초 클리어 루비는 한 번만(5단계 특별 보상 포함), 최고 기록은 더 빠를 때만 갱신', () => {
    let p = defaultProgress();
    p = { ...p, difficulty: { ...p.difficulty, hard: { unlocked: [1, 2, 3, 4, 5], cleared: [], claimed: [] } } };
    const run = { stageId: 5, cleared: true, elapsedMs: 300_000, normalKills: 100, eliteKills: 2, difficulty: 'hard' as const };
    const a = settleRun(p, 'h1', 0, 6, run);
    expect(a.rewards.find((r) => r.id === 'hard-first:5')?.rubies).toBe(hardStage(5).clearReward.rubies); // 업적 루비는 따로
    expect(hardStage(5).clearReward.rubies).toBe(100); // v1.1: 단계마다 100
    expect(hardStage(20).clearReward.rubies).toBe(400); // 20단계 100 + 장식 대체 300
    expect(HARD_STAGES.reduce((a, h) => a + h.clearReward.rubies, 0)).toBe(2300);
    expect(a.progress.difficulty.hard.best?.['5']).toBe(300_000);
    const b = settleRun(a.progress, 'h2', 0, 6, { ...run, elapsedMs: 280_000 });
    expect(b.progress.rubies).toBe(a.progress.rubies); // 반복 클리어엔 루비 없음
    expect(b.progress.difficulty.hard.best?.['5']).toBe(280_000);
    const c = settleRun(b.progress, 'h3', 0, 6, { ...run, elapsedMs: 290_000 });
    expect(c.progress.difficulty.hard.best?.['5']).toBe(280_000);
    // 저장 → 불러오기 뒤에도 기록 유지(예전 저장엔 best가 없어도 됨)
    const re = sanitize(JSON.parse(JSON.stringify(c.progress)));
    expect(re.difficulty.hard.best?.['5']).toBe(280_000);
    expect(re.difficulty.hard.unlocked).toContain(6);
  });
});
