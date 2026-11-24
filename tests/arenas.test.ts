import { describe, expect, it } from 'vitest';
import { arenaLayout, ARENA_LAYOUTS, clampToArena, edgePointAt, hitsObstacle, makeArena, outsideArena, randomPointIn, touchingWall } from '../src/data/arenas';
import { earlyEase } from '../src/data/stages';

const R = 1100;

describe('전장 모양(2026-11-24)', () => {
  it('1~20단계가 원형·정사각형·장애물 배치를 섞어 쓴다', () => {
    const ids = Array.from({ length: 20 }, (_, i) => arenaLayout(i + 1).id);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(6);
    expect(ids.filter((id) => ARENA_LAYOUTS[id].shape === 'square').length).toBeGreaterThanOrEqual(6);
    // 최종보스 단계(5·10·15·20)는 장애물 없음
    for (const s of [5, 10, 15, 20]) expect(arenaLayout(s).obstacles).toEqual([]);
  });

  it('드래곤 시작·보스 등장 자리에 장애물이 없다', () => {
    for (const lay of Object.values(ARENA_LAYOUTS)) {
      for (const scale of [1, 0.7]) {
        const a = makeArena(0, 0, R * scale, lay);
        expect(hitsObstacle(a, 0, a.r * 0.4, 25), `${lay.id} 시작`).toBe(false);
        expect(hitsObstacle(a, 0, -a.r * 0.55, 40), `${lay.id} 보스`).toBe(false);
        expect(hitsObstacle(a, a.r * 0.45, -a.r * 0.35, 30), `${lay.id} 보스2`).toBe(false);
      }
    }
  });

  it('기둥 안으로 들어가면 바깥으로 밀려난다', () => {
    const a = makeArena(0, 0, R, ARENA_LAYOUTS.pillars);
    const o = a.obstacles![0] as { x: number; y: number; r: number };
    const p = clampToArena(a, o.x + 5, o.y, 20);
    expect(Math.hypot(p.x - o.x, p.y - o.y)).toBeCloseTo(o.r + 20, 5);
  });

  it('정사각형은 모서리까지 갈 수 있고 벽 밖은 안 된다', () => {
    const a = makeArena(0, 0, R, ARENA_LAYOUTS.square);
    expect(clampToArena(a, R * 0.9, R * 0.9, 20)).toEqual({ x: R * 0.9, y: R * 0.9 });
    expect(clampToArena(a, R * 2, -R * 2, 20)).toEqual({ x: R - 20, y: -(R - 20) });
    expect(outsideArena(a, R * 0.95, R * 0.95)).toBe(false);
    const c = makeArena(0, 0, R, ARENA_LAYOUTS.circle);
    expect(outsideArena(c, R * 0.95, R * 0.95)).toBe(true);
  });

  it('가장자리 생성 점은 정사각형 변 위에 있다', () => {
    const a = makeArena(0, 0, R, ARENA_LAYOUTS.square);
    const p = edgePointAt(a, Math.PI / 4, 60);
    expect(p.x).toBeCloseTo(R - 60, 5);
    expect(p.y).toBeCloseTo(R - 60, 5);
    expect(touchingWall(a, R - 10, 0, 20)).toBe(true);
    expect(touchingWall(a, 0, 0, 20)).toBe(false);
  });

  it('떠돌이 목적지는 전장 안·장애물 밖', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const lay of Object.values(ARENA_LAYOUTS)) {
      const a = makeArena(0, 0, R, lay);
      for (let i = 0; i < 200; i++) {
        const p = randomPointIn(a, rnd, 100);
        expect(outsideArena(a, p.x, p.y, -40)).toBe(false);
        expect(hitsObstacle(a, p.x, p.y, 40)).toBe(false);
      }
    }
  });
});

describe('1~5단계 완화(2026-11-24)', () => {
  it('1~5단계만 적 체력·피해를 줄이고 6단계부터는 그대로', () => {
    expect(earlyEase(1)).toBeLessThan(1);
    expect(earlyEase(5)).toBeLessThan(1);
    for (let s = 1; s < 5; s++) expect(earlyEase(s)).toBeLessThanOrEqual(earlyEase(s + 1));
    expect(earlyEase(6)).toBe(1);
    expect(earlyEase(20)).toBe(1);
  });
});
