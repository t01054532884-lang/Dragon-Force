import { describe, expect, it } from 'vitest';
import { DRAGON_ORDER, DRAGONS, GROWTH, SUMMON, levelBonus, starBonus, type DragonId } from '../src/data/dragons';
import { buildRunStats } from '../src/data/progression';
import { BASE_STATS } from '../src/data/stats';
import { RED_BASIC } from '../src/data/basicAttack';
import {
  defaultProgress, levelUpDragon, loadProgress, pullOnce, SAVE_KEY, settleRun, starUpDragon, summon, type PlayerProgress, type Store,
} from '../src/systems/Progress';

const mem = (init: Record<string, string> = {}): Store => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
// 고정 시드 난수
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const NOUP = { attack: 0, hp: 0, speed: 0, pickup: 0 };

describe('드래곤 데이터', () => {
  it('10종, 기본 공격 모두 Lv.1~7', () => {
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
});

describe('능력치 합산', () => {
  it('연구소 Lv.0 · 영구 Lv.1 · 1성 레드 = 4·5단계 BASE_STATS', () => {
    expect(buildRunStats(DRAGONS.red, NOUP, { level: 1, stars: 1 }).stats).toEqual(BASE_STATS);
  });
  it('기획서 예: 100 × (1 + 연구소 0.20 + 레벨 0.10 + 승급 0.05) = 135', () => {
    // 연구소 공격 Lv.10(+20%), 영구 Lv.11(+10%), 2성(+5%)
    const s = buildRunStats({ ...DRAGONS.red, baseAttack: 100 }, { ...NOUP, attack: 10 }, { level: 11, stars: 2 }).stats;
    expect(s.attack).toBeCloseTo(135);
  });
  it('영구 Lv.30 = 공격력 +29% · HP +43.5%(Lv.1 기준 초과분)', () => {
    expect(levelBonus(30).attack).toBeCloseTo(0.29);
    expect(levelBonus(30).hp).toBeCloseTo(0.435);
  });
  it('승급 보너스 누적: 2성 공+5 · 3성 HP+5 · 5성 공+15(총) · 특성 4성 ×1.5 · 5성 ×2', () => {
    expect(starBonus(1)).toEqual({ attack: 0, hp: 0, traitMult: 1 });
    expect(starBonus(3)).toEqual({ attack: 0.05, hp: 0.05, traitMult: 1 });
    expect(starBonus(4).traitMult).toBe(1.5);
    expect(starBonus(5).attack).toBeCloseTo(0.15);
  });
  it('특성이 능력치에: 스톤 받는 피해 0.9 · 윈드 속도 +10%(5성이면 +20%)', () => {
    expect(buildRunStats(DRAGONS.stone, NOUP, { level: 1, stars: 1 }).stats.damageTaken).toBeCloseTo(0.9);
    expect(buildRunStats(DRAGONS.wind, NOUP, { level: 1, stars: 1 }).stats.speed).toBeCloseTo(286);
    expect(buildRunStats(DRAGONS.wind, NOUP, { level: 1, stars: 5 }).stats.speed).toBeCloseTo(312);
  });
  it('35% 상한에서 빼는 영구 HP = 연구소 + 레벨 + 승급 전부', () => {
    const r = buildRunStats(DRAGONS.red, { ...NOUP, hp: 20 }, { level: 30, stars: 3 });
    expect(r.permHpBonus).toBeCloseTo(100 * (0.6 + 0.435 + 0.05));
  });
});

describe('소환', () => {
  it('등급 확률 70 / 22 / 7 / 1, 등급 안 균등(보장 없이 100만 번)', () => {
    const rnd = seeded(7);
    const N = 1_000_000;
    const byR: Record<string, number> = {};
    const byId: Record<string, number> = {};
    const p0 = defaultProgress();
    for (let i = 0; i < N; i++) {
      const { result } = pullOnce(p0, rnd); // 카운터 0인 상태에서 매번 → 보장 없음
      byR[result.rarity] = (byR[result.rarity] ?? 0) + 1;
      byId[result.dragonId] = (byId[result.dragonId] ?? 0) + 1;
    }
    expect(byR.common / N).toBeCloseTo(0.7, 2);
    expect(byR.rare / N).toBeCloseTo(0.22, 2);
    expect(byR.epic / N).toBeCloseTo(0.07, 2);
    expect(byR.legendary / N).toBeCloseTo(0.01, 2);
    expect(byId.red).toBeUndefined();
    for (const id of ['blue', 'yellow', 'green'] as DragonId[]) expect(Math.abs(byId[id] / N - 0.7 / 3)).toBeLessThan(0.003);
    expect(Math.abs(byId.arcane / N - 0.01)).toBeLessThan(0.0005);
  });
  it('희귀 이상 보장: 9번 연속 일반이면 10번째는 희귀 이상, 나오면 카운터 0', () => {
    const always = () => 0; // 0이면 언제나 일반
    let p: PlayerProgress = defaultProgress();
    for (let i = 0; i < 9; i++) p = pullOnce(p, always).progress;
    expect(p.pullsSinceRareOrHigher).toBe(9);
    const r = pullOnce(p, always);
    expect(r.result.guaranteed).toBe('rare');
    expect(r.result.rarity).not.toBe('common');
    expect(r.progress.pullsSinceRareOrHigher).toBe(0);
  });
  it('전설 보장: 89번 연속 전설이 아니면 90번째는 전설, 두 카운터 모두 0', () => {
    const p = { ...defaultProgress(), pullsSinceLegendary: 89, pullsSinceRareOrHigher: 9 };
    const r = pullOnce(p, () => 0);
    expect(r.result).toMatchObject({ rarity: 'legendary', dragonId: 'arcane', guaranteed: 'legendary' });
    expect(r.progress.pullsSinceLegendary).toBe(0);
    expect(r.progress.pullsSinceRareOrHigher).toBe(0);
  });
  it('긴 시뮬레이션: 전설 사이 간격은 절대 90을 넘지 않고, 일반이 10번 연속 나오지 않음', () => {
    const rnd = seeded(99);
    let p: PlayerProgress = { ...defaultProgress(), summonTickets: 1e9 };
    let sinceL = 0;
    let commonRun = 0;
    let maxGap = 0;
    let maxCommon = 0;
    for (let i = 0; i < 100_000; i++) {
      const r = pullOnce(p, rnd);
      p = r.progress;
      sinceL = r.result.rarity === 'legendary' ? 0 : sinceL + 1;
      commonRun = r.result.rarity === 'common' ? commonRun + 1 : 0;
      maxGap = Math.max(maxGap, sinceL);
      maxCommon = Math.max(maxCommon, commonRun);
    }
    expect(maxGap).toBeLessThanOrEqual(89);
    expect(maxCommon).toBeLessThanOrEqual(9);
  });
  it('중복은 조각: 일반 +10 · 희귀 +20 · 영웅 +40 · 전설 +80', () => {
    const owned = Object.fromEntries(DRAGON_ORDER.map((id) => [id, { dragonId: id, level: 1, stars: 1, shards: 0 }]));
    const p = { ...defaultProgress(), ownedDragons: owned };
    expect(pullOnce(p, () => 0).result).toMatchObject({ isNew: false, shards: 10, rarity: 'common' });
    expect(pullOnce({ ...p, pullsSinceLegendary: 89 }, () => 0).result).toMatchObject({ shards: 80, rarity: 'legendary' });
    expect(GROWTH.duplicateShards).toMatchObject({ common: 10, rare: 20, epic: 40, legendary: 80 });
  });
  it('소환권 부족이면 아무것도 바뀌지 않음, 10회는 10장 차감·결과 10개', () => {
    const p = { ...defaultProgress(), summonTickets: 9 };
    expect(summon(p, 10)).toEqual({ ok: false, reason: 'tickets' });
    const r = summon({ ...p, summonTickets: 10 }, 10, seeded(1));
    expect(r.ok && r.results.length).toBe(10);
    expect(r.ok && r.progress.summonTickets).toBe(0 + (r.ok ? r.rewards.reduce((a, w) => a + w.tickets, 0) : 0));
    expect(r.ok && r.progress.totalPulls).toBe(10);
  });
  it('소환 풀에 레드 없음', () => {
    expect(SUMMON.pool).not.toContain('red');
    expect(SUMMON.pool).toHaveLength(9);
  });
});

describe('육성', () => {
  it('레벨업: 골드 차감, Lv.30 상한', () => {
    const p = { ...defaultProgress(), gold: 1e6 };
    const r = levelUpDragon(p, 'red');
    expect(r.ok && r.progress.ownedDragons.red?.level).toBe(2);
    expect(r.ok && r.progress.gold).toBe(1e6 - GROWTH.levelCost(1));
    const max = { ...p, ownedDragons: { red: { dragonId: 'red' as const, level: 30, stars: 1, shards: 0 } } };
    expect(levelUpDragon(max, 'red')).toMatchObject({ ok: false, reason: 'max' });
    expect(levelUpDragon({ ...p, gold: 0 }, 'red')).toMatchObject({ ok: false, reason: 'gold' });
    expect(levelUpDragon(p, 'arcane')).toMatchObject({ ok: false, reason: 'locked' });
  });
  it('레벨업 누적 비용 Lv.1→30', () => {
    let sum = 0;
    for (let l = 1; l < 30; l++) sum += GROWTH.levelCost(l);
    expect(sum).toBe(12890);
  });
  it('승급: 조각 20 / 40 / 80 / 160, 5성 상한', () => {
    let p: PlayerProgress = { ...defaultProgress(), ownedDragons: { red: { dragonId: 'red', level: 1, stars: 1, shards: 300 } } };
    const costs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = starUpDragon(p, 'red');
      if (!r.ok) throw new Error('fail');
      costs.push(r.cost);
      p = r.progress;
    }
    expect(costs).toEqual([20, 40, 80, 160]);
    expect(p.ownedDragons.red).toMatchObject({ stars: 5, shards: 0 });
    expect(starUpDragon(p, 'red')).toMatchObject({ ok: false, reason: 'max' });
  });
});

describe('저장 v2', () => {
  it('v1(5단계) 저장 → 골드·연구소·해금 유지 + 레드 보유 + 튜토리얼 소환권, 1단계를 깼으면 첫 클리어 소환권', () => {
    const v1 = { saveVersion: 1, gold: 777, upgrades: { attack: 3, hp: 1, speed: 0, pickup: 2 }, unlockedStages: [1, 2], selectedDragonId: 'red', rewardedRunIds: ['a'] };
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify(v1) }));
    expect(p).toMatchObject({ saveVersion: 2, gold: 777, upgrades: v1.upgrades, unlockedStages: [1, 2], selectedDragonId: 'red', summonTickets: 11 });
    expect(p.ownedDragons.red).toEqual({ dragonId: 'red', level: 1, stars: 1, shards: 0 });
    expect(p.claimed).toEqual(['tutorial', 'first-clear-1']);
  });
  it('보유하지 않은 드래곤을 고른 저장은 레드로, 범위 밖 레벨·별은 보정', () => {
    const bad = { saveVersion: 2, selectedDragonId: 'arcane', ownedDragons: { red: { level: 99, stars: 0 }, nope: { level: 1 } } };
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify(bad) }));
    expect(p.selectedDragonId).toBe('red');
    expect(p.ownedDragons.red).toMatchObject({ level: 30, stars: 1 });
    expect(Object.keys(p.ownedDragons)).toEqual(['red']);
  });
  it('첫 클리어 소환권 10장은 한 번만, 업적도 한 번만', () => {
    const run = { stageId: 1, cleared: true, elapsedMs: 400_000, normalKills: 2500, eliteKills: 2 };
    const a = settleRun(defaultProgress(), 'r1', 100, 2, run);
    const ids = a.rewards.map((r) => r.id).sort();
    expect(ids).toEqual(['first-clear-1', 'first-elite', 'first-run', 'kills-1000'].sort());
    expect(a.progress.summonTickets).toBe(1 + 10 + 1 + 2 + 2);
    const b = settleRun(a.progress, 'r2', 100, 2, run);
    expect(b.rewards).toEqual([]);
  });
});
