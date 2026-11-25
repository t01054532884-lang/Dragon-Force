import { describe, expect, it } from 'vitest';
import { arenaLayout, ARENA_LAYOUTS, STAGE_ARENAS, clampToArena, edgePointAt, hitsObstacle, makeArena, outsideArena, randomPointIn, steerAround, touchingWall, type ArenaGeom } from '../src/data/arenas';
import { earlyEase } from '../src/data/stages';

const R = 1100;

describe('전장 모양(2026-11-24)', () => {
  it('1~20단계 모두 장애물이 있고 단계마다 배치가 다르다(2026-11-25), 원형·정사각형을 섞어 쓴다', () => {
    const lays = Array.from({ length: 20 }, (_, i) => arenaLayout(i + 1));
    expect(new Set(lays.map((l) => l.id)).size).toBe(20);
    expect(lays.filter((l) => l.shape === 'square').length).toBeGreaterThanOrEqual(6);
    for (const l of lays) expect(l.obstacles.length, l.id).toBeGreaterThan(0);
  });

  it('드래곤 시작·보스 등장 자리에 장애물이 없다', () => {
    for (const lay of [...Object.values(ARENA_LAYOUTS), ...Object.values(STAGE_ARENAS)]) {
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

describe('장애물 돌아가기(테스터 피드백 2026-11-25: 벽 뒤에서 멈춰 있음)', () => {
  // 몬스터를 1/60초씩 움직여 목표에 닿는지 본다(이동 → 장애물 밀어내기, 게임과 같은 순서)
  const chase = (a: ArenaGeom, from: { x: number; y: number }, to: { x: number; y: number }, rad: number, steer: boolean, side = 1) => {
    let { x, y } = from;
    for (let i = 0; i < 60 * 12; i++) {
      const d = Math.hypot(to.x - x, to.y - y);
      if (d < rad + 20) return i / 60;
      let vx = ((to.x - x) / d) * 120;
      let vy = ((to.y - y) / d) * 120;
      if (steer) ({ vx, vy } = steerAround(a, x, y, vx, vy, rad, side, d));
      ({ x, y } = clampToArena(a, x + vx / 60, y + vy / 60, rad));
    }
    return Infinity;
  };
  const walls = makeArena(0, 0, R, ARENA_LAYOUTS.walls);
  const wall = walls.obstacles![0] as { x: number; y: number; w: number; h: number };
  it('세 갈래 길: 벽 바로 뒤(정면)에 있던 몬스터가 벽을 돌아 드래곤에게 닿는다', () => {
    const from = { x: wall.x - wall.w / 2 - 60, y: wall.y };
    const to = { x: wall.x + wall.w / 2 + 200, y: wall.y };
    expect(chase(walls, from, to, 20, false)).toBe(Infinity); // 예전: 끝까지 벽에 붙어 멈춤
    expect(chase(walls, from, to, 20, true)).toBeLessThan(8);
  });
  it('기둥 뒤 정면에서도 양쪽(홀짝) 모두 돌아 나온다', () => {
    const a = makeArena(0, 0, R, ARENA_LAYOUTS.center);
    const p = a.obstacles![0] as { x: number; y: number; r: number };
    const from = { x: p.x, y: p.y - p.r - 40 };
    const to = { x: p.x, y: p.y + p.r + 200 };
    for (const side of [1, -1]) expect(chase(a, from, to, 20, true, side)).toBeLessThan(8);
  });
  it('장애물이 멀거나 반대쪽이면 방향을 바꾸지 않는다', () => {
    const v = steerAround(walls, 0, -900, 0, -120, 20);
    expect(v).toEqual({ vx: 0, vy: -120 });
  });
});
