/**
 * 전장 모양(테스터 피드백 2026-11-24 "맵이 전부 원형이라 단조롭다 — 정사각형도, 장애물 있는 맵도"):
 * 단계마다 원형/정사각형 + 장애물(돌기둥·바위·벽) 배치를 고른다. 좌표는 전장 반지름(r) 비율이라 어려움의 좁은 전장에도 같은 모양으로 줄어든다.
 * 장애물은 드래곤·몬스터의 이동만 막고, 적 투사체는 장애물에 맞으면 사라진다(엄폐). 드래곤의 공격은 그대로 지나간다.
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
