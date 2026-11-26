import { describe, expect, it } from 'vitest';
import { defaultProgress, devBoost } from '../src/systems/Progress';

const ALL = Array.from({ length: 20 }, (_, i) => i + 1);

describe('테스터 링크(?dev=1)', () => {
  it('루비·골드 최소 20,000, 출시된 난이도 1~20단계 해금, 클리어 기록은 그대로', () => {
    const base = defaultProgress();
    const p = devBoost(base, ALL);
    expect(p.rubies).toBe(20000);
    expect(p.gold).toBe(20000);
    expect(p.difficulty.easy.unlocked).toEqual(ALL);
    expect(p.difficulty.hard.unlocked).toEqual(ALL);
    expect(p.difficulty.extreme.unlocked).toEqual(ALL); // 매우 어려움도 출시(2026-11-26)
    expect(p.unlockedStages).toEqual(ALL);
    expect(p.difficulty.easy.cleared).toEqual([]);
  });
  it('이미 더 많으면 줄이지 않음, 여러 번 해도 같음', () => {
    const p = devBoost({ ...defaultProgress(), rubies: 50000, gold: 99 }, ALL);
    expect(p.rubies).toBe(50000);
    expect(p.gold).toBe(20000);
    expect(devBoost(p, ALL)).toEqual(p);
  });
});
