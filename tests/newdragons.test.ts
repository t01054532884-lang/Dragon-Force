import { describe, expect, it } from 'vitest';
import { DRAGON_ORDER, DRAGON_RELEASED, DRAGONS, releasedDragons, type DragonId } from '../src/data/dragons';
import { applyPerm, PERM_TIERS, ZERO_PERM } from '../src/data/permGrowth';
import { SIGNATURES, sigGrowth } from '../src/data/signature';
import { BOX_POOL, defaultProgress, loadProgress, poolOf, SAVE_KEY, type Store } from '../src/systems/Progress';

// 신규 드래곤 1묶음(샌드·스틸·블룸)·2묶음(하울·크림슨·미러), 2026-11-22 — docs/NEW_DRAGONS_DEV_PLAN.md
const NEW: DragonId[] = ['sand', 'steel', 'bloom', 'howl', 'crimson', 'mirror'];
const mem = (init: Record<string, string> = {}): Store => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

/** 공격력 100 기준 단일 대상 DPS(BasicAttack.singleTargetDps와 같은 식) */
const dps = (id: DragonId, lv: number): number => {
  const L = DRAGONS[id].basic.levels[lv - 1];
  const per = L.coef * L.levelMod * (1 + (L.shots - 1) * DRAGONS[id].basic.sameVolley) * (L.returning ? 1 + L.returning.mult : 1) * (L.pulse ? L.pulse.layers : 1);
  return (100 * per) / (L.interval / 1000);
};

describe('출시 스위치', () => {
  it('데이터 19종 모두 첫 출시(2026-11-23 밤 제작자 결정: 미러·전설 3종도 함께)', () => {
    expect(DRAGON_ORDER).toHaveLength(19);
    expect(releasedDragons()).toHaveLength(19);
    const added: DragonId[] = ['sand', 'steel', 'bloom', 'howl', 'crimson', 'mirror', 'chrono', 'void', 'aurora'];
    for (const id of added) {
      expect(DRAGON_RELEASED[id]).toBe(true);
      expect(BOX_POOL).toContain(id);
    }
    expect(poolOf('common', false)).toContain('sand');
    expect(poolOf('epic', false)).toEqual(expect.arrayContaining(['crimson', 'mirror']));
    expect(poolOf('legendary', false).sort()).toEqual(['arcane', 'aurora', 'chrono', 'void']);
  });
  it('예전 저장(10종)을 열면 신규 드래곤은 잠긴 기본값으로 채워짐', () => {
    const old = defaultProgress() as unknown as { dragons: Record<string, unknown> };
    const dragons = { ...old.dragons };
    for (const id of NEW) delete dragons[id];
    const store = mem({ [SAVE_KEY]: JSON.stringify({ ...old, dragons }) });
    const p = loadProgress(store);
    for (const id of NEW) expect(p.dragons[id]).toMatchObject({ unlocked: false, level: 1, stars: 1, cards: 0, fragments: 0 });
    expect(p.dragons.red.unlocked).toBe(true);
  });
});

describe('신규 드래곤 데이터', () => {
  it('기본 공격 Lv.1~7 · 영구 성장 8단계 · 전용 스킬 재사용 60초', () => {
    for (const id of NEW) {
      expect(DRAGONS[id].basic.levels).toHaveLength(7);
      expect(PERM_TIERS[id]).toHaveLength(8);
      expect(SIGNATURES[id].cooldownMs).toBe(60_000);
      expect(sigGrowth(id, 3).dmg).toBeCloseTo(1.24);
    }
  });
  it('희귀도: 샌드·스틸 일반 · 블룸·하울 희귀 · 크림슨·미러 영웅', () => {
    expect(NEW.map((id) => DRAGONS[id].rarity)).toEqual(['common', 'common', 'rare', 'rare', 'epic', 'epic']);
  });
  it('Lv.5 단일 대상 DPS: 샌드·스틸·크림슨·미러는 레드(152.9)의 80~110%, 블룸·하울은 범위형이라 65~85%', () => {
    const red5 = dps('red', 5);
    expect(red5).toBeCloseTo(152.9, 0);
    const band: Record<string, [number, number]> = { sand: [0.8, 1.1], steel: [0.8, 1.1], bloom: [0.65, 0.85], howl: [0.65, 0.85], crimson: [0.8, 1.1], mirror: [0.8, 1.1] };
    for (const id of NEW) {
      const r = dps(id, 5) / red5;
      expect(r).toBeGreaterThan(band[id][0]);
      expect(r).toBeLessThan(band[id][1]);
    }
  });
  it('공격 방식 데이터: 샌드 부채꼴+약화, 스틸 되돌아옴+관통, 블룸 씨앗+속박(Lv.7 꽃)', () => {
    expect(DRAGONS.sand.basic.levels[0]).toMatchObject({ shots: 3, spread: 0.5, weaken: { ratio: 0.15, ms: 2000 } });
    expect(DRAGONS.steel.basic.levels[0].returning).toBeDefined();
    expect(DRAGONS.steel.basic.levels[0].pierce).toBeGreaterThan(10);
    expect(DRAGONS.steel.basic.levels[6].returning!.mult).toBe(1.5);
    expect(DRAGONS.bloom.basic.levels[0]).toMatchObject({ shots: 2, root: 1000, seed: { delay: 600 } }); // 제작자 플레이 후 강화(2개·0.6초)
    expect(DRAGONS.bloom.basic.levels[6].seed!.flower).toBe(true);
  });
  it('영구 성장이 약화·속박 세기·지속을 올림(약화 상한 50%)', () => {
    const L = DRAGONS.sand.basic.levels[0];
    const P = { ...ZERO_PERM, status: 5, duration: 0.4 };
    const out = applyPerm(L, P);
    expect(out.weaken!.ratio).toBe(0.5);
    expect(out.weaken!.ms).toBeCloseTo(2800);
    const B = applyPerm(DRAGONS.bloom.basic.levels[0], { ...ZERO_PERM, duration: 0.3 });
    expect(B.root).toBeCloseTo(1300);
  });
  it('2묶음 공격 방식: 하울 고리(Lv.5 2겹·Lv.7 기절), 크림슨 근접(Lv.5 앞뒤·Lv.7 회전), 미러 튕김(−15%, Lv.7 0)', () => {
    expect(DRAGONS.howl.basic.levels[0].pulse).toMatchObject({ layers: 1 });
    expect(DRAGONS.howl.basic.levels[4].pulse!.layers).toBe(2);
    expect(DRAGONS.howl.basic.levels[6].pulse!.stunEvery).toBe(3);
    expect(DRAGONS.crimson.basic.levels[4].melee!.back).toBe(true);
    expect(DRAGONS.crimson.basic.levels[6].melee!.spinEvery).toBe(5);
    expect(DRAGONS.mirror.basic.levels[0]).toMatchObject({ bounce: 2, bounceFalloff: 0.15 });
    expect(DRAGONS.mirror.basic.levels[6].bounceFalloff).toBe(0);
  });
  it('전설 3종: 60초 스킬 없이 기본 공격 5·10·20회마다 자동(횟수형), 단일 DPS는 레드의 85~110%', () => {
    expect([SIGNATURES.chrono.every, SIGNATURES.void.every, SIGNATURES.aurora.every]).toEqual([5, 10, 20]);
    for (const id of ['chrono', 'void', 'aurora'] as DragonId[]) {
      expect(DRAGONS[id].rarity).toBe('legendary');
      expect(SIGNATURES[id].kind).toBe('counter');
      expect(PERM_TIERS[id]).toHaveLength(8);
      const r = dps(id, 5) / dps('red', 5);
      expect(r).toBeGreaterThan(0.85);
      expect(r).toBeLessThan(1.1);
      // 시간 정지·끌어당김 상태·상태이상 섞기는 기본 공격에 없음(제작자 결정)
      for (const L of DRAGONS[id].basic.levels) expect(L.root ?? L.weaken ?? L.freeze ?? L.stun).toBeUndefined();
    }
  });
});
