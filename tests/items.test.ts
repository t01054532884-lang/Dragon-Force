import { describe, expect, it } from 'vitest';
import { NORMAL_DROP, rollNormalDrop } from '../src/data/items';

describe('일반 몬스터 드롭 확률', () => {
  it('합계 0.5%, 내부 비율 20 / 36 / 24 / 20', () => {
    const total = NORMAL_DROP.reduce((a, [, p]) => a + p, 0);
    expect(total).toBeCloseTo(0.005);
    expect(NORMAL_DROP.map(([, p]) => Math.round((p / total) * 100))).toEqual([20, 36, 24, 20]);
  });
  it('난수 경계: 처치당 최대 1종', () => {
    expect(rollNormalDrop(0)).toBe('box');
    expect(rollNormalDrop(0.00099)).toBe('box');
    expect(rollNormalDrop(0.001)).toBe('potion');
    expect(rollNormalDrop(0.0028)).toBe('magnet');
    expect(rollNormalDrop(0.004)).toBe('shield');
    expect(rollNormalDrop(0.005)).toBe(null);
    expect(rollNormalDrop(0.9999)).toBe(null);
  });
  it('200만 번 시뮬레이션이 설정값에 수렴(±5%)', () => {
    // 고정 시드 난수(mulberry32)로 매번 같은 결과
    let a = 12345;
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const N = 2_000_000;
    const count: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      const d = rollNormalDrop(rnd());
      if (d) count[d] = (count[d] ?? 0) + 1;
    }
    for (const [id, p] of NORMAL_DROP) expect(Math.abs(count[id] / N - p) / p).toBeLessThan(0.05);
  });
});
