import { describe, expect, it } from 'vitest';
import { DRAGON_ORDER, DRAGONS } from '../src/data/dragons';
import { applyPerm, permState, PERM_TIERS, ZERO_PERM } from '../src/data/permGrowth';
import { BOXES, DRAGON_BOX, GOLD_OFFERS, EQUIPMENT_BOX, STAGE_BOX, stageBoxReward } from '../src/data/economy';
import { RUNE_BOX, RUNE_RULES, runeEffects, runeUpgradeCost } from '../src/data/runes';
import { equipValue, EQUIP_RULES } from '../src/data/equipment';
import { combatPower, recommendedCp, cpVerdict } from '../src/data/power';
import { aoePerTarget, signatureCap, SIGNATURE_RULES, SIGNATURES } from '../src/data/signature';
import { SPECIALS } from '../src/data/specials';
import { loadout } from '../src/systems/Loadout';
import {
  claimMission, claimAllStageBoxes, claimStageBox, claimableStageBoxes, sanitize, convertToUniversal, defaultProgress, exchangeEssence, fuseItem, openBox, openDragonBoxOnce,
  addMissionProgress, periodKey, progressPct, settleRun, starUpDragon, toggleLock, upgradeItem, withTx, equipItem, unlockSpecial, upgradeRune, buyGold, sanitize,
  type EquipmentItem, type PlayerProgress,
} from '../src/systems/Progress';

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const own = (p: PlayerProgress, id: keyof PlayerProgress['dragons'], v: Partial<PlayerProgress['dragons']['red']> = {}): PlayerProgress => ({
  ...p,
  dragons: { ...p.dragons, [id]: { ...p.dragons[id], unlocked: true, ...v } },
});

describe('6-1 영구 성장 5레벨 고유 효과', () => {
  it('10종 모두 Lv.5~40 8단계', () => {
    for (const id of DRAGON_ORDER) expect(PERM_TIERS[id]).toHaveLength(8);
  });
  it('영구 Lv.1~4는 효과 없음 → 레드 Lv.1~7 기본 공격 데이터가 그대로(기존 DPS 보존)', () => {
    for (const lv of [1, 4]) {
      const P = permState('red', lv);
      DRAGONS.red.basic.levels.forEach((L) => {
        const out = applyPerm(L, P);
        expect(out).toMatchObject({ shots: L.shots, coef: L.coef, levelMod: L.levelMod, interval: L.interval, pierce: 0, chain: 0, bounce: 0 });
        expect(out.blast).toBeUndefined();
      });
    }
    expect(applyPerm(DRAGONS.red.basic.levels[0], ZERO_PERM)).toBe(DRAGONS.red.basic.levels[0]);
  });
  it('레드: Lv.10 화염탄 +1, Lv.20 튕김, Lv.30 +1, Lv.35 튕김 2, Lv.40 화염 폭발', () => {
    const L5 = DRAGONS.red.basic.levels[4]; // 전투 Lv.5: 3발
    expect(applyPerm(L5, permState('red', 10)).shots).toBe(4);
    expect(applyPerm(L5, permState('red', 30)).shots).toBe(5);
    expect(applyPerm(L5, permState('red', 35)).bounce).toBe(2);
    expect(applyPerm(L5, permState('red', 40)).blast).toMatchObject({ every: 4 });
  });
  it('탄환 상한 5발: 넘친 탄은 피해 배율로 전환(1발 = 50%)', () => {
    const wind6 = DRAGONS.wind.basic.levels[5]; // 칼날 4개
    const out = applyPerm(wind6, permState('wind', 30)); // +2 → 6 → 5발 + 1발 초과
    expect(out.shots).toBe(5);
    expect(out.levelMod).toBeCloseTo(wind6.levelMod * (5 + 0.5) / 5);
  });
  it('레드 Lv.5 화염 피해 +10%', () => {
    const L1 = DRAGONS.red.basic.levels[0];
    expect(applyPerm(L1, permState('red', 5)).levelMod).toBeCloseTo(1.1);
  });
});

describe('6-2 전용 액티브 데이터', () => {
  it('10종, 60초 유지, v1.3 종류별 규칙(광역·단일·지속·회복·방어·이동)', () => {
    // 전설 신규 3종(크로노·보이드·오로라)은 60초 스킬 대신 기본 공격 횟수형(kind 'counter') — tests/newdragons.test.ts
    for (const id of DRAGON_ORDER) if (SIGNATURES[id].kind !== 'counter') expect(SIGNATURES[id].cooldownMs).toBe(60_000);
    expect(SIGNATURES.red.kind).toBe('aoe');
    expect(SIGNATURES.arcane.kind).toBe('single');
    expect(SIGNATURES.green.kind).toBe('dot');
    expect(SIGNATURES.white.kind).toBe('heal');
    expect(SIGNATURES.stone.kind).toBe('guard');
    expect(SIGNATURES.wind.kind).toBe('move');
    // 2026-11-20 강화: 회복 30% · 방어 −40% 6초 · 이동 +40% 6초
    expect([SIGNATURE_RULES.heal, SIGNATURE_RULES.guardReduce, SIGNATURE_RULES.guardMs, SIGNATURE_RULES.moveBoost, SIGNATURE_RULES.moveMs]).toEqual([0.3, 0.4, 6000, 0.4, 6000]);
  });
  it('광역: 대상당 DPS×4초, 총합 최대 DPS×24초(7마리부터 나눔)', () => {
    expect(aoePerTarget(10, 1)).toBe(40);
    expect(aoePerTarget(10, 6)).toBe(40);
    expect(aoePerTarget(10, 12)).toBe(20);
    expect(aoePerTarget(10, 12) * 12).toBe(240);
  });
  it('2026-11-20: 광역 반경 +25% 이상, 보스 한 번 사용 상한 8%·엘리트 25%·일반 없음', () => {
    expect(SIGNATURES.red.radius! / 50).toBeCloseTo(5); // 4m → 5m
    expect(SIGNATURES.blue.radius! / 50).toBeCloseTo(5.6); // 4.5m → 5.6m
    expect(SIGNATURES.yellow.radius! / 50).toBeCloseTo(6.2); // 5m → 6.2m
    expect(signatureCap('boss', 10_000)).toBe(800);
    expect(signatureCap('elite', 1000)).toBe(250);
    expect(signatureCap('normal', 10)).toBe(Infinity);
  });
});

describe('6-3 정수·조각·카드', () => {
  it('미보유: 조각 40/60/100/160 → 정수 해금, 보유 드래곤은 교환 불가', () => {
    let p = { ...defaultProgress() };
    p = { ...p, dragons: { ...p.dragons, black: { ...p.dragons.black, fragments: 60 } } };
    const r = exchangeEssence(p, 'black');
    expect(r.ok && r.progress.dragons.black).toMatchObject({ unlocked: true, fragments: 0 });
    if (r.ok) expect(exchangeEssence({ ...r.progress, dragons: { ...r.progress.dragons, black: { ...r.progress.dragons.black, fragments: 999 } } }, 'black')).toMatchObject({ ok: false, reason: 'owned' });
    expect(exchangeEssence({ ...p, dragons: { ...p.dragons, arcane: { ...p.dragons.arcane, fragments: 159 } } }, 'arcane')).toMatchObject({ ok: false });
  });
  it('중복 정수 → 조각 20/30/50/80', () => {
    // 전설 보장 직전 상태에서 아케인 보유 → 전설 정수는 조각 80
    const p = own({ ...defaultProgress(), summon: { tenPity: 0, legendaryPity: 89, legacyTickets: 0, totalOpens: 0 } }, 'arcane');
    const r = openDragonBoxOnce(p, seeded(1));
    expect(r.result).toMatchObject({ kind: 'essence', dragonId: 'arcane', isNew: false, fragments: 80, guaranteed: 'legendary' });
    expect(r.progress.dragons.arcane.fragments).toBe(80);
  });
  it('5성 이후 초과 조각 → 범용(일반 5:1·전설 1:1), 나머지 보관, 5성 전에는 불가', () => {
    const p = own(defaultProgress(), 'blue', { stars: 5, fragments: 23 });
    const r = convertToUniversal(p, 'blue');
    expect(r.ok && r.progress.universalFragments).toBe(4);
    expect(r.ok && r.progress.dragons.blue.fragments).toBe(3);
    expect(convertToUniversal(own(defaultProgress(), 'blue', { stars: 4, fragments: 50 }), 'blue')).toMatchObject({ ok: false });
  });
  it('범용 조각으로 승급 부족분 채우기, 전설은 필요량의 25%까지', () => {
    const p = { ...own(defaultProgress(), 'arcane', { stars: 4, fragments: 100 }), universalFragments: 100 };
    expect(starUpDragon(p, 'arcane', true)).toMatchObject({ ok: false }); // 160 필요, 범용은 40까지 → 140
    const q = { ...own(defaultProgress(), 'arcane', { stars: 4, fragments: 120 }), universalFragments: 100 };
    const r = starUpDragon(q, 'arcane', true);
    expect(r.ok && r.progress).toMatchObject({ universalFragments: 60 });
    expect(r.ok && r.progress.dragons.arcane).toMatchObject({ stars: 5, fragments: 0 });
  });
});

describe('6-4 난이도·진행도', () => {
  const clear = (p: PlayerProgress, stage: number, id: string) =>
    settleRun(p, id, 0, stage + 1, { stageId: stage, cleared: true, elapsedMs: 480_000, normalKills: 0, eliteKills: 0, difficulty: 'easy', dragonId: 'red' }).progress;
  it('같은 단계를 반복해도 진행도는 한 번만(고유 단계 ÷ 20)', () => {
    let p = clear(defaultProgress(), 1, 'a');
    p = clear(p, 1, 'b');
    expect(p.difficulty.easy.cleared).toEqual([1]);
    expect(progressPct(p, 'easy')).toBe(5);
  });
  it('단계 상자(2026-11-23): 단계를 깨야 받고, 단계마다 한 번만, 5단계마다 조각', () => {
    let p = defaultProgress();
    expect(claimStageBox(p, 'easy', 1)).toMatchObject({ ok: false, reason: 'locked' });
    p = clear(p, 1, 's1');
    expect(claimableStageBoxes(p, 'easy')).toEqual([1]);
    const g0 = p.gold;
    const a = claimStageBox(p, 'easy', 1);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.progress.gold - g0).toBe(50);
    expect(a.reward).toEqual({ gold: 50, rubies: 15 });
    expect(claimStageBox(a.progress, 'easy', 1)).toMatchObject({ ok: false, reason: 'claimed' });
    expect(stageBoxReward('easy', 5).fragments).toEqual({ dragonId: 'red', count: 5 });
    // 같은 단계 반복 클리어는 상자 추가 없음
    expect(claimableStageBoxes(clear(a.progress, 1, 's1b'), 'easy')).toEqual([]);
  });
  it('단계 상자 모두 받기: 20개 합계 = 루비 300 · 골드 1,000 · 레드 조각 20(쉬움), 어려움은 2배', () => {
    let p = defaultProgress();
    for (let s = 1; s <= 20; s++) p = clear(p, s, `s${s}`);
    const before = { r: p.rubies, g: p.gold, f: p.dragons.red.fragments };
    const r = claimAllStageBoxes(p, 'easy');
    expect(r.ok && r.count).toBe(20);
    if (!r.ok) return;
    expect(r.reward).toEqual({ gold: 1000, rubies: 300, fragments: { dragonId: 'red', count: 20 } });
    expect([r.progress.rubies - before.r, r.progress.gold - before.g]).toEqual([300, 1000]);
    expect(claimableStageBoxes(r.progress, 'easy')).toEqual([]);
    expect(STAGE_BOX.hard).toEqual({ gold: 100, rubies: 30, fragments: 10 });
  });
  it('예전 진행도 상자 기록(25·50·100)은 단계 상자로 잘못 읽지 않음', () => {
    const raw = JSON.parse(JSON.stringify(defaultProgress()));
    raw.difficulty.easy = { unlocked: [1, 2], cleared: [1], claimed: [25, 50, 100] };
    const p = sanitize(raw);
    expect(p.difficulty.easy.claimed).toEqual([]);
    expect(claimableStageBoxes(p, 'easy')).toEqual([1]);
  });
  it('쉬움 20개를 모두 깨야 어려움 해금', () => {
    let p = defaultProgress();
    expect(p.difficulty.hard.unlocked).toEqual([]);
    for (let s = 1; s <= 20; s++) p = clear(p, s, `s${s}`);
    expect(p.difficulty.hard.unlocked).toEqual([1]);
  });
});

describe('6-5 루비 상자·천장', () => {
  it('가격: 드래곤 250/2,200(v1.1, 12% 할인) · 장비 100/900 · 룬 100/900(v1.2, 10% 할인)', () => {
    expect([BOXES.dragon.price1, BOXES.dragon.price10]).toEqual([250, 2200]);
    for (const b of [BOXES.equipment, BOXES.rune]) expect(b.price10).toBe(b.price1 * 9);
    expect([BOXES.dragon.price1, BOXES.equipment.price1, BOXES.rune.price1]).toEqual([250, 100, 100]);
  });
  it('확률 합 100%: 1차 추첨·정수 희귀도·장비·룬', () => {
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(DRAGON_BOX.kind)).toBe(100);
    expect(sum(DRAGON_BOX.essenceRarity)).toBe(100);
    expect(sum(EQUIPMENT_BOX.rarity)).toBe(100);
    expect(RUNE_BOX.bundles.reduce((a, [, w]) => a + w, 0)).toBe(100);
    expect(DRAGON_BOX.kind).toEqual({ card: 50, fragment: 35, essence: 15 }); // v1.2: 룬 조각 분리
  });
  it('루비 부족이면 아무것도 안 바뀜, 10회는 10회 가격 차감·결과 10개', () => {
    expect(openBox({ ...defaultProgress(), rubies: BOXES.dragon.price1 - 1 }, 'dragon', 1)).toMatchObject({ ok: false, reason: 'rubies' });
    const r = openBox({ ...defaultProgress(), rubies: 2000 + BOXES.dragon.price10 }, 'dragon', 10, 'ruby', seeded(3));
    // 10회 가격 차감(드래곤 3종 보유 업적 루비가 같이 들어올 수 있음)
    expect(r.ok && r.progress.rubies).toBe(2000 + (r.ok ? r.rewards.reduce((a, x) => a + (x.rubies ?? 0), 0) : 0));
    expect(r.ok && r.results).toHaveLength(10);
  });
  it('기존 소환권 = 드래곤·스킬 상자 무료 개봉권(다른 상자에는 못 씀)', () => {
    const p = { ...defaultProgress(), summon: { ...defaultProgress().summon, legacyTickets: 23 } };
    const r = openBox(p, 'dragon', 10, 'ticket', seeded(4));
    expect(r.ok && r.progress.summon.legacyTickets).toBe(13);
    expect(openBox(p, 'rune', 1, 'ticket')).toMatchObject({ ok: false });
  });
  it('10만 회: 1차 추첨 50/35/15 수렴(룬 조각 없음), 레드 정수·조각 없음, 전설 정수 간격 ≤ 90, 희귀 이상 정수 간격 ≤ 10', () => {
    let p = defaultProgress();
    const rnd = seeded(7);
    const kinds: Record<string, number> = {};
    let sinceLeg = 0;
    let sinceRare = 0;
    let maxLeg = 0;
    let maxRare = 0;
    let legEss = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const r = openDragonBoxOnce(p, rnd);
      p = r.progress;
      const res = r.result;
      kinds[res.kind] = (kinds[res.kind] ?? 0) + 1;
      if ((res.kind === 'essence' || res.kind === 'fragment') && res.dragonId === 'red') throw new Error('레드');
      sinceLeg++;
      sinceRare++;
      if (res.kind === 'essence' && res.rarity === 'legendary') {
        legEss++;
        maxLeg = Math.max(maxLeg, sinceLeg);
        sinceLeg = 0;
      }
      if (res.kind === 'essence' && res.rarity !== 'common') {
        maxRare = Math.max(maxRare, sinceRare);
        sinceRare = 0;
      }
    }
    expect(maxLeg).toBeLessThanOrEqual(90);
    expect(maxRare).toBeLessThanOrEqual(10);
    // 보장이 정수 비율을 끌어올리므로 카드·조각은 원래 비율보다 조금 낮다. 룬 조각은 드래곤 상자에서 안 나옴
    expect(kinds.card / N).toBeGreaterThan(0.4);
    expect(kinds.fragment / N).toBeGreaterThan(0.28);
    expect(kinds.special ?? 0).toBe(0);
    expect(legEss).toBeGreaterThan(N / 90);
  });
  it('10회 보장과 90회 천장이 겹치면 전설 하나만(추가 지급 없음)', () => {
    const p = { ...defaultProgress(), summon: { tenPity: 9, legendaryPity: 89, legacyTickets: 0, totalOpens: 0 } };
    const r = openDragonBoxOnce(p, seeded(9));
    expect(r.result).toMatchObject({ kind: 'essence', rarity: 'legendary', guaranteed: 'legendary' });
    expect(r.progress.summon).toMatchObject({ tenPity: 0, legendaryPity: 0, totalOpens: 1 });
  });
  it('같은 거래 ID는 한 번만(중복 요청·재시도 방지)', () => {
    const p = { ...defaultProgress(), rubies: 1000 };
    const a = withTx(p, 'tx-1', () => openBox(p, 'rune', 1, 'ruby', seeded(1)));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = withTx(a.progress, 'tx-1', () => openBox(a.progress, 'rune', 1, 'ruby', seeded(1)));
    expect(b).toMatchObject({ ok: false, reason: 'duplicate' });
  });
});

describe('6-6 장비', () => {
  const item = (uid: string, itemId = 'sword', rarity: EquipmentItem['rarity'] = 'rare', level = 1, locked = false): EquipmentItem => ({ uid, itemId, rarity, level, locked });
  const withItems = (items: EquipmentItem[]): PlayerProgress => ({ ...defaultProgress(), equipment: { ...defaultProgress().equipment, items, nextUid: 100 } });
  it('v1.3 비율 보너스 4/7/11/16%, Lv.10 = Lv.1 × 1.45(+5%/Lv)', () => {
    expect(['common', 'rare', 'epic', 'legendary'].map((r) => equipValue('weapon', r as 'rare', 1)[0])).toEqual([4, 7, 11, 16]);
    expect(['common', 'rare', 'epic', 'legendary'].map((r) => equipValue('armor', r as 'rare', 10)[0])).toEqual([5.8, 10.15, 15.95, 23.2]);
    expect(equipValue('weapon', 'rare', 5)[0]).toBe(8.4);
  });
  it('강화비: 100G, ×1.25 올림, Lv.10 상한', () => {
    expect([1, 2, 3, 9].map(EQUIP_RULES.upgradeCost)).toEqual([100, 125, 157, 597]);
    const p = { ...withItems([item('a', 'sword', 'rare', 10)]), gold: 1e6 };
    expect(upgradeItem(p, 'a')).toMatchObject({ ok: false, reason: 'max' });
  });
  it('같은 장비·등급 3개 → 위 등급 Lv.1, 재료 삭제, 잠금·장착 제외, 전설은 불가', () => {
    const p = withItems([item('a'), item('b', 'sword', 'rare', 7), item('c'), item('d', 'spear')]);
    const r = fuseItem(p, 'a');
    expect(r.ok && r.item).toMatchObject({ itemId: 'sword', rarity: 'epic', level: 1 });
    expect(r.ok && r.progress.equipment.items.map((i) => i.uid).sort()).toEqual(['d', 'e100']);
    const locked = toggleLock(p, 'b');
    if (locked.ok) expect(fuseItem(locked.progress, 'a')).toMatchObject({ ok: false, reason: 'count' });
    const eq = equipItem(p, 'c');
    if (eq.ok) expect(fuseItem(eq.progress, 'a')).toMatchObject({ ok: false, reason: 'count' });
    expect(fuseItem(withItems([item('x', 'sword', 'legendary'), item('y', 'sword', 'legendary'), item('z', 'sword', 'legendary')]), 'x')).toMatchObject({ ok: false, reason: 'max' });
  });
  it('장비가 전투 능력치·전투력에 반영: 기본값 × (1 + 연구소 + 레벨 + 승급 + 장비%)', () => {
    let p = withItems([item('a', 'sword', 'rare', 1), item('b', 'plate', 'legendary', 10)]);
    for (const uid of ['a', 'b']) {
      const e = equipItem(p, uid);
      if (!e.ok) throw new Error();
      p = e.progress;
    }
    p = { ...p, upgrades: { ...p.upgrades, attack: 5 } }; // 연구소 +10%
    const lo = loadout(p, 'red');
    expect(lo.stats.attack).toBeCloseTo(10 * (1 + 0.1 + 0.07));
    expect(lo.stats.maxHp).toBeCloseTo(100 * (1 + 0.232));
    expect(lo.permHpBonus).toBeCloseTo(23.2); // 장비 HP는 35% 상한 기준에서 뺀다
    expect(lo.cp).toBeGreaterThan(1000);
    expect(lo.cp).toBeLessThan(1300);
  });
  it('장비는 계정 공통 — 장착하면 어느 드래곤으로 출격해도 같은 장비 보너스', () => {
    const e = equipItem(withItems([item('a', 'sword', 'rare', 1)]), 'a');
    if (!e.ok) throw new Error();
    const red = loadout(e.progress, 'red');
    const blue = loadout(e.progress, 'blue');
    expect(red.stats.attack).toBeCloseTo(10 * 1.07);
    expect(blue.stats.attack).toBeCloseTo(10 * 1.07);
  });
  it('영웅·전설 추가 능력: 발톱 흡혈 1/2% · 갑주 가시 20/40% · 목걸이 치명타 피해 +20/40%p · 반지 경험치 +10/20%, 일반·희귀는 없음', () => {
    const gear = (rarity: string) => {
      let p = withItems([item('w', 'sword', rarity), item('a', 'plate', rarity), item('n', 'fang', rarity), item('r', 'ember', rarity)]);
      for (const uid of ['w', 'a', 'n', 'r']) {
        const e = equipItem(p, uid);
        if (!e.ok) throw new Error();
        p = e.progress;
      }
      return loadout(p, 'red');
    };
    expect(gear('rare').gear).toEqual({ lifesteal: 0, thorns: 0 });
    expect(gear('rare').stats.critMult).toBeCloseTo(1.5);
    const ep = gear('epic');
    expect(ep.gear.lifesteal).toBeCloseTo(0.01);
    expect(ep.gear.thorns).toBeCloseTo(0.2);
    expect(ep.stats.critMult).toBeCloseTo(1.7);
    expect(ep.stats.xpMult).toBeCloseTo(1.1);
    const lg = gear('legendary');
    expect(lg.gear).toEqual({ lifesteal: 0.02, thorns: 0.4 });
    expect(lg.stats.critMult).toBeCloseTo(1.9);
    expect(lg.stats.xpMult).toBeCloseTo(1.2);
  });
});

describe('6-7 → v1.2 룬(옛 장착형 특수 스킬)', () => {
  it('15종, 조각 50개로 해금 → 룬 Lv.1, 조각만으로 강화(골드 안 씀), 최대 Lv.10', () => {
    expect(SPECIALS).toHaveLength(15);
    const p = defaultProgress();
    expect(upgradeRune(p, 'rage')).toMatchObject({ ok: false, reason: 'locked' });
    const q = { ...p, gold: 0, specials: { ...p.specials, rage: { fragments: 50 + 500, unlocked: false, level: 0 } } };
    const r = unlockSpecial(q, 'rage');
    expect(r.ok && r.progress.specials.rage).toEqual({ fragments: 500, unlocked: true, level: 1 });
    if (!r.ok) return;
    let cur = r.progress;
    for (let lv = 1; lv < RUNE_RULES.maxLevel; lv++) {
      const u = upgradeRune(cur, 'rage');
      expect(u.ok, `Lv.${lv}`).toBe(true);
      if (u.ok) cur = u.progress;
    }
    expect(cur.specials.rage.level).toBe(10);
    expect(upgradeRune(cur, 'rage')).toMatchObject({ ok: false, reason: 'max' });
    const spent = Array.from({ length: 9 }, (_, i) => runeUpgradeCost(i + 1).fragments).reduce((a, b) => a + b, 0);
    expect(cur.specials.rage.fragments).toBe(500 - spent);
    expect(cur.gold).toBe(0);
  });
  it('예전 저장 이전: 해금한 특수 스킬 = 룬 Lv.1, 조각 그대로, 장착 여부와 상관없이 모두 적용', () => {
    const old = { ...defaultProgress(), specials: { ...defaultProgress().specials, rage: { fragments: 12, unlocked: true }, ancientEye: { fragments: 30, unlocked: false } }, equippedSpecial: 'rage' };
    const p = sanitize(JSON.parse(JSON.stringify(old)));
    expect(p.specials.rage).toEqual({ fragments: 12, unlocked: true, level: 1 });
    expect(p.specials.ancientEye).toEqual({ fragments: 30, unlocked: false, level: 0 });
    const lo = loadout(p, 'red');
    expect(lo.runes.attack).toBeCloseTo(0.02);
    expect(lo.stats.attack).toBeCloseTo(loadout(defaultProgress(), 'red').stats.attack + 10 * 0.02);
  });
  it('룬 효과 묶음: 레벨 × 레벨당 값, 전투력 S에 레벨 합계 반영', () => {
    const e = runeEffects({ rage: 10, ancientEye: 5, treasure: 3 });
    expect([e.attack, e.crit, e.gold, e.totalLevels]).toEqual([0.2, 0.05, 0.06, 18]);
  });
  it('룬 상자: 매 10회째 10개 이상, 드래곤 상자와 풀 분리, 골드 직접 구매', () => {
    let p = { ...defaultProgress(), rubies: 100_000 };
    const rnd = seeded(5);
    for (let k = 0; k < 20; k++) {
      const r = openBox(p, 'rune', 10, 'ruby', rnd);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      p = r.progress;
      expect(r.results.every((x) => x.kind === 'special')).toBe(true);
      // 10회 묶음 안에 10개 이상이 적어도 하나(보장)
      expect(r.results.some((x) => x.kind === 'special' && x.count >= 10)).toBe(true);
    }
    const g = buyGold({ ...defaultProgress(), rubies: 450 }, GOLD_OFFERS[1].id);
    expect(g.ok && [g.progress.rubies, g.progress.gold]).toEqual([0, GOLD_OFFERS[1].gold]);
    expect(buyGold({ ...defaultProgress(), rubies: 10 }, GOLD_OFFERS[0].id)).toMatchObject({ ok: false, reason: 'rubies' });
  });
});

describe('6-8 전투력', () => {
  it('기본 레드 CP 1,000, 권장치(v1.3 임시) 1단계 900/1,350/1,980, 20단계 2,500', () => {
    expect(loadout(defaultProgress(), 'red').cp).toBe(1000);
    expect(combatPower(10, 100, 260, 0)).toBe(1000);
    expect([recommendedCp(1, 'easy'), recommendedCp(1, 'hard'), recommendedCp(1, 'extreme')]).toEqual([900, 1350, 1980]);
    expect(recommendedCp(20, 'easy')).toBe(2500);
    expect(recommendedCp(10, 'easy')).toBe(1550);
    expect(cpVerdict(1000, 900).text).toBe('권장 이상');
    expect(cpVerdict(800, 1000).text).toBe('도전 가능');
  });
  it('전투 중 레벨업은 반영하지 않음(로비 값만), 영구 레벨이 오르면 CP도 오름', () => {
    const a = loadout(own(defaultProgress(), 'red', { level: 1 }), 'red').cp;
    const b = loadout(own(defaultProgress(), 'red', { level: 20 }), 'red').cp;
    expect(b).toBeGreaterThan(a);
  });
});

describe('6-9 주기 보상(KST)', () => {
  const KST = (s: string) => Date.parse(`${s}+09:00`);
  it('기간 키: 자정 KST 경계, 주간은 월요일, 월간은 1일', () => {
    const daily = { id: 'd', period: 'daily' as const };
    expect(periodKey(daily, KST('2026-11-18T23:59:59'))).toBe('2026-11-18');
    expect(periodKey(daily, KST('2026-11-19T00:00:00'))).toBe('2026-11-19');
    const weekly = { id: 'w', period: 'weekly' as const };
    expect(periodKey(weekly, KST('2026-11-22T23:59:00'))).toBe('w2026-11-16'); // 일요일 → 그 주 월요일
    expect(periodKey(weekly, KST('2026-11-23T00:00:00'))).toBe('w2026-11-23');
    expect(periodKey({ id: 'm', period: 'monthly' }, KST('2026-12-01T00:00:00'))).toBe('2026-12');
  });
  it('일일 클리어 미션: 진행 → 선택 카드 1장, 같은 날 한 번만, 다음 날 다시', () => {
    const now = KST('2026-11-18T12:00:00');
    const run = { stageId: 1, cleared: true, elapsedMs: 480_000, normalKills: 10, eliteKills: 0, dragonId: 'red' as const };
    const p = settleRun(defaultProgress(), 'r1', 0, 2, run, now).progress;
    expect(claimMission(p, 'd-clear', now)).toMatchObject({ ok: false, reason: 'choice' });
    const a = claimMission(p, 'd-clear', now, 'red');
    expect(a.ok && a.progress.dragons.red.cards).toBe(2 + 1);
    if (!a.ok) return;
    expect(claimMission(a.progress, 'd-clear', now, 'red')).toMatchObject({ ok: false, reason: 'claimed' });
    const tomorrow = KST('2026-11-19T00:00:01');
    expect(claimMission(a.progress, 'd-clear', tomorrow, 'red')).toMatchObject({ ok: false, reason: 'progress' });
  });
  it('일일 미션을 모두 받은 날만 월간 "20일" 진행에 들어감', () => {
    const now = KST('2026-11-18T12:00:00');
    const run = { stageId: 1, cleared: true, elapsedMs: 480_000, normalKills: 1000, eliteKills: 0, dragonId: 'red' as const };
    let p = settleRun(defaultProgress(), 'r1', 0, 2, run, now).progress;
    const a = claimMission(p, 'd-kills', now);
    if (!a.ok) throw new Error();
    expect(a.progress.missions.dailyDone).toEqual([]);
    const b = claimMission(a.progress, 'd-clear', now, 'red');
    if (!b.ok) throw new Error();
    p = b.progress;
    expect(p.missions.dailyDone).toEqual([]); // 2026-11-21: 일일 미션 5개를 모두 받아야
    p = addMissionProgress(p, { sorties: 1, eliteKills: 3, growth: 1 }, now);
    for (const id of ['d-sortie', 'd-elite', 'd-growth']) {
      const c = claimMission(p, id, now);
      if (!c.ok) throw new Error(id);
      p = c.progress;
    }
    expect(p.missions.dailyDone).toEqual(['2026-11-18']);
  });
});
