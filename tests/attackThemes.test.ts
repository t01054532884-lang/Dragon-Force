import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { attackTheme, BURST_CAP, SHOT_KINDS } from '../src/data/attackThemes';
import { HIT_CAP } from '../src/data/enemies';

describe('맵 테마 공격 효과(B안 2026-11-25)', () => {
  it('1~20단계 모두 테마가 있고 바닥 효과 그림·탄 그림 파일이 있다', () => {
    for (let s = 1; s <= 20; s++) {
      const t = attackTheme(s);
      expect(t.fx.length, `${s}단계`).toBe(3);
      expect(existsSync(`public/art/fx/atk-s${s}.webp`), `atk-s${s}`).toBe(true);
      expect(SHOT_KINDS).toContain(t.shot);
    }
    for (const k of SHOT_KINDS) expect(existsSync(`public/art/fx/shot-${k}.webp`), k).toBe(true);
  });

  it('한 번에 쓰러지지 않게: 1초 합계 상한 < 100%, 한 방 상한 ≤ 1초 상한, 맵 기믹 한 방은 더 작게', () => {
    expect(BURST_CAP.ratio).toBeLessThan(1);
    expect(HIT_CAP.boss).toBeLessThanOrEqual(BURST_CAP.ratio);
    expect(HIT_CAP.elite).toBeLessThanOrEqual(BURST_CAP.ratio);
    expect(BURST_CAP.mapHit).toBeLessThan(HIT_CAP.boss);
  });
});
