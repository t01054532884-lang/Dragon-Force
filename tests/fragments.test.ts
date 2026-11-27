import { describe, expect, it } from 'vitest';
import { DRAGONS, releasedDragons } from '../src/data/dragons';
import { econRarity, MISSIONS, RANDOM_FRAGMENT_RARITY } from '../src/data/economy';
import { randomFragmentDragon } from '../src/systems/Progress';

// 랜덤 조각 보상(제작자 요청 2026-11-22): 아무 드래곤이나 고르면 전설만 고르게 되므로 등급 확률로 랜덤 지급
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('랜덤 조각', () => {
  it('미션 보상에 "아무 드래곤 고르기" 조각이 없음(카드 고르기는 보유 드래곤만이라 그대로)', () => {
    for (const m of MISSIONS) expect((m.reward as Record<string, unknown>).pickFragments).toBeUndefined();
    expect(MISSIONS.some((m) => m.reward.randomFragments)).toBe(true);
  });
  it('등급 확률 일반 60 · 희귀 28 · 영웅 10 · 전설 2(10만 번), 출시된 드래곤만', () => {
    const rng = seeded(7);
    const n = 100_000;
    const count = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const released = new Set(releasedDragons());
    // 2026-11-28: 반복마다 expect(10만 번)를 부르면 부하가 걸린 PC에서 약 6초 → 기본 제한 5초를 넘겨 가끔 실패했다
    // (시드 고정이라 결과는 늘 같음, 느린 것만 문제). 출시 여부는 모아서 한 번만 검사한다.
    const outside = new Set<string>();
    for (let i = 0; i < n; i++) {
      const id = randomFragmentDragon(rng);
      if (!released.has(id)) outside.add(id);
      count[econRarity(DRAGONS[id].rarity)]++;
    }
    expect([...outside]).toEqual([]);
    const total = Object.values(RANDOM_FRAGMENT_RARITY).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(count) as (keyof typeof count)[]) {
      expect(count[k] / n).toBeCloseTo(RANDOM_FRAGMENT_RARITY[k] / total, 2);
    }
  });
});
