import type { EnemyKind } from './enemies';
import { ENEMIES } from './enemies';
import { SEASON1_STAGE_ROWS } from './season1';

// 스테이지 데이터 (4단계 기획서 16장 구조). 1단계만 먼저 완성하고, 이후 단계는 데이터만 바꿔 늘린다.
export interface StageData {
  id: number;
  name: string;
  faction: 'beast' | 'human';
  durationMs: number; // 8분: 보스가 살아 있으면 시간 초과 실패
  enemyPool: EnemyKind[];
  eliteSpawns: { timeMs: number; eliteId: EnemyKind }[];
  bossSpawnMs: number;
  bossId: EnemyKind;
  milestoneBoss: boolean; // 5·10·15·20단계 최종보스
  /** 7단계: 일반 몬스터 3종 생성 비중. 없으면 1단계 고유 생성(늑대 무리·멧돼지) */
  spawnTable?: { kind: EnemyKind; weight: number; fromMs: number; pack: [number, number] }[];
  seasonId?: string;
  chapterId?: number;
}

export const STAGES: StageData[] = [
  {
    id: 1,
    name: '잿빛 숲',
    faction: 'beast',
    durationMs: 480_000,
    enemyPool: ['shadow_wolf', 'iron_boar'],
    eliteSpawns: [
      { timeMs: 100_000, eliteId: 'moonfang_alpha' }, // 1:40
      { timeMs: 220_000, eliteId: 'ironback_matriarch' }, // 3:40
    ],
    bossSpawnMs: 350_000, // 5:50
    bossId: 'graymane_alpha',
    milestoneBoss: false,
    seasonId: 's1',
    chapterId: 1,
  },
  // 2~20단계(7단계 기획서): 같은 8분 시간표, 공통 AI·패턴 데이터만 바꾼다
  ...SEASON1_STAGE_ROWS.map(([id, name, normals, elites, boss]): StageData => ({
    id,
    name,
    faction: id <= 10 ? 'beast' : 'human',
    durationMs: 480_000,
    enemyPool: normals,
    eliteSpawns: [
      { timeMs: 100_000, eliteId: elites[0] },
      { timeMs: 220_000, eliteId: elites[1] },
    ],
    bossSpawnMs: 350_000,
    bossId: boss,
    milestoneBoss: id % 5 === 0,
    seasonId: 's1',
    chapterId: Math.floor((id - 1) / 4) + 1,
    spawnTable: normals.map((kind, i) => {
      const flyer = ['flyer', 'insect'].includes(ENEMIES[kind]?.art?.shape ?? '') && ENEMIES[kind].behavior === 'chase';
      return { kind, weight: [55, 28, 17][i], fromMs: i === 2 ? 60_000 : 0, pack: flyer ? [2, 3] : [1, 1] };
    }),
  })),
];

// 시간표 공통값
export const TIMELINE = {
  eliteWarnMs: 5_000, // 엘리트 등장 5초 전 경고
  bossWarnMs: 10_000, // 보스 등장 10초 전(5:40) 경고 + 일반 적 감소
  enrageAtMs: 450_000, // 7:30 격노 경고(사용자 결정 2026-11-17: 격노 후 8분 실패)
  enrage: { damage: 1.5, speed: 1.3 }, // 격노 배율(피해는 35% 상한 안에서)
  eliteSpawnRate: 0.7, // 엘리트가 살아 있는 동안 일반 적 생성량
  bossWarnSpawnRate: 0.5, // 보스 경고 중 일반 적 생성량
  maxElites: 2,
};

// 일반 적 기본 생성 곡선(1단계 기준). 시간이 갈수록 더 자주·더 많이.
export function baseSpawn(elapsedMs: number): { interval: number; count: number; boarRatio: number } {
  const min = elapsedMs / 60_000;
  return {
    interval: Math.max(500, 1300 - min * 150),
    count: 1 + Math.floor(min * 0.9),
    boarRatio: min < 1 ? 0 : Math.min(0.35, 0.1 + min * 0.05),
  };
}

// 난이도 증가 공식 (기획서 14장). S = 스테이지 번호.
export function difficulty(S: number) {
  return {
    hp: Math.pow(1.07, S - 1), // 7단계 기획서(제작자 결정 2026-11-18): ×1.12 → ×1.07. 1단계는 ×1 그대로. 피해·생성량 공식은 유지
    damage: Math.pow(1.075, S - 1),
    spawnRate: Math.min(2.0, 1 + 0.055 * (S - 1)),
  };
}

/** 개체별 체력 배율: 엘리트 2는 ×1.15, 일반 보스 ×1.30, 최종보스 ×1.70~2.00 */
export function rankHpMult(stage: StageData, rank: 'normal' | 'elite1' | 'elite2' | 'boss'): number {
  if (rank === 'elite2') return 1.15;
  if (rank !== 'boss') return 1;
  if (!stage.milestoneBoss) return 1.3;
  return stage.id === 5 ? 1.7 : stage.id === 20 ? 2.0 : 1.8;
}

// 전투 중 보상. 골드 정산은 5단계에서 data/progression.ts(GOLD)로 옮겼다.
export const REWARD = {
  eliteHeal: 0.12, // 엘리트 처치 시 최대 HP 12% 회복
};
