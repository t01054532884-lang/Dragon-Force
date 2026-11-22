import { describe, expect, it } from 'vitest';
import { DRAGONS, GROWTH, levelBonus, releasedDragons, starBonus, traitMultFor } from '../src/data/dragons';

// 출시된 드래곤(기존 10종) 기준 — 신규 드래곤은 tests/newdragons.test.ts
const DRAGON_ORDER = releasedDragons();
import { buildRunStats } from '../src/data/progression';
import { BASE_STATS } from '../src/data/stats';
import { RED_BASIC } from '../src/data/basicAttack';
import {
  defaultProgress, levelUpDragon, loadProgress, SAVE_KEY, settleRun, starUpDragon, type PlayerProgress, type Store,
} from '../src/systems/Progress';

const mem = (init: Record<string, string> = {}): Store => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const NOUP = { attack: 0, hp: 0, speed: 0, pickup: 0 };
const withDragon = (p: PlayerProgress, id: keyof PlayerProgress['dragons'], v: Partial<PlayerProgress['dragons']['red']>): PlayerProgress => ({
  ...p,
  dragons: { ...p.dragons, [id]: { ...p.dragons[id], unlocked: true, ...v } },
});

describe('드래곤 데이터', () => {
  it('출시 10종, 기본 공격 모두 Lv.1~7', () => {
    expect(DRAGON_ORDER).toHaveLength(10);
    for (const id of DRAGON_ORDER) expect(DRAGONS[id].basic.levels).toHaveLength(7);
  });
  it('레드 기본 공격은 기존 수치 그대로(기획서 v0.2·BALANCE.md)', () => {
    const red = DRAGONS.red.basic.levels;
    RED_BASIC.levels.forEach((L, i) => {
      expect(red[i]).toMatchObject({ shots: L.shots, coef: L.coef, levelMod: L.levelMod, interval: L.interval });
    });
  });
  it('희귀도: 기본 1 · 일반 3 · 희귀 3 · 영웅 2 · 전설 1', () => {
    const count = (r: string) => DRAGON_ORDER.filter((id) => DRAGONS[id].rarity === r).length;
    expect([count('starter'), count('common'), count('rare'), count('epic'), count('legendary')]).toEqual([1, 3, 3, 2, 1]);
  });
  it('v1.2 종별 기본 능력치(공격력·HP·속도)', () => {
    const t = Object.fromEntries(DRAGON_ORDER.map((id) => [id, [DRAGONS[id].baseAttack, DRAGONS[id].baseHp, DRAGONS[id].baseMoveSpeed]]));
    expect(t).toEqual({
      red: [10, 100, 260], blue: [10, 105, 255], yellow: [10.5, 95, 270], green: [9.8, 110, 255], white: [10.8, 120, 255],
      black: [12, 100, 260], stone: [10.5, 135, 240], wind: [12, 105, 285], water: [11.5, 125, 260], arcane: [14, 120, 275],
    });
  });
});

describe('능력치 합산', () => {
  it('연구소 Lv.0 · 영구 Lv.1 · 1성 레드 = 4·5단계 BASE_STATS', () => {
    expect(buildRunStats(DRAGONS.red, NOUP, { level: 1, stars: 1 }).stats).toEqual(BASE_STATS);
  });
  it('기획서 예: 100 × (1 + 연구소 0.20 + 레벨 0.10 + 승급 0.05) = 135', () => {
    const s = buildRunStats({ ...DRAGONS.red, baseAttack: 100 }, { ...NOUP, attack: 10 }, { level: 11, stars: 2 }).stats;
    expect(s.attack).toBeCloseTo(135);
  });
  it('영구 Lv.30 = +29%·+43.5%, Lv.40 = +39%·+58.5%(Lv.1 초과분)', () => {
    expect(levelBonus(30).attack).toBeCloseTo(0.29);
    expect(levelBonus(30).hp).toBeCloseTo(0.435);
    expect(levelBonus(40).attack).toBeCloseTo(0.39);
    expect(levelBonus(40).hp).toBeCloseTo(0.585);
  });
  it('승급 보너스 누적: 2성 공+5 · 3성 HP+5 · 5성 공+15(총) · 특성 4성 ×1.5 · 5성 ×2', () => {
    expect(starBonus(1)).toEqual({ attack: 0, hp: 0, traitMult: 1 });
    expect(starBonus(3)).toEqual({ attack: 0.05, hp: 0.05, traitMult: 1 });
    expect(starBonus(4).traitMult).toBe(1.5);
    expect(starBonus(5).attack).toBeCloseTo(0.15);
  });
  it('레드 특성: 1~4성 꺼짐, 5성부터 화상 적 +20%(×1)', () => {
    expect([1, 2, 3, 4, 5].map((s) => traitMultFor('red', s))).toEqual([0, 0, 0, 0, 1]);
    expect(DRAGONS.red.trait.value).toBe(0.2);
    expect([1, 3, 4, 5].map((s) => traitMultFor('blue', s))).toEqual([1, 1, 1.5, 2]);
  });
  it('특성이 능력치에: 스톤 받는 피해 0.9 · 윈드 속도 285 +10%(5성이면 +20%)', () => {
    expect(buildRunStats(DRAGONS.stone, NOUP, { level: 1, stars: 1 }).stats.damageTaken).toBeCloseTo(0.9);
    expect(buildRunStats(DRAGONS.wind, NOUP, { level: 1, stars: 1 }).stats.speed).toBeCloseTo(313.5);
    expect(buildRunStats(DRAGONS.wind, NOUP, { level: 1, stars: 5 }).stats.speed).toBeCloseTo(342);
  });
  it('35% 상한에서 빼는 영구 HP = 연구소 + 레벨 + 승급 전부(기준은 종별 기본 HP)', () => {
    const r = buildRunStats(DRAGONS.red, { ...NOUP, hp: 20 }, { level: 30, stars: 3 });
    expect(r.permHpBonus).toBeCloseTo(100 * (0.6 + 0.435 + 0.05));
    expect(buildRunStats(DRAGONS.stone, NOUP, { level: 1, stars: 1 }).permHpBonus).toBe(0);
  });
});

describe('육성(v1.2: 카드 + 골드, Lv.40)', () => {
  it('레벨업: 카드·골드 차감, 부족하면 실패, Lv.40 상한', () => {
    const p = withDragon({ ...defaultProgress(), gold: 1e6 }, 'red', { cards: 5 });
    const r = levelUpDragon(p, 'red');
    expect(r.ok && r.progress.dragons.red).toMatchObject({ level: 2, cards: 4 });
    expect(r.ok && r.progress.gold).toBe(1e6 - GROWTH.levelCost(1));
    expect(levelUpDragon(withDragon(p, 'red', { level: 40 }), 'red')).toMatchObject({ ok: false, reason: 'max' });
    expect(levelUpDragon({ ...p, gold: 0 }, 'red')).toMatchObject({ ok: false, reason: 'gold' });
    expect(levelUpDragon(withDragon(p, 'red', { cards: 0 }), 'red')).toMatchObject({ ok: false, reason: 'cards' });
    expect(levelUpDragon(p, 'arcane')).toMatchObject({ ok: false, reason: 'locked' });
  });
  it('골드: Lv.1→30 누적 12,890G(기존 그대로), Lv.31→40은 같은 곡선 연장', () => {
    let s30 = 0;
    for (let l = 1; l < 30; l++) s30 += GROWTH.levelCost(l);
    expect(s30).toBe(12890);
    expect(GROWTH.levelCost(30)).toBe(Math.ceil(60 * Math.pow(1.12, 29)));
  });
  it('카드: Lv.2~10 1장 · 11~20 2장 · 21~30 3장 · 31~40 4장, 총 99장', () => {
    let sum = 0;
    for (let l = 1; l < 40; l++) sum += GROWTH.cardCost(l);
    expect(sum).toBe(99);
    expect([1, 9, 10, 19, 20, 29, 30, 39].map(GROWTH.cardCost)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('카드·골드가 넉넉하면 Lv.1 → 40까지 정확히 99장 사용', () => {
    let p = withDragon({ ...defaultProgress(), gold: 1e7 }, 'blue', { cards: 120 });
    for (let i = 0; i < 50; i++) {
      const r = levelUpDragon(p, 'blue');
      if (!r.ok) break;
      p = r.progress;
    }
    expect(p.dragons.blue).toMatchObject({ level: 40, cards: 21 });
  });
  it('승급: 조각 20 / 40 / 80 / 160, 5성 상한', () => {
    let p = withDragon(defaultProgress(), 'red', { fragments: 300 });
    const costs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = starUpDragon(p, 'red');
      if (!r.ok) throw new Error('fail');
      costs.push(r.cost!);
      p = r.progress;
    }
    expect(costs).toEqual([20, 40, 80, 160]);
    expect(p.dragons.red).toMatchObject({ stars: 5, fragments: 0 });
    expect(starUpDragon(p, 'red')).toMatchObject({ ok: false, reason: 'max' });
  });
});

describe('저장 이어받기', () => {
  it('v1(5단계) → v3: 골드·연구소·해금 유지 + 레드 + 소환권 11장은 무료 개봉권 11장, 1단계 클리어는 쉬움 진행도 1/20', () => {
    const v1 = { saveVersion: 1, gold: 777, upgrades: { attack: 3, hp: 1, speed: 0, pickup: 2 }, unlockedStages: [1, 2], selectedDragonId: 'red', rewardedRunIds: ['a'] };
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify(v1) }));
    expect(p).toMatchObject({ saveVersion: 4, gold: 777, upgrades: v1.upgrades, unlockedStages: [1, 2], selectedDragonId: 'red' });
    expect(p.summon.legacyTickets).toBe(11);
    expect(p.dragons.red).toMatchObject({ unlocked: true, level: 1, stars: 1, fragments: 0, cards: 0 });
    expect(p.difficulty.easy.cleared).toEqual([1]);
    expect(p.claimed).toEqual(['tutorial', 'first-clear-1']);
  });
  it('v2(6단계) → v3: 보유 드래곤·레벨·별·조각, 소환권 23장, 보장 카운터 그대로', () => {
    const v2 = {
      saveVersion: 2, gold: 50, upgrades: NOUP, unlockedStages: [1, 2], selectedDragonId: 'blue',
      ownedDragons: { red: { dragonId: 'red', level: 12, stars: 2, shards: 5 }, blue: { dragonId: 'blue', level: 3, stars: 1, shards: 30 } },
      summonTickets: 23, pullsSinceLegendary: 40, pullsSinceRareOrHigher: 7, totalPulls: 40,
      claimed: ['tutorial', 'first-clear-1', 'first-run'], lifetime: { runs: 3, normalKills: 900, eliteKills: 2, clears: 1 },
    };
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify(v2) }));
    expect(p.dragons.red).toMatchObject({ unlocked: true, level: 12, stars: 2, fragments: 5 });
    expect(p.dragons.blue).toMatchObject({ unlocked: true, level: 3, fragments: 30 });
    expect(p.dragons.arcane.unlocked).toBe(false);
    expect(p.summon).toEqual({ tenPity: 7, legendaryPity: 40, legacyTickets: 23, totalOpens: 40, runePity: 0, equipTickets: 0, runeTickets: 0 });
    expect(p.selectedDragonId).toBe('blue');
    expect(p.lifetime.normalKills).toBe(900);
  });
  it('보유하지 않은 드래곤을 고른 저장은 레드로, 범위 밖 레벨·별·음수는 보정', () => {
    const bad = { saveVersion: 3, selectedDragonId: 'arcane', rubies: -5, dragons: { red: { level: 99, stars: 0, cards: -3 }, nope: { level: 1 } } };
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify(bad) }));
    expect(p.selectedDragonId).toBe('red');
    expect(p.rubies).toBe(0);
    expect(p.dragons.red).toMatchObject({ level: 40, stars: 1, cards: 0, unlocked: true });
  });
});

describe('클리어 카드(제작자 임시 규칙)', () => {
  const run = { stageId: 1, cleared: true, elapsedMs: 400_000, normalKills: 2500, eliteKills: 2, dragonId: 'red' as const };
  it('최초 클리어 2장 · 반복 1장 · 실패 0장, 골드와 별개', () => {
    const a = settleRun(defaultProgress(), 'r1', 100, 2, run);
    expect(a.progress.dragons.red.cards).toBe(2);
    expect(a.progress.gold).toBe(100);
    const b = settleRun(a.progress, 'r2', 100, 2, run);
    expect(b.progress.dragons.red.cards).toBe(3);
    const c = settleRun(b.progress, 'r3', 50, undefined, { ...run, cleared: false });
    expect(c.progress.dragons.red.cards).toBe(3);
  });
  it('출격 드래곤이 Lv.40이면 카드 대신 100G', () => {
    const p = withDragon(defaultProgress(), 'red', { level: 40 });
    const a = settleRun(p, 'r1', 100, 2, run);
    expect(a.progress.dragons.red.cards).toBe(0);
    expect(a.progress.gold).toBe(200);
  });
  it('업적은 한 번만, 보상은 루비(소환권 반복 지급 없음)', () => {
    const a = settleRun(defaultProgress(), 'r1', 100, 2, run);
    expect(a.rewards.filter((r) => r.rubies).map((r) => r.id).sort()).toEqual(['first-elite', 'first-run', 'kills-1000'].sort());
    expect(a.progress.rubies).toBe(150 + 300 + 300);
    expect(a.progress.summon.legacyTickets).toBe(1);
    const b = settleRun(a.progress, 'r2', 100, 2, run);
    expect(b.rewards.filter((r) => r.rubies)).toEqual([]);
  });
});
