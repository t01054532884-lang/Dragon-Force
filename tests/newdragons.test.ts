import { describe, expect, it } from 'vitest';
import { DRAGON_ORDER, DRAGON_RELEASED, DRAGONS, releasedDragons, type DragonId } from '../src/data/dragons';
import { applyPerm, PERM_TIERS, ZERO_PERM } from '../src/data/permGrowth';
import { SIGNATURES, sigGrowth } from '../src/data/signature';
import { BOX_POOL, defaultProgress, loadProgress, poolOf, SAVE_KEY, type Store } from '../src/systems/Progress';

// 신규 드래곤 1묶음(샌드·스틸·블룸, 2026-11-22 — docs/NEW_DRAGONS_DEV_PLAN.md)
const NEW: DragonId[] = ['sand', 'steel', 'bloom'];
const mem = (init: Record<string, string> = {}): Store => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

/** 공격력 100 기준 단일 대상 DPS(BasicAttack.singleTargetDps와 같은 식) */
const dps = (id: DragonId, lv: number): number => {
  const L = DRAGONS[id].basic.levels[lv - 1];
  const per = L.coef * L.levelMod * (1 + (L.shots - 1) * DRAGONS[id].basic.sameVolley) * (L.returning ? 1 + L.returning.mult : 1);
  return (100 * per) / (L.interval / 1000);
};

describe('출시 스위치', () => {
  it('데이터는 13종, 화면·뽑기는 출시된 10종만', () => {
    expect(DRAGON_ORDER).toHaveLength(13);
    for (const id of NEW) expect(DRAGON_RELEASED[id]).toBe(false);
    expect(releasedDragons()).toHaveLength(10);
    for (const id of NEW) {
      expect(releasedDragons()).not.toContain(id);
      expect(BOX_POOL).not.toContain(id);
    }
    expect(poolOf('common', false)).not.toContain('sand');
    expect(poolOf('rare', false)).not.toContain('bloom');
  });
  it('예전 저장(10종)을 열면 신규 3종은 잠긴 기본값으로 채워짐', () => {
    const old = defaultProgress() as unknown as { dragons: Record<string, unknown> };
    const dragons = { ...old.dragons };
    for (const id of NEW) delete dragons[id];
    const store = mem({ [SAVE_KEY]: JSON.stringify({ ...old, dragons }) });
    const p = loadProgress(store);
    for (const id of NEW) expect(p.dragons[id]).toMatchObject({ unlocked: false, level: 1, stars: 1, cards: 0, fragments: 0 });
    expect(p.dragons.red.unlocked).toBe(true);
  });
});

describe('신규 3종 데이터', () => {
  it('기본 공격 Lv.1~7 · 영구 성장 8단계 · 전용 스킬 재사용 60초', () => {
    for (const id of NEW) {
      expect(DRAGONS[id].basic.levels).toHaveLength(7);
      expect(PERM_TIERS[id]).toHaveLength(8);
      expect(SIGNATURES[id].cooldownMs).toBe(60_000);
      expect(sigGrowth(id, 3).dmg).toBeCloseTo(1.24);
    }
  });
  it('희귀도: 샌드·스틸 일반, 블룸 희귀', () => {
    expect([DRAGONS.sand.rarity, DRAGONS.steel.rarity, DRAGONS.bloom.rarity]).toEqual(['common', 'common', 'rare']);
  });
  it('Lv.5 단일 대상 DPS: 샌드·스틸은 레드(152.9)의 80~110%, 블룸은 범위·속박형이라 65~85%', () => {
    const red5 = dps('red', 5);
    expect(red5).toBeCloseTo(152.9, 0);
    const band: Record<string, [number, number]> = { sand: [0.8, 1.1], steel: [0.8, 1.1], bloom: [0.65, 0.85] };
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
    expect(DRAGONS.bloom.basic.levels[0]).toMatchObject({ root: 1000, seed: { delay: 800 } });
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
});
