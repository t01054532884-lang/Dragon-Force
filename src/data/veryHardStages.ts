// 매우 어려움 1~20단계(2026-11-26, 다음 업데이트). 어려움(`hardStages.ts`)과 같은 틀(HardStageDef)을 그대로 쓰고 한 단계 위로 잡는다.
// 몬스터·테마·웨이브는 쉬움 1~20단계 그대로, 새 기믹 코드는 없음 — 어려움에서 이미 만든 기믹을 단계마다 겹쳐 쓴다.
// **수치는 모두 AI 1차안(임시)** — 제작자 확인 전. 표·이유는 docs/VERY_HARD.md.
import { hardStage, HARD_PACE, type HardMechanics, type HardStageDef } from './hardStages';

/** 매우 어려움 전투 길이 보정(어려움 웨이브 ×1.3·보스 ×1.25·엘리트 ×1.15보다 한 단계 위) */
export const VERY_HARD_PACE = { waveKills: 1.4, bossHp: 1.35, eliteHp: 1.2 };
/** 같은 그룹 두 마리 공격 시간차(어려움 1.5초 → 1.2초, 예고가 겹치지 않게 하는 1.6초 간격 규칙은 그대로) */
const STAGGER = 1200;
/** 최초 클리어 루비: 단계마다 150(어려움 100), 20단계 +500(어려움 +300) → 합계 3,500 */
const RUBY = 150;
const MILESTONE: Record<number, number> = { 20: 500 };
/**
 * 보스 2마리 단계(어려움 5·10·14·17·19·20 + 8·12·15). 18단계(보스 연속 2회 공격)는 2마리로 두면
 * 체력 ×30 봇도 3번 쓰러져(자동 측정 2026-11-26) 어려움처럼 1마리.
 */
const TWO_BOSSES = new Set([5, 8, 10, 12, 14, 15, 17, 19, 20]);

/** 구간마다 어려움 같은 단계 기믹 위에 하나씩 더 얹는다(앞 구간 것도 유지) */
function extraMechanics(stage: number): HardMechanics {
  const m: HardMechanics = { eliteStaggerMs: STAGGER, bossPhaseHaste: 0.1 }; // 1~: 보스 50% 이하 공격 간격 −10%
  if (stage >= 6) m.bossAreaMult = 1.1; // 6~: 보스 공격 범위 +10%(예고 시간 그대로)
  if (stage >= 11) m.eliteEnrage = { at: 0.5, haste: 0.1 }; // 11~: 엘리트 50% 이하 공격 주기 −10%
  if (stage >= 16) m.bossEnrage = { at: 0.4, haste: 0.15 }; // 16~: 보스 40% 이하 광폭화
  return m;
}
const EXTRA_TEXT = (stage: number) =>
  stage >= 16 ? '+ 보스 광폭화·엘리트 강화·범위 +10%' : stage >= 11 ? '+ 엘리트 강화·보스 범위 +10%' : stage >= 6 ? '+ 보스 범위 +10%' : '+ 보스 50% 가속';

// [제목, 권장 CP 배율, 전장 반지름, 적 체력, 적 공격력]
// 적 공격력: 1~10단계 +0.02씩, 11단계부터 +0.01씩(처음 안 ×1.85까지는 12~20단계에서 봇이 1~3번 쓰러져 낮춤, 2026-11-26)
type Row = [title: string, rec: number, arena: number, hp: number, dmg: number];
const ROWS: Row[] = [
  ['검은 서막', 2.0, 0.9, 1.35, 1.5],
  ['이중 협공', 2.0, 0.9, 1.37, 1.52],
  ['불타는 전장', 2.05, 0.9, 1.39, 1.54],
  ['쌍둥이의 분노', 2.05, 0.88, 1.41, 1.56],
  ['두 왕의 결투', 2.1, 0.88, 1.43, 1.58],
  ['끝없는 추격', 2.1, 0.86, 1.45, 1.6],
  ['완전 포위', 2.15, 0.86, 1.47, 1.62],
  ['재의 들판', 2.15, 0.84, 1.49, 1.64],
  ['붉은 오라', 2.2, 0.84, 1.51, 1.66],
  ['쌍왕 격돌', 2.2, 0.82, 1.53, 1.68],
  ['조여 오는 벽', 2.25, 0.82, 1.55, 1.69],
  ['반격의 반격', 2.25, 0.8, 1.57, 1.7],
  ['생존 한계', 2.3, 0.8, 1.59, 1.71],
  ['폭풍 쌍격', 2.3, 0.78, 1.61, 1.72],
  ['광기의 전장', 2.35, 0.78, 1.63, 1.73],
  ['메아리 지옥', 2.35, 0.76, 1.65, 1.74],
  ['지휘관의 최후', 2.4, 0.76, 1.66, 1.75],
  ['절망의 생존', 2.4, 0.75, 1.67, 1.76],
  ['마지막 관문', 2.45, 0.75, 1.68, 1.77],
  ['용의 종말', 2.5, 0.75, 1.7, 1.78],
];

export const VERY_HARD_STAGES: HardStageDef[] = ROWS.map(([title, rec, arena, hp, dmg], i) => {
  const id = i + 1;
  const h = hardStage(id);
  const two = TWO_BOSSES.has(id);
  return {
    stageId: id,
    title,
    recommendedPowerMultiplier: rec,
    arenaSizeMultiplier: arena,
    enemyHpMultiplier: hp,
    enemyDamageMultiplier: dmg,
    startingSkillChoices: 2, // 어려움 3장 → 2장
    eliteSpawnCount: [2, 2],
    bossSpawnCount: two ? 2 : 1,
    bossHpMultiplier: two ? 0.65 : 1,
    eliteHpEachMultiplier: h.eliteHpEachMultiplier,
    // 어려움 같은 단계 기믹(그대로) + 구간 기믹. 보스 1마리 단계에선 보스 2마리 전용 기믹(처치 가속·역할 분리)이 의미 없어 뺀다
    specialMechanic: {
      ...extraMechanics(id),
      ...h.specialMechanic,
      eliteStaggerMs: STAGGER,
      ...(two ? { bossKillHaste: h.specialMechanic.bossKillHaste ?? 0.1 } : { bossKillHaste: undefined, bossRoleSplit: undefined, finalEnrage: undefined }),
      ...(id === 20 ? { finale: true } : {}),
    },
    mechanicText: `${h.mechanicText} ${EXTRA_TEXT(id)}`,
    clearReward: { rubies: RUBY + (MILESTONE[id] ?? 0), milestone: !!MILESTONE[id] },
    pace: VERY_HARD_PACE,
    label: '매우 어려움',
  };
});

export const veryHardStage = (stageId: number): HardStageDef => VERY_HARD_STAGES[Math.max(1, Math.min(20, stageId)) - 1];

/** 난이도별 단계 규칙: 쉬움은 null(기존 그대로), 어려움·매우 어려움은 표 한 줄 */
export function stageRule(difficulty: string, stageId: number): HardStageDef | null {
  if (difficulty === 'hard') return hardStage(stageId);
  if (difficulty === 'extreme') return veryHardStage(stageId);
  return null;
}
/** 그 규칙의 전투 길이 보정(어려움 = HARD_PACE) */
export const paceOf = (rule: HardStageDef | null) => (rule ? rule.pace ?? HARD_PACE : null);
