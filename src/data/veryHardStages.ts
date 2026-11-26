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
 * 보스 2마리 단계(어려움 5·10·14·17·19·20 + 8·12). 15단계(광폭화)·18단계(보스 연속 2회 공격)는 2마리로 두면
 * 체력 ×30 봇도 2~3번 쓰러지거나 시간 초과가 나서(자동 측정 2026-11-26) 어려움처럼 1마리.
 */
const TWO_BOSSES = new Set([5, 8, 10, 12, 14, 17, 19, 20]);

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
// 권장 전투력 배율 ×1.90 → ×2.08(어려움 같은 단계보다 항상 높게), 적 체력은 처음 안보다 권장 공격력이 준 만큼 함께 낮춤
// (2026-11-26 제작자: 끝판 목표가 아니라 성장 최대 드래곤이면 깰 수 있게 — 공격력 ×1.3 뒤 레드 최대 약 5,220 > 20단계 5,200)
// 적 공격력: 1~10단계 ×1.50~1.59(+0.01씩), 11단계부터 ×1.62~1.70(처음 안 ×1.85 → ×1.78 → 지금. 12~20단계에서 봇이 1~3번 쓰러져 두 번 낮춤, 2026-11-26)
// 적 체력: 10단계부터 ×1.40 고정(20단계 보스전이 3분 넘게 걸려서 — 대신 공격력·기믹·엘리트 수가 계속 오름)
type Row = [title: string, rec: number, arena: number, hp: number, dmg: number];
const ROWS: Row[] = [
  ['검은 서막', 1.9, 0.9, 1.29, 1.5],
  ['이중 협공', 1.91, 0.9, 1.31, 1.51],
  ['불타는 전장', 1.92, 0.9, 1.31, 1.52],
  ['쌍둥이의 분노', 1.93, 0.88, 1.33, 1.53],
  ['두 왕의 결투', 1.94, 0.88, 1.33, 1.54],
  ['끝없는 추격', 1.95, 0.86, 1.36, 1.55],
  ['완전 포위', 1.96, 0.86, 1.36, 1.56],
  ['재의 들판', 1.97, 0.84, 1.38, 1.57],
  ['붉은 오라', 1.98, 0.84, 1.38, 1.58],
  ['쌍왕 격돌', 1.99, 0.82, 1.4, 1.59],
  ['조여 오는 벽', 1.99, 0.82, 1.4, 1.62],
  ['반격의 반격', 2.0, 0.8, 1.4, 1.62],
  ['생존 한계', 2.01, 0.8, 1.4, 1.63],
  ['폭풍 쌍격', 2.02, 0.78, 1.4, 1.63],
  ['광기의 전장', 2.03, 0.78, 1.4, 1.64],
  ['메아리 지옥', 2.04, 0.76, 1.4, 1.65],
  ['지휘관의 최후', 2.05, 0.76, 1.4, 1.66],
  ['절망의 생존', 2.06, 0.75, 1.4, 1.67],
  ['마지막 관문', 2.07, 0.75, 1.4, 1.68],
  ['용의 종말', 2.08, 0.75, 1.4, 1.69],
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
    // 15단계: 챕터 보스(체력 ×1.8)가 1마리라 보스전이 4~5분·시간 초과까지 나와(봇 측정 2026-11-26) 체력 75%
    ...(id === 15 ? { soloBossHpMultiplier: 0.75 } : {}),
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
