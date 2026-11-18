import { describe, expect, it } from 'vitest';
import { CHEST_FX, openingTier, resultTier } from '../src/data/chestFx';
import type { BoxResult } from '../src/systems/Progress';

describe('상자 개봉 연출 등급', () => {
  it('결과 중 가장 높은 등급으로 연출', () => {
    const rs: BoxResult[] = [
      { kind: 'card', dragonId: 'blue', rarity: 'common', count: 1 },
      { kind: 'fragment', dragonId: 'wind', rarity: 'epic', count: 3 },
      { kind: 'gold', gold: 500 },
    ];
    expect(openingTier(rs)).toBe('epic');
  });
  it('골드는 금액 순위로: 500 일반 · 1000 희귀 · 2000 영웅 · 5000 전설', () => {
    expect([500, 1000, 2000, 5000].map((gold) => resultTier({ kind: 'gold', gold }))).toEqual(['common', 'rare', 'epic', 'legendary']);
  });
  it('특수 스킬 조각은 희귀 연출', () => {
    expect(resultTier({ kind: 'special', specialId: 'x' as never, count: 1 })).toBe('rare');
  });
  it('등급이 높을수록 흔들림·파티클이 늘어남(공통 시스템, 수치만 다름)', () => {
    const order = ['common', 'rare', 'epic', 'legendary'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(CHEST_FX[order[i]].shakes).toBeGreaterThan(CHEST_FX[order[i - 1]].shakes);
      expect(CHEST_FX[order[i]].particles).toBeGreaterThan(CHEST_FX[order[i - 1]].particles);
    }
  });
});
