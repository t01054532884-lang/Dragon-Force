import type { EnemyKind } from './enemies';
import { ENEMIES } from './enemies';
import { SEASON1_STAGE_ROWS } from './season1';

// 스테이지 데이터 (4단계 기획서 16장 구조). 1단계만 먼저 완성하고, 이후 단계는 데이터만 바꿔 늘린다.
export interface StageData {
  id: number;
  name: string;
  faction: 'beast' | 'human';
  durationMs: number; // 제한시간(구간별 7·8.5·10분, 2026-11-20 전투 속도 개선): 보스가 살아 있으면 시간 초과 실패
  enemyPool: EnemyKind[];
  /** timeMs = 웨이브 목표를 못 채워도 엘리트가 나오는 늦은 시각(약한 이용자 보장). 목표를 채우면 더 일찍 나온다 */
  eliteSpawns: { timeMs: number; eliteId: EnemyKind }[];
  /** 보스가 늦어도 나오는 시각(마지막 웨이브를 빨리 끝내면 더 일찍) */
  bossSpawnMs: number;
  /** 웨이브 1·2·3 목표: 그 웨이브 동안 일반 몬스터 처치 수 */
  waveKills: [number, number, number];
  bossId: EnemyKind;
  milestoneBoss: boolean; // 5·10·15·20단계 최종보스
  /** 7단계: 일반 몬스터 3종 생성 비중. 없으면 1단계 고유 생성(늑대 무리·멧돼지) */
  spawnTable?: { kind: EnemyKind; weight: number; fromMs: number; pack: [number, number] }[];
  seasonId?: string;
  chapterId?: number;
}

/**
 * 전투 진행 구간(2026-11-20 전투 속도·성장 체감 개선 요청서 3번).
 * 웨이브 목표(처치 수)를 채우면 다음 단계가 앞당겨지고, 못 채워도 늦은 시각(elite·boss)에는 반드시 진행한다.
 * 목표 플레이시간: 초반 1~3단계 약 5분 · 중반 4~10단계 5~8분 · 후반 11~20단계 7~10분. 측정은 docs/PACE.md.
 * elite = [엘리트 1, 엘리트 2] 늦은 등장 시각. 보스는 마지막 웨이브를 끝내면 조기 등장.
 */
export interface Pace {
  durationMs: number;
  elite: [number, number];
  bossSpawnMs: number;
  waveKills: [number, number, number];
  /** 엘리트·보스 체력 배율: 보스가 5:50보다 일찍(성장 레벨이 낮을 때) 나오므로 그만큼 낮춘다(자동 측정으로 맞춤) */
  eliteHp: number;
  bossHp: number;
}
export function pace(stageId: number): Pace {
  if (stageId <= 3) return { durationMs: 420_000, elite: [75_000, 150_000], bossSpawnMs: 220_000, waveKills: [45, 55, 60], eliteHp: 0.7, bossHp: 0.55 };
  if (stageId <= 10) return { durationMs: 510_000, elite: [90_000, 180_000], bossSpawnMs: 270_000, waveKills: [40, 55, 65], eliteHp: 0.8, bossHp: 0.7 };
  return { durationMs: 600_000, elite: [110_000, 220_000], bossSpawnMs: 330_000, waveKills: [45, 65, 80], eliteHp: 0.9, bossHp: 0.85 };
}

export const STAGES: StageData[] = [
  {
    id: 1,
    name: '잿빛 숲',
    faction: 'beast',
    ...pace(1),
    enemyPool: ['shadow_wolf', 'iron_boar'],
    eliteSpawns: [
      { timeMs: pace(1).elite[0], eliteId: 'moonfang_alpha' },
      { timeMs: pace(1).elite[1], eliteId: 'ironback_matriarch' },
    ],
    bossId: 'graymane_alpha',
    milestoneBoss: false,
    seasonId: 's1',
    chapterId: 1,
    waveKills: pace(1).waveKills,
  },
  // 2~20단계(7단계 기획서): 같은 8분 시간표, 공통 AI·패턴 데이터만 바꾼다
  ...SEASON1_STAGE_ROWS.map(([id, name, normals, elites, boss]): StageData => ({
    id,
    name,
    faction: id <= 10 ? 'beast' : 'human',
    ...pace(id),
    enemyPool: normals,
    eliteSpawns: [
      { timeMs: pace(id).elite[0], eliteId: elites[0] },
      { timeMs: pace(id).elite[1], eliteId: elites[1] },
    ],
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
  bossWarnMs: 8_000, // 보스 등장 8초 전 경고 + 일반 적 감소
  enrageBeforeEndMs: 30_000, // 제한시간 30초 전 격노(격노 후 시간 초과 실패 — 기존 규칙)
  /** 엘리트가 이 시간 안에 안 잡히면 다음 웨이브는 그냥 시작(엘리트는 남아 있다가 보스에게 흡수) */
  eliteMaxMs: 40_000,
  /** 적을 빨리 비우는 이용자: 전장 일반 적이 이 수보다 적으면 생성 간격을 줄여 다음 무리를 바로 보낸다 */
  refillBelow: 10,
  refillRate: 2.2,
  enrage: { damage: 1.5, speed: 1.3 }, // 격노 배율(피해는 35% 상한 안에서)
  eliteSpawnRate: 0.7, // 엘리트가 살아 있는 동안 일반 적 생성량
  bossWarnSpawnRate: 0.5, // 보스 경고 중 일반 적 생성량
  maxElites: 2,
};

/** 일반 몬스터 생성량 배율(2026-11-20: 기존 대비 약 30% 감소 → 생성 간격 ÷ 0.7) */
export const SPAWN_VOLUME = 0.7;

// 일반 적 기본 생성 곡선(1단계 기준). 시간이 갈수록 더 자주·더 많이.
export function baseSpawn(elapsedMs: number): { interval: number; count: number; boarRatio: number } {
  const min = elapsedMs / 60_000;
  return {
    interval: Math.max(500, 1300 - min * 150) / SPAWN_VOLUME,
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
