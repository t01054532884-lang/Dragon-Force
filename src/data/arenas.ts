/**
 * 전장 모양(테스터 피드백 2026-11-24 "맵이 전부 원형이라 단조롭다 — 정사각형도, 장애물 있는 맵도"):
 * 단계마다 원형/정사각형 + 장애물(돌기둥·바위·벽) 배치를 고른다. 좌표는 전장 반지름(r) 비율이라 어려움의 좁은 전장에도 같은 모양으로 줄어든다.
 * 장애물은 드래곤·몬스터의 이동만 막고, 공격(드래곤·적 투사체 모두)은 그대로 지나간다.
 * (11/24엔 적 투사체만 막혔는데 테스터가 "드래곤 공격은 통과하고 적 공격만 막힌다"고 어색해해 11/25 통일)
 * 몬스터는 장애물 앞에서 멈추지 않고 옆으로 돌아 나온다(steerAround).
 * 5·10·15·20단계(최종보스)는 돌진 패턴이 많아 장애물 없이 둔다.
 * 피해야 할 자리: 드래곤 시작(0, +0.4) · 보스 등장(0, −0.55) · 보스 2마리(±0.45, −0.35).
 */
export type ArenaShape = 'circle' | 'square';
export type Obstacle = { kind: 'pillar'; x: number; y: number; r: number } | { kind: 'rock'; x: number; y: number; w: number; h: number };

/** 전장 실제 좌표(px): 중심·반지름(정사각형은 한 변의 절반)·모양·장애물 */
export interface ArenaGeom {
  x: number;
  y: number;
  r: number;
  shape?: ArenaShape;
  obstacles?: Obstacle[];
}

export interface ArenaLayout {
  id: string;
  name: string;
  shape: ArenaShape;
  /** r 비율 좌표(중심 0,0) */
  obstacles: Obstacle[];
}

const pillars = (pts: [number, number][], r: number): Obstacle[] => pts.map(([x, y]) => ({ kind: 'pillar', x, y, r }));

export const ARENA_LAYOUTS: Record<string, ArenaLayout> = {
  circle: { id: 'circle', name: '원형 투기장', shape: 'circle', obstacles: [] },
  square: { id: 'square', name: '사각 광장', shape: 'square', obstacles: [] },
  pillars: { id: 'pillars', name: '네 기둥', shape: 'circle', obstacles: pillars([[-0.42, -0.2], [0.42, -0.2], [-0.42, 0.55], [0.42, 0.55]], 0.075) },
  rocks: {
    id: 'rocks',
    name: '바위 광장',
    shape: 'square',
    obstacles: [
      { kind: 'rock', x: -0.6, y: -0.62, w: 0.22, h: 0.14 },
      { kind: 'rock', x: 0.62, y: -0.6, w: 0.14, h: 0.22 },
      { kind: 'rock', x: -0.62, y: 0.6, w: 0.14, h: 0.22 },
      { kind: 'rock', x: 0.6, y: 0.62, w: 0.22, h: 0.14 },
      { kind: 'pillar', x: 0, y: -0.05, r: 0.06 },
    ],
  },
  ring: { id: 'ring', name: '돌기둥 고리', shape: 'circle', obstacles: pillars([0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k / 6) * Math.PI * 2) * 0.68, Math.sin((k / 6) * Math.PI * 2) * 0.68]), 0.06) },
  walls: {
    id: 'walls',
    name: '세 갈래 길',
    shape: 'square',
    obstacles: [
      { kind: 'rock', x: -0.36, y: 0.05, w: 0.07, h: 0.62 },
      { kind: 'rock', x: 0.36, y: 0.05, w: 0.07, h: 0.62 },
    ],
  },
  center: { id: 'center', name: '가운데 바위', shape: 'square', obstacles: [{ kind: 'pillar', x: 0, y: -0.05, r: 0.15 }, ...pillars([[-0.62, 0.62], [0.62, 0.62], [-0.62, -0.62], [0.62, -0.62]], 0.06)] },
};

/** 1~20단계 배치(같은 챕터 안에서도 모양이 바뀌게). 어려움도 같은 단계 번호면 같은 모양 */
const STAGE_LAYOUT = ['circle', 'square', 'pillars', 'rocks', 'circle', 'ring', 'walls', 'center', 'rocks', 'square', 'pillars', 'walls', 'ring', 'center', 'circle', 'rocks', 'walls', 'pillars', 'center', 'square'];

export function arenaLayout(stageId: number): ArenaLayout {
  return ARENA_LAYOUTS[STAGE_LAYOUT[(stageId - 1) % STAGE_LAYOUT.length]] ?? ARENA_LAYOUTS.circle;
}

/** 배치(비율) → 실제 좌표 */
export function makeArena(x: number, y: number, r: number, layout: ArenaLayout): ArenaGeom {
  return {
    x,
    y,
    r,
    shape: layout.shape,
    obstacles: layout.obstacles.map((o) => (o.kind === 'pillar' ? { kind: 'pillar', x: x + o.x * r, y: y + o.y * r, r: o.r * r } : { kind: 'rock', x: x + o.x * r, y: y + o.y * r, w: o.w * r, h: o.h * r })),
  };
}

/** 반지름 rad인 몸이 벽·장애물과 겹치지 않는 가장 가까운 자리 */
export function clampToArena(a: ArenaGeom, x: number, y: number, rad: number): { x: number; y: number } {
  for (const o of a.obstacles ?? []) {
    if (o.kind === 'pillar') {
      let dx = x - o.x;
      let dy = y - o.y;
      let d = Math.hypot(dx, dy);
      const min = o.r + rad;
      if (d < min) {
        if (d < 0.001) [dx, dy, d] = [0, 1, 1];
        x = o.x + (dx / d) * min;
        y = o.y + (dy / d) * min;
      }
    } else {
      const hx = o.w / 2 + rad;
      const hy = o.h / 2 + rad;
      const dx = x - o.x;
      const dy = y - o.y;
      if (Math.abs(dx) < hx && Math.abs(dy) < hy) {
        // 덜 파고든 쪽으로 밀어낸다(벽을 따라 미끄러짐)
        if (hx - Math.abs(dx) < hy - Math.abs(dy)) x = o.x + (dx < 0 ? -hx : hx);
        else y = o.y + (dy < 0 ? -hy : hy);
      }
    }
  }
  const max = a.r - rad;
  if (a.shape === 'square') {
    x = Math.min(a.x + max, Math.max(a.x - max, x));
    y = Math.min(a.y + max, Math.max(a.y - max, y));
  } else {
    const dx = x - a.x;
    const dy = y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      x = a.x + (dx / d) * max;
      y = a.y + (dy / d) * max;
    }
  }
  return { x, y };
}

/** 선분 (x0,y0)→(x1,y1)이 사각형(중심 cx,cy, 반폭 hx,hy) 안을 지나면 들어가는 지점 비율(0~1), 아니면 null */
function segRect(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, hx: number, hy: number): number | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [p, q] of [[-dx, x0 - (cx - hx)], [dx, cx + hx - x0], [-dy, y0 - (cy - hy)], [dy, cy + hy - y0]] as [number, number][]) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return t0;
}

/** 선분이 원(중심 cx,cy, 반지름 R)을 지나면 들어가는 지점 비율, 아니면 null */
function segCircle(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, R: number): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - R * R;
  if (C <= 0) return 0; // 이미 안쪽(밀려나는 중)
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-9) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * 장애물 돌아가기(테스터 피드백 2026-11-25: 드래곤을 쫓던 몬스터가 벽 뒤에서 멈춰 있음).
 * 가려는 길(지금 자리 → 가려는 방향으로 reach만큼)이 가까운 장애물에 막히면 중간 목표로 방향을 바꾼다(속력은 그대로).
 * - 바위·벽: 모서리 4곳 중 "지금 자리 → 모서리 → 원래 목표" 거리가 가장 짧은(지금 자리에서 곧장 갈 수 있는) 모서리.
 * - 기둥: 옆으로 스쳐 지나가는 접점 방향(목표가 왼쪽이면 왼쪽으로).
 * 거의 정면이라 양쪽이 같으면 side(몬스터마다 정해진 쪽)를 따른다. 중간 목표는 자리만으로 정해져 제자리 왕복이 없다.
 */
export function steerAround(a: ArenaGeom, x: number, y: number, vx: number, vy: number, rad: number, side = 1, reach = 600): { vx: number; vy: number } {
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-3 || !a.obstacles?.length) return { vx, vy };
  const ux = vx / speed;
  const uy = vy / speed;
  const len = Math.max(rad * 2, reach);
  const gx = x + ux * len;
  const gy = y + uy * len;
  const near = rad + 160; // 이 거리 안의 장애물만 돌아간다(멀리 있는 건 다가가며 판단)
  let best: { t: number; o: Obstacle } | null = null;
  for (const o of a.obstacles) {
    let t: number | null;
    if (o.kind === 'pillar') {
      if (Math.hypot(x - o.x, y - o.y) - o.r > near) continue;
      t = segCircle(x, y, gx, gy, o.x, o.y, o.r + rad + 2);
    } else {
      if (Math.max(Math.abs(x - o.x) - o.w / 2, Math.abs(y - o.y) - o.h / 2) > near) continue;
      t = segRect(x, y, gx, gy, o.x, o.y, o.w / 2 + rad + 2, o.h / 2 + rad + 2);
    }
    if (t !== null && (!best || t < best.t)) best = { t, o };
  }
  if (!best) return { vx, vy };
  const o = best.o;
  const cross = (px: number, py: number) => ux * (py - y) - uy * (px - x); // 양수 = 목표 방향 기준 왼쪽(화면 기준 시계 반대)
  let wx: number;
  let wy: number;
  if (o.kind === 'rock') {
    const m = rad + 14;
    const hx = o.w / 2 + m;
    const hy = o.h / 2 + m;
    const ih = o.w / 2 + rad + 1;
    const iv = o.h / 2 + rad + 1;
    const clear = (x0: number, y0: number, x1: number, y1: number) => segRect(x0, y0, x1, y1, o.x, o.y, ih, iv) === null;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: o.x + sx * hx, y: o.y + sy * hy }));
    // 모서리에서 목표까지: 곧장 가면 그 거리, 막히면 이웃 모서리를 하나 더 거친 거리(바위 하나는 모서리 2개면 돈다)
    const toGoal = (i: number) => {
      const c = corners[i];
      if (clear(c.x, c.y, gx, gy)) return Math.hypot(gx - c.x, gy - c.y);
      return Math.min(...[corners[(i + 1) % 4], corners[(i + 3) % 4]].map((n) => Math.hypot(n.x - c.x, n.y - c.y) + Math.hypot(gx - n.x, gy - n.y)));
    };
    let pick: { c: number; x: number; y: number } | null = null;
    corners.forEach((c, i) => {
      if (Math.hypot(c.x - x, c.y - y) < 8) return; // 이미 와 있는 모서리
      if (!clear(x, y, c.x, c.y)) return; // 곧장 못 가는 모서리
      if (outsideArena(a, c.x, c.y, -rad)) return; // 바깥 벽에 붙은 바위: 그쪽 모서리로는 못 지나감
      const cost = Math.hypot(c.x - x, c.y - y) + toGoal(i) - Math.sign(cross(c.x, c.y)) * side * 0.5;
      if (!pick || cost < pick.c) pick = { c: cost, x: c.x, y: c.y };
    });
    if (!pick) {
      // 모서리가 다 가려짐(벽에 붙음): 벽을 따라 가까운 끝으로
      const alongY = Math.abs(x - o.x) - o.w / 2 > Math.abs(y - o.y) - o.h / 2;
      pick = alongY ? { c: 0, x, y: o.y + (y >= o.y ? hy : -hy) } : { c: 0, x: o.x + (x >= o.x ? hx : -hx), y };
    }
    wx = pick.x - x;
    wy = pick.y - y;
  } else {
    const R = o.r + rad + 10;
    const dx = o.x - x;
    const dy = o.y - y;
    const d = Math.hypot(dx, dy) || 1;
    let s = Math.sign(cross(o.x, o.y)) || side; // 기둥이 왼쪽이면 오른쪽으로
    if (Math.abs(cross(o.x, o.y)) < 4) s = side;
    const base = Math.atan2(dy, dx);
    const off = d > R ? Math.asin(R / d) : Math.PI / 2;
    const ang = base - s * off;
    wx = Math.cos(ang);
    wy = Math.sin(ang);
  }
  const k = speed / (Math.hypot(wx, wy) || 1);
  return { vx: wx * k, vy: wy * k };
}

/** 점이 장애물 안인가(반지름 rad만큼 넓혀서) */
export function hitsObstacle(a: ArenaGeom, x: number, y: number, rad = 0): boolean {
  return (a.obstacles ?? []).some((o) =>
    o.kind === 'pillar' ? Math.hypot(x - o.x, y - o.y) < o.r + rad : Math.abs(x - o.x) < o.w / 2 + rad && Math.abs(y - o.y) < o.h / 2 + rad,
  );
}

/** 점이 바깥 벽 너머인가(margin만큼 여유) */
export function outsideArena(a: ArenaGeom, x: number, y: number, margin = 0): boolean {
  const dx = x - a.x;
  const dy = y - a.y;
  if (a.shape === 'square') return Math.max(Math.abs(dx), Math.abs(dy)) > a.r + margin;
  return Math.hypot(dx, dy) > a.r + margin;
}

/** 돌진이 벽(바깥 벽 또는 장애물)에 닿았나 */
export function touchingWall(a: ArenaGeom, x: number, y: number, rad: number): boolean {
  return outsideArena(a, x, y, -rad - 4) || hitsObstacle(a, x, y, rad + 4);
}

/** 중심에서 각도 ang 방향으로 벽 안쪽 inset만큼 들어온 점(정사각형은 네 변 위) */
export function edgePointAt(a: ArenaGeom, ang: number, inset: number): { x: number; y: number } {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const t = a.shape === 'square' ? (a.r - inset) / Math.max(Math.abs(c), Math.abs(s)) : a.r - inset;
  return { x: a.x + c * t, y: a.y + s * t };
}

/** 전장 안 무작위 점(벽에서 margin 안쪽, 장애물은 밀어냄) — 돌아다니는 몬스터의 목적지 */
export function randomPointIn(a: ArenaGeom, rnd: () => number, margin: number): { x: number; y: number } {
  const m = a.r - margin;
  let x: number;
  let y: number;
  if (a.shape === 'square') {
    x = a.x + (rnd() * 2 - 1) * m;
    y = a.y + (rnd() * 2 - 1) * m;
  } else {
    const ang = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * m;
    x = a.x + Math.cos(ang) * d;
    y = a.y + Math.sin(ang) * d;
  }
  return clampToArena(a, x, y, margin * 0.5);
}
