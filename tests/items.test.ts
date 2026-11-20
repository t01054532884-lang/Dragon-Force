import { describe, expect, it } from 'vitest';
import { decideDrop, ITEM_RULES, newDropState, NORMAL_DROP, rollNormalDrop } from '../src/data/items';
import { applyMerge, gemTier, mergeGroups } from '../src/systems/GemMerge';

/** 고정 시드 난수(mulberry32)로 매번 같은 결과 */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('일반 몬스터 드롭 확률(2026-11-20)', () => {
  it('상자 0.04 · 물약 0.45 · 자석 0.30 · 수호막 0.15 · 골드 3%', () => {
    expect(NORMAL_DROP.map(([, p]) => p)).toEqual([0.0004, 0.0045, 0.003, 0.0015, 0.03]);
    // 물약·자석은 이전(0.18 · 0.12%)의 2.5배
    expect(NORMAL_DROP.find(([id]) => id === 'potion')![1] / 0.0018).toBeCloseTo(2.5);
    expect(NORMAL_DROP.find(([id]) => id === 'magnet')![1] / 0.0012).toBeCloseTo(2.5);
  });
  it('난수 경계: 처치당 최대 1종', () => {
    expect(rollNormalDrop(0)).toBe('box');
    expect(rollNormalDrop(0.00039)).toBe('box');
    expect(rollNormalDrop(0.0004)).toBe('potion');
    expect(rollNormalDrop(0.0049)).toBe('magnet');
    expect(rollNormalDrop(0.0079)).toBe('shield');
    expect(rollNormalDrop(0.0094)).toBe('coin');
    expect(rollNormalDrop(0.0394)).toBe(null);
    expect(rollNormalDrop(0.9999)).toBe(null);
  });
  it('체력이 낮으면 물약 확률 ×2', () => {
    expect(rollNormalDrop(0.006)).toBe('magnet');
    expect(rollNormalDrop(0.006, 2)).toBe('potion');
  });
  it('500만 번 시뮬레이션이 설정값에 수렴(표준오차 4배 안)', () => {
    const rnd = seeded(12345);
    const N = 5_000_000;
    const count: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const d = rollNormalDrop(rnd());
      if (d) count[d] = (count[d] ?? 0) + 1;
    }
    // 상자 0.04%는 기대 2,000개라 표준오차가 약 2.2% → 고정 비율 대신 4σ로 본다
    for (const [id, p] of NORMAL_DROP) expect(Math.abs(count[id] / N - p) / p, id).toBeLessThan(4 / Math.sqrt(N * p));
  });
});

describe('드롭 천장·물약 상한', () => {
  it('자석이 160마리 동안 안 나오면 다음 처치에 확정', () => {
    const st = newDropState();
    let got: string | null = null;
    for (let i = 0; i < ITEM_RULES.pityKills.magnet; i++) got = decideDrop(st, 0.99, 1);
    expect(got).toBe('magnet');
    expect(st.sinceMagnet).toBe(0);
  });
  it('물약 천장은 체력 60% 이하일 때만', () => {
    const full = newDropState();
    full.sinceMagnet = -1e9; // 자석 천장은 빼고 보기
    for (let i = 0; i < 400; i++) expect(decideDrop(full, 0.99, 1)).toBe(null);
    const low = newDropState();
    low.sinceMagnet = -1e9;
    let got: string | null = null;
    for (let i = 0; i < ITEM_RULES.pityKills.potion; i++) got = decideDrop(low, 0.99, 0.5);
    expect(got).toBe('potion');
  });
  it('무한 생존 방지: 한 판 물약 최대 6개', () => {
    const st = newDropState();
    let potions = 0;
    for (let i = 0; i < 50; i++) if (decideDrop(st, 0.001, 0.1) === 'potion') potions++;
    expect(potions).toBe(ITEM_RULES.potionMaxPerRun);
  });
  it('1,000마리 처치(시드 20판): 판마다 물약·자석이 최소 1개, 한 판 내내 안 나오는 경우 없음', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = seeded(seed);
      const st = newDropState();
      const got: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        const d = decideDrop(st, rnd(), i % 200 < 100 ? 0.5 : 0.9); // 체력이 오르내리는 판
        if (d) got[d] = (got[d] ?? 0) + 1;
      }
      expect(got.magnet ?? 0, `시드 ${seed} 자석`).toBeGreaterThanOrEqual(3);
      expect(got.potion ?? 0, `시드 ${seed} 물약`).toBeGreaterThanOrEqual(1);
      expect(got.potion ?? 0).toBeLessThanOrEqual(ITEM_RULES.potionMaxPerRun);
    }
  });
});

describe('경험치 보석 등급·합치기', () => {
  it('소량(1~2) 파랑 · 중량(3~9) 보라 · 대량(10+) 금빛', () => {
    expect([1, 2, 3, 9, 10, 25].map(gemTier)).toEqual(['small', 'small', 'medium', 'medium', 'large', 'large']);
  });
  it('가까운 보석만 묶는다', () => {
    const g = mergeGroups([{ x: 10, y: 10, value: 1 }, { x: 30, y: 20, value: 2 }, { x: 500, y: 500, value: 3 }], 70);
    expect(g).toEqual([[0, 1]]);
  });
  it('합치기 전후 경험치 총량이 같다(무작위 1,000개)', () => {
    const rnd = seeded(7);
    const pts = Array.from({ length: 1000 }, () => ({ x: rnd() * 2000, y: rnd() * 2000, value: 1 + Math.floor(rnd() * 4) }));
    const before = pts.reduce((a, p) => a + p.value, 0);
    const after = applyMerge(pts, 70);
    expect(after.reduce((a, p) => a + p.value, 0)).toBe(before);
    expect(after.length).toBeLessThan(pts.length);
  });
});
