import { describe, expect, it } from 'vitest';
import { HARD_STAGES, hardStage } from '../src/data/hardStages';
import { paceOf, stageRule, VERY_HARD_PACE, VERY_HARD_STAGES, veryHardStage } from '../src/data/veryHardStages';
import { DIFFICULTY_RELEASED, DIFFICULTY_REWARD, DIFFICULTY_UNLOCK_AT, STAGE_BOX, stageBoxReward } from '../src/data/economy';
import { recommendedCp, RECOMMENDED_EASY } from '../src/data/power';
import { BOSS_ESCORT, STAGES } from '../src/data/stages';
import { ENEMIES } from '../src/data/enemies';
import { runeGiftId } from '../src/systems/Mailbox';
import {
  defaultProgress, pendingDifficultyUnlock, progressPct, sanitize, selectDifficulty, settleRun, type PlayerProgress,
} from '../src/systems/Progress';

const clear = (p: PlayerProgress, d: 'easy' | 'hard' | 'extreme', stage: number, id: string) =>
  settleRun(p, id, 0, stage + 1, { stageId: stage, cleared: true, elapsedMs: 400_000, normalKills: 50, eliteKills: 2, difficulty: d, dragonId: 'red' }).progress;

describe('매우 어려움 1~20단계 데이터(2026-11-26, 임시)', () => {
  it('20단계, 권장 전투력 배율 ×1.90 → ×2.08(어려움 같은 단계보다 항상 높음), 20단계 5,200 < 성장 최대 레드', () => {
    expect(VERY_HARD_STAGES).toHaveLength(20);
    expect(veryHardStage(1).recommendedPowerMultiplier).toBe(1.9);
    expect(veryHardStage(20).recommendedPowerMultiplier).toBe(2.08);
    expect(recommendedCp(1, 'extreme')).toBe(1710);
    expect(recommendedCp(20, 'extreme')).toBe(5200);
    for (let s = 1; s <= 20; s++) expect(recommendedCp(s, 'extreme')).toBeGreaterThan(recommendedCp(s, 'hard'));
  });
  it('어려움보다 한 단계 위: 같은 단계에서 적 체력·공격력·엘리트·보스 수·전투 길이 모두 같거나 높음', () => {
    for (const v of VERY_HARD_STAGES) {
      const h = hardStage(v.stageId);
      expect(v.enemyHpMultiplier).toBeGreaterThan(h.enemyHpMultiplier);
      expect(v.enemyDamageMultiplier).toBeGreaterThan(h.enemyDamageMultiplier);
      expect(v.eliteSpawnCount[0]).toBeGreaterThanOrEqual(h.eliteSpawnCount[0]);
      expect(v.eliteSpawnCount[1]).toBeGreaterThanOrEqual(h.eliteSpawnCount[1]);
      expect(v.bossSpawnCount).toBeGreaterThanOrEqual(h.bossSpawnCount);
      expect(v.clearReward.rubies).toBeGreaterThan(h.clearReward.rubies);
    }
    expect(VERY_HARD_PACE.waveKills).toBeGreaterThan(1.3);
    expect(paceOf(veryHardStage(3))).toBe(VERY_HARD_PACE);
    expect(paceOf(hardStage(3))?.waveKills).toBe(1.3); // 어려움은 그대로
  });
  it('단계가 오를수록 같거나 어려워짐, 전장은 75% 아래로 줄이지 않음(어려움 20단계 70%에서 봇이 쓰러진 기록)', () => {
    for (let i = 1; i < 20; i++) {
      const [a, b] = [VERY_HARD_STAGES[i - 1], VERY_HARD_STAGES[i]];
      expect(b.enemyHpMultiplier).toBeGreaterThanOrEqual(a.enemyHpMultiplier);
      expect(b.enemyDamageMultiplier).toBeGreaterThanOrEqual(a.enemyDamageMultiplier);
      expect(b.arenaSizeMultiplier).toBeLessThanOrEqual(a.arenaSizeMultiplier);
      expect(b.recommendedPowerMultiplier).toBeGreaterThanOrEqual(a.recommendedPowerMultiplier);
    }
    expect(Math.min(...VERY_HARD_STAGES.map((v) => v.arenaSizeMultiplier))).toBe(0.75);
  });
  it('어려움 기믹을 그대로 이어받고 구간 기믹을 더함, 보스 1마리 단계엔 2마리 전용 기믹 없음', () => {
    for (const v of VERY_HARD_STAGES) {
      const hm = hardStage(v.stageId).specialMechanic;
      const vm = v.specialMechanic;
      for (const k of Object.keys(hm) as (keyof typeof hm)[]) if (k !== 'eliteStaggerMs') expect(vm[k]).toEqual(hm[k]);
      expect(vm.bossPhaseHaste).toBeGreaterThan(0);
      if (v.stageId >= 6) expect(vm.bossAreaMult).toBeGreaterThanOrEqual(1.1);
      if (v.stageId >= 11) expect(vm.eliteEnrage).toBeDefined();
      if (v.stageId >= 16) expect(vm.bossEnrage).toBeDefined();
      if (v.bossSpawnCount === 1) {
        expect(vm.bossKillHaste).toBeUndefined();
        expect(vm.bossRoleSplit).toBeUndefined();
      } else expect(v.bossHpMultiplier).toBe(0.65);
      expect(v.startingSkillChoices).toBe(2);
      expect(ENEMIES[STAGES[v.stageId - 1].bossId]).toBeDefined(); // 새 몬스터 없음
    }
    expect(VERY_HARD_STAGES.filter((v) => v.bossSpawnCount === 2).map((v) => v.stageId)).toEqual([5, 8, 10, 12, 14, 15, 17, 19, 20]);
    expect(veryHardStage(20).specialMechanic.finale).toBe(true);
    expect(HARD_STAGES[0].specialMechanic.bossPhaseHaste).toBe(0.1); // 어려움 표는 바뀌지 않음
  });
  it('단계 규칙: 쉬움 null · 어려움 · 매우 어려움', () => {
    expect(stageRule('easy', 3)).toBeNull();
    expect(stageRule('hard', 3)).toBe(hardStage(3));
    expect(stageRule('extreme', 3)).toBe(veryHardStage(3));
  });
});

describe('매우 어려움 출시·해금·보상·저장', () => {
  it('출시, 해금 = 어려움 서로 다른 10단계(쉬움 → 어려움 규칙과 같음)', () => {
    expect(DIFFICULTY_RELEASED.extreme).toBe(true);
    expect(DIFFICULTY_UNLOCK_AT.extreme).toBe(10);
    let p = defaultProgress();
    for (let s = 1; s <= 10; s++) p = clear(p, 'easy', s, `e${s}`);
    expect(p.difficulty.extreme.unlocked).toEqual([]);
    for (let s = 1; s <= 9; s++) p = clear(p, 'hard', s, `h${s}`);
    expect(p.difficulty.extreme.unlocked).toEqual([]);
    p = clear(p, 'hard', 9, 'h9-again'); // 같은 단계 반복은 세지 않음
    expect(p.difficulty.extreme.unlocked).toEqual([]);
    p = clear(p, 'hard', 10, 'h10');
    expect(p.difficulty.extreme.unlocked).toEqual([1]);
    expect(pendingDifficultyUnlock(p)).toBe('extreme'); // 해금 연출 한 번
  });
  it('예전 저장: 어려움 10개 이상 깬 저장은 불러올 때 매우 어려움 1단계가 열림', () => {
    const base = defaultProgress();
    const raw = JSON.parse(JSON.stringify({ ...base, difficulty: { ...base.difficulty, hard: { ...base.difficulty.hard, unlocked: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cleared: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } } }));
    const p = sanitize(raw);
    expect(p.difficulty.extreme.unlocked).toEqual([1]);
    expect(p.difficulty.hard.cleared).toHaveLength(11);
  });
  it('최초 클리어 루비 150(20단계 +500, 합계 3,500) 한 번만, 진행도 분모 20, 최고 기록·선택 난이도 저장', () => {
    let p = defaultProgress();
    p = { ...p, difficulty: { ...p.difficulty, extreme: { ...p.difficulty.extreme, unlocked: [1, 2] } } };
    const a = settleRun(p, 'x1', 0, 2, { stageId: 1, cleared: true, elapsedMs: 420_000, normalKills: 100, eliteKills: 4, difficulty: 'extreme', dragonId: 'red' });
    expect(a.rewards.find((r) => r.id === 'extreme-first:1')?.rubies).toBe(150);
    expect(a.rewards.some((r) => r.id.startsWith('hard-first'))).toBe(false);
    expect(VERY_HARD_STAGES.reduce((s, v) => s + v.clearReward.rubies, 0)).toBe(3500);
    expect(veryHardStage(20).clearReward).toEqual({ rubies: 650, milestone: true });
    const b = settleRun(a.progress, 'x2', 0, 2, { stageId: 1, cleared: true, elapsedMs: 400_000, normalKills: 100, eliteKills: 4, difficulty: 'extreme', dragonId: 'red' });
    expect(b.rewards.some((r) => r.id === 'extreme-first:1')).toBe(false);
    expect(progressPct(b.progress, 'extreme')).toBe(5);
    expect(b.progress.difficulty.extreme.unlocked).toEqual([1, 2]);
    // 카드: 최초 4장 · 반복 3장(DIFFICULTY_REWARD.extreme, 기존 값)
    expect(a.rewards.find((r) => r.cards)?.cards?.count).toBe(DIFFICULTY_REWARD.extreme.cards.first);
    expect(b.rewards.find((r) => r.cards)?.cards?.count).toBe(DIFFICULTY_REWARD.extreme.cards.repeat);
    // 저장 → 불러오기: 기록·선택 난이도 유지
    const sel = selectDifficulty(b.progress, 'extreme');
    const re = sanitize(JSON.parse(JSON.stringify(sel)));
    expect(re.selectedDifficulty).toBe('extreme');
    expect(re.difficulty.extreme.best?.['1']).toBe(400_000);
    expect(re.difficulty.extreme.cleared).toEqual([1]);
  });
  it('미션·업적: 매우 어려움 클리어도 같은 판 수·처치 수로 셈', () => {
    let p = defaultProgress();
    p = { ...p, difficulty: { ...p.difficulty, extreme: { ...p.difficulty.extreme, unlocked: [1] } } };
    const a = settleRun(p, 'm1', 0, 2, { stageId: 1, cleared: true, elapsedMs: 400_000, normalKills: 120, eliteKills: 4, difficulty: 'extreme', dragonId: 'red' });
    expect(a.progress.lifetime.clears).toBe(1);
    expect(a.progress.lifetime.normalKills).toBe(120);
    expect(a.progress.lifetime.eliteKills).toBe(4);
  });
  it('단계 상자·호위·행동력·골드: 모든 칸이 쉬움 ≤ 어려움 ≤ 매우 어려움', () => {
    for (const s of [1, 5, 10, 20]) for (const t of [1, 2, 3] as const) {
      const [e, h, x] = (['easy', 'hard', 'extreme'] as const).map((d) => stageBoxReward(d, s, t));
      expect(h.gold!).toBeGreaterThanOrEqual(e.gold!);
      expect(x.gold!).toBeGreaterThanOrEqual(h.gold!);
      expect(x.rubies!).toBeGreaterThanOrEqual(h.rubies!);
    }
    expect(STAGE_BOX.extreme.fragments).toBeGreaterThan(STAGE_BOX.hard.fragments);
    expect(BOSS_ESCORT.count.extreme).toBe(3);
    expect(DIFFICULTY_REWARD.extreme.gold).toBeGreaterThan(DIFFICULTY_REWARD.hard.gold);
    expect(DIFFICULTY_REWARD.extreme.stamina).toBeGreaterThan(DIFFICULTY_REWARD.hard.stamina);
  });
  it('매우 어려움 10·20단계 첫 클리어 → 룬 상자 10회권 선물(어려움과 같은 규칙)', () => {
    let p = defaultProgress();
    p = { ...p, difficulty: { ...p.difficulty, extreme: { ...p.difficulty.extreme, unlocked: [10] } } };
    const a = settleRun(p, 'r10', 0, 11, { stageId: 10, cleared: true, elapsedMs: 500_000, normalKills: 100, eliteKills: 4, difficulty: 'extreme', dragonId: 'red' });
    expect(a.progress.mailbox.granted).toContain(runeGiftId('extreme', 10));
  });
});

describe('클라우드 저장 요약', () => {
  it('매우 어려움 진행이 있으면 선택 화면 한 줄에 보임(예전 요약엔 칸이 없어도 됨)', async () => {
    const { summarize, summaryLine } = await import('../src/systems/cloudSync');
    let p = defaultProgress(0);
    p = { ...p, difficulty: { ...p.difficulty, hard: { ...p.difficulty.hard, unlocked: [1, 2, 3] }, extreme: { ...p.difficulty.extreme, unlocked: [1, 2] } } };
    expect(summaryLine(summarize(p, 0))).toContain('어려움 3단계 · 매우 어려움 2단계');
    expect(summaryLine({ gold: 0, rubies: 0, dragons: 1, easyStage: 1, hardStage: 0, updatedAt: 0 })).toBe('쉬움 1단계 · 드래곤 1 · 골드 0 · 루비 0');
  });
});

describe('성장 최대 드래곤으로 깰 수 있는 권장치(2026-11-26 제작자: 끝판 목표 아님)', () => {
  it('연구소 40·영구 Lv.40·5성·룬 10·전설 장비 Lv.10이면 레드도 매우 어려움 20단계 권장 전투력 이상', async () => {
    const { DRAGON_ORDER } = await import('../src/data/dragons');
    const { SPECIAL_IDS } = await import('../src/data/specials');
    const { equipItem } = await import('../src/systems/Progress');
    const { loadout } = await import('../src/systems/Loadout');
    let p = defaultProgress();
    p = { ...p, upgrades: { attack: 40, hp: 40, speed: 40, pickup: 40 } };
    p = { ...p, dragons: Object.fromEntries(DRAGON_ORDER.map((id) => [id, { ...p.dragons[id], unlocked: true, level: 40, stars: 5 }])) as typeof p.dragons };
    p = { ...p, specials: Object.fromEntries(SPECIAL_IDS.map((id) => [id, { fragments: 0, unlocked: true, level: 10 }])) as typeof p.specials };
    p = { ...p, equipment: { ...p.equipment, items: ['sword', 'plate', 'fang', 'ember'].map((itemId, i) => ({ uid: `u${i}`, itemId, rarity: 'legendary', level: 10, locked: false })) } as typeof p.equipment };
    for (let i = 0; i < 4; i++) {
      const e = equipItem(p, `u${i}`);
      if (e.ok) p = e.progress;
    }
    const rec = recommendedCp(20, 'extreme');
    const cps = DRAGON_ORDER.map((id) => loadout(p, id).cp);
    expect(loadout(p, 'red').cp).toBeGreaterThanOrEqual(rec);
    expect(Math.min(...cps)).toBeGreaterThanOrEqual(rec);
  });
});
