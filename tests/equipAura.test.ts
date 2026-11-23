import { describe, expect, it } from 'vitest';

describe('장비 오라 등급(2026-11-24)', () => {
  it('4부위를 모두 껴야 하고, 가장 낮은 등급이 오라 — 희귀 미만은 없음', async () => {
    const { equipAuraRarity } = await import('../src/data/equipment');
    expect(equipAuraRarity(['legendary', 'legendary', 'legendary', 'legendary'])).toBe('legendary');
    expect(equipAuraRarity(['legendary', 'epic', 'legendary', 'rare'])).toBe('rare');
    expect(equipAuraRarity(['epic', 'epic', 'legendary', 'epic'])).toBe('epic');
    expect(equipAuraRarity(['legendary', 'legendary', 'legendary', 'common'])).toBeNull();
    expect(equipAuraRarity(['legendary', 'legendary', 'legendary', null])).toBeNull();
  });
});
