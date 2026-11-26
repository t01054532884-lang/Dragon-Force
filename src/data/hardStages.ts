// 어려움 모드 1~20단계(제작자 기획서 "어려움 모드 1~20단계 신규 개발 기획서 v1.0", 2026-11-21).
// 쉬움(기획서의 "일반 모드") 1~20단계의 몬스터·테마·웨이브 구조를 그대로 쓰고, 아래 데이터로만 차별화한다.
// 숫자는 모두 원문 값. 원문에 없는 것(엘리트 2마리 체력 75%, 시간차 1.5초, 기믹 세부 수치, 보상 루비 수량)은 "AI 1차안" — 실측 후 조정.

export interface HardMechanics {
  /** 1: 보스 HP 50% 이하에서 패턴 간격 −x */
  bossPhaseHaste?: number;
  /** 2·4·7: 같은 슬롯 엘리트 여러 마리의 첫 공격 시간차(ms) */
  eliteStaggerMs?: number;
  /** 3: 보스 공격 범위 배율(예고 시간은 그대로) */
  bossAreaMult?: number;
  /** 4: 같은 슬롯 엘리트 한 마리가 죽으면 남은 엘리트 이동속도 +x */
  eliteDeathHaste?: number;
  /** 6: 엘리트 추격(이동)속도 +x */
  eliteChase?: number;
  /** 8: 보스 원형 공격 뒤 잠시 남는 위험 지대 */
  lingeringZones?: boolean;
  /** 9: 엘리트 HP 비율 이하에서 공격 주기 −haste + 붉은 오라 */
  eliteEnrage?: { at: number; haste: number };
  /** 10·19: 보스 한 마리를 잡으면 남은 보스 공격속도 +x */
  bossKillHaste?: number;
  /** 11: 보스 투사체 패턴이 부채꼴로 +n발 */
  fanShots?: number;
  /** 12: 엘리트가 번갈아(동시에 아님) 주기적 범위 공격(ms) */
  eliteAoeEveryMs?: number;
  /** 13: 보스 HP 비율에서 범위 공격(단계적으로 넓어짐, 안전지대 유지) */
  bossThresholdAoe?: number[];
  /** 14·19·20: 보스 두 마리 역할 분리(근거리 패턴 / 원거리 패턴) */
  bossRoleSplit?: boolean;
  /** 15·20: 보스 HP 비율 이하 광폭화(공격속도만 +haste, 공격력 그대로) */
  bossEnrage?: { at: number; haste: number };
  /** 20: 한 마리를 잡으면 남은 보스 최종 광폭화(공격속도 +x, 예고 시간은 그대로) */
  finalEnrage?: number;
  /** 16: 엘리트 일부 공격이 짧은 지연 뒤 2차 공격 */
  eliteEcho?: boolean;
  /** 18: 보스 일부 공격이 연속 2회 */
  bossEcho?: boolean;
  /** 20: 전용 클리어 연출 */
  finale?: boolean;
}

export interface HardStageDef {
  stageId: number;
  title: string;
  recommendedPowerMultiplier: number;
  arenaSizeMultiplier: number;
  enemyHpMultiplier: number;
  enemyDamageMultiplier: number;
  startingSkillChoices: number;
  /** [엘리트 1 수, 엘리트 2 수] */
  eliteSpawnCount: [number, number];
  bossSpawnCount: 1 | 2;
  /** 보스가 2마리일 때 한 마리 체력 배율(단독 어려움 보스 = 1) */
  bossHpMultiplier: number;
  /** 엘리트가 2마리일 때 한 마리 체력 배율(AI 1차안 0.75 — 원문 "70~80% 우선 검토") */
  eliteHpEachMultiplier: number;
  specialMechanic: HardMechanics;
  /** 로비·결과 화면에 보일 기믹 한 줄 */
  mechanicText: string;
  /** 최초 클리어 보상(기본 클리어 보상과 따로) — 수량은 AI 1차안, 경제 확인 후 확정 */
  clearReward: { rubies: number; milestone?: boolean };
  /** 전투 길이 보정(없으면 HARD_PACE) — 매우 어려움은 VERY_HARD_PACE(2026-11-26) */
  pace?: { waveKills: number; bossHp: number; eliteHp: number };
  /** 보스가 1마리일 때 체력 배율(없으면 1) — 매우 어려움 15단계(챕터 보스 ×1.8)용(2026-11-26) */
  soloBossHpMultiplier?: number;
  /** 화면 난이도 이름(없으면 '어려움') */
  label?: string;
}

const ELITE_EACH = 0.75;
/**
 * 어려움 최초 클리어 루비(종합 개선 기획서 v1.1, 2026-11-21): 단계마다 100(확정),
 * 20단계는 장식 시스템 전까지 장식 대신 추가 300(제안) → 20단계 합계 2,300
 */
const RUBY = 100;
const MILESTONE: Record<number, number> = { 20: 300 };

type Row = [title: string, rec: number, arena: number, hp: number, dmg: number, elites: [number, number], bosses: 1 | 2, bossHp: number, mech: HardMechanics, text: string];
const ROWS: Row[] = [
  ['첫 번째 시련', 1.5, 0.95, 1.1, 1.15, [1, 1], 1, 1, { bossPhaseHaste: 0.1 }, '보스 HP 50% 이하 공격 간격 −10%'],
  ['협공의 시작', 1.5, 0.95, 1.1, 1.15, [1, 2], 1, 1, { eliteStaggerMs: 1500 }, '두 번째 엘리트 2마리(다른 위치·시간차)'],
  ['위험한 전장', 1.55, 0.95, 1.12, 1.17, [1, 1], 1, 1, { bossAreaMult: 1.1 }, '보스 공격 범위 +10%(예고 시간 그대로)'],
  ['쌍둥이 엘리트', 1.55, 0.9, 1.12, 1.17, [2, 2], 1, 1, { eliteStaggerMs: 1500, eliteDeathHaste: 0.1 }, '엘리트 2마리씩 · 한 마리 처치 시 남은 엘리트 +10% 속도'],
  ['두 보스의 등장', 1.6, 0.9, 1.15, 1.2, [1, 1], 2, 0.65, {}, '보스 2마리(양쪽 등장, 공격 번갈아) · 각 체력 65%'],
  ['추격전', 1.6, 0.9, 1.15, 1.2, [2, 1], 1, 1, { eliteChase: 0.1, eliteStaggerMs: 1500 }, '엘리트 추격속도 +10%'],
  ['포위 공격', 1.65, 0.85, 1.17, 1.23, [2, 2], 1, 1, { eliteStaggerMs: 1500 }, '엘리트 2마리 좌우 협공(공격 간격 분리)'],
  ['위험 지대', 1.65, 0.85, 1.17, 1.23, [1, 1], 1, 1, { lingeringZones: true }, '보스 공격 뒤 잠시 남는 위험 지대'],
  ['강화 엘리트', 1.7, 0.85, 1.2, 1.25, [2, 2], 1, 1, { eliteEnrage: { at: 0.5, haste: 0.1 }, eliteStaggerMs: 1500 }, '엘리트 HP 50% 이하 공격 주기 −10%(붉은 오라)'],
  ['이중 보스 격돌', 1.7, 0.8, 1.2, 1.25, [2, 2], 2, 0.65, { bossKillHaste: 0.1, eliteStaggerMs: 1500 }, '보스 2마리 · 한 마리 처치 시 남은 보스 공격속도 +10%'],
  ['좁아진 전장', 1.75, 0.8, 1.22, 1.28, [2, 2], 1, 1, { fanShots: 2, eliteStaggerMs: 1500 }, '보스 원거리 공격이 부채꼴로(+2발)'],
  ['엘리트의 반격', 1.75, 0.8, 1.22, 1.28, [2, 2], 1, 1, { eliteAoeEveryMs: 7000, eliteStaggerMs: 1500 }, '엘리트가 번갈아 주기적 범위 공격'],
  ['생존의 시험', 1.8, 0.75, 1.25, 1.3, [2, 2], 1, 1, { bossThresholdAoe: [0.7, 0.35], eliteStaggerMs: 1500 }, '보스 HP 70%·35%에서 범위 공격(안전지대 있음)'],
  ['폭풍 협공', 1.8, 0.75, 1.25, 1.3, [2, 2], 2, 0.6, { bossRoleSplit: true, eliteStaggerMs: 1500 }, '보스 2마리: 근거리 담당 · 원거리 담당 · 각 60%'],
  ['광폭화 전투', 1.85, 0.75, 1.27, 1.33, [2, 2], 1, 1, { bossEnrage: { at: 0.4, haste: 0.15 }, eliteStaggerMs: 1500 }, '보스 HP 40% 이하 광폭화(공격속도 +15%)'],
  ['압박의 시작', 1.85, 0.72, 1.27, 1.33, [2, 2], 1, 1, { eliteEcho: true, eliteStaggerMs: 1500 }, '엘리트 공격 뒤 짧은 지연 2차 공격'],
  ['지휘관의 협공', 1.9, 0.72, 1.28, 1.37, [2, 2], 2, 0.6, { eliteStaggerMs: 1500 }, '보스 2마리 패턴 번갈아 · 각 60%'],
  ['최후의 생존', 1.9, 0.72, 1.28, 1.37, [2, 2], 1, 1, { bossEcho: true, eliteStaggerMs: 1500 }, '보스 일부 공격 연속 2회'],
  ['최종 관문', 1.95, 0.7, 1.3, 1.4, [2, 2], 2, 0.6, { bossRoleSplit: true, bossKillHaste: 0.15, eliteStaggerMs: 1500 }, '보스 2마리 서로 다른 패턴 · 한 마리 처치 시 +15%'],
  ['드래곤의 최종 시련', 2.0, 0.7, 1.3, 1.45, [2, 2], 2, 0.65, { bossRoleSplit: true, finalEnrage: 0.15, finale: true, eliteStaggerMs: 1500 }, '보스 2마리 · 50% 강화 · 한 마리 처치 시 최종 광폭화'],
];

export const HARD_STAGES: HardStageDef[] = ROWS.map(([title, rec, arena, hp, dmg, elites, bosses, bossHp, mech, text], i) => ({
  stageId: i + 1,
  title,
  recommendedPowerMultiplier: rec,
  arenaSizeMultiplier: arena,
  enemyHpMultiplier: hp,
  enemyDamageMultiplier: dmg,
  startingSkillChoices: 3,
  eliteSpawnCount: elites,
  bossSpawnCount: bosses,
  bossHpMultiplier: bossHp,
  eliteHpEachMultiplier: ELITE_EACH,
  specialMechanic: mech,
  mechanicText: text,
  clearReward: { rubies: RUBY + (MILESTONE[i + 1] ?? 0), milestone: !!MILESTONE[i + 1] },
}));

export const hardStage = (stageId: number): HardStageDef => HARD_STAGES[Math.max(1, Math.min(20, stageId)) - 1];

/**
 * 어려움 전투 길이 보정(AI 1차안, 자동 측정 2026-11-21): 시작 스킬 3장 덕분에 쉬움 진행표 그대로면 목표(4~10분)보다 1~3분 빨랐다.
 * 웨이브 처치 목표 ×1.3, "단독 어려움 보스" 체력 = 쉬움 보스 × 적 체력 배율 × 1.25, 엘리트 × 1.15. 늦은 등장 시각·제한시간은 쉬움과 같다.
 */
export const HARD_PACE = { waveKills: 1.3, bossHp: 1.25, eliteHp: 1.15 };

/** 어려움 반복 클리어 골드 배율(원문 "일반 대비 약 1.5배") — 최초 클리어 보상은 따로 */
export const HARD_GOLD_MULT = 1.5; // = DIFFICULTY_REWARD.hard.gold(economy.ts)
/** 같은 그룹(엘리트끼리·보스끼리) 두 마리가 연달아 공격을 시작하는 최소 간격(ms) — 예고가 겹쳐 안전지대가 사라지지 않게(AI 1차안) */
export const HARD_ATTACK_GAP_MS = 1600;
