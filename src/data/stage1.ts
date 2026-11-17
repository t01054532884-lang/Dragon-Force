import type { EnemyKind } from './enemies';

// 스테이지 1 — 불타는 왕국 (8분). 기획서 v0.1 9장 표를 시간대별 웨이브로 옮김.
export const STAGE1 = {
  name: '불타는 왕국',
  durationMs: 8 * 60_000, // 8분: 보스를 이때까지 못 잡으면 격노
  eliteAtMs: 4 * 60_000, // 4분 엘리트
  bossAtMs: 6 * 60_000, // 6분 보스
  clearGold: { min: 300, max: 500 }, // 클리어 보상(빨리 잡을수록 많이)
  waves: [
    // fromMs 이후 적용. interval = 생성 간격(ms), count = 한 번에 나오는 수, mix = 종류별 비율
    { fromMs: 0, interval: 1300, count: 1, mix: { soldier: 0.65, slime: 0.35 } },
    { fromMs: 60_000, interval: 1000, count: 2, mix: { soldier: 0.6, slime: 0.4 } },
    { fromMs: 120_000, interval: 950, count: 2, mix: { soldier: 0.45, slime: 0.2, archer: 0.2, charger: 0.15 } },
    { fromMs: 180_000, interval: 850, count: 3, mix: { soldier: 0.4, slime: 0.2, archer: 0.2, charger: 0.2 } },
    { fromMs: 240_000, interval: 700, count: 4, mix: { soldier: 0.4, slime: 0.25, archer: 0.15, charger: 0.2 } },
    { fromMs: 300_000, interval: 550, count: 5, mix: { soldier: 0.4, slime: 0.3, archer: 0.15, charger: 0.15 } },
    // 보스전: 잡몹은 줄여서 보스 패턴을 볼 수 있게
    { fromMs: 360_000, interval: 1400, count: 2, mix: { soldier: 0.5, slime: 0.5 } },
  ] as { fromMs: number; interval: number; count: number; mix: Partial<Record<EnemyKind, number>> }[],
};
