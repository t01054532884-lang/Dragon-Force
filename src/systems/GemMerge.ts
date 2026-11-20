// 경험치 보석 등급·합치기(2026-11-20 전투 속도·성장 체감 개선 1번). 순수 함수라 테스트로 바로 확인한다.

/** 보석 등급: 소량(파랑) · 중량(보라) · 대량(금빛 + 약한 빛) */
export type GemTier = 'small' | 'medium' | 'large';

export const GEM_TIERS = {
  mediumFrom: 3, // 경험치 3 이상 = 중량
  largeFrom: 10, // 10 이상 = 대량(엘리트 보석, 합쳐진 큰 보석)
};

export function gemTier(value: number): GemTier {
  return value >= GEM_TIERS.largeFrom ? 'large' : value >= GEM_TIERS.mediumFrom ? 'medium' : 'small';
}

/** 화면에 보석이 이 개수보다 많으면 가까운 것끼리 합친다(성능 관리) */
export const GEM_MERGE = { above: 90, radius: 70, everyMs: 500 };

export interface GemPoint {
  x: number;
  y: number;
  value: number;
}

/**
 * 가까운 보석 묶음 찾기: radius 크기 격자 칸마다 한 묶음. 2개 이상인 칸만 돌려준다.
 * 합칠 때는 묶음 첫 보석에 나머지 값을 더하고 나머지를 지운다 → 경험치 총량은 그대로.
 */
export function mergeGroups(points: GemPoint[], radius: number): number[][] {
  const cells = new Map<string, number[]>();
  points.forEach((p, i) => {
    const key = `${Math.floor(p.x / radius)},${Math.floor(p.y / radius)}`;
    const list = cells.get(key);
    if (list) list.push(i);
    else cells.set(key, [i]);
  });
  return [...cells.values()].filter((g) => g.length > 1);
}

/** mergeGroups 결과를 적용한 새 목록(테스트·검증용). 합치기 전후 총량이 같다 */
export function applyMerge(points: GemPoint[], radius: number): GemPoint[] {
  const groups = mergeGroups(points, radius);
  const gone = new Set<number>();
  const out = points.map((p) => ({ ...p }));
  for (const g of groups) {
    const head = out[g[0]];
    for (const i of g.slice(1)) {
      head.value += out[i].value;
      gone.add(i);
    }
  }
  return out.filter((_, i) => !gone.has(i));
}
