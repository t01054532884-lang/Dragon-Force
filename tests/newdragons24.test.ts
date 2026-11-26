import { describe, expect, it } from 'vitest';
import { DRAGON_ORDER, DRAGON_RELEASED, DRAGONS, ELEMENT_LABEL, FOCUS_MAX_STACKS, releasedDragons, type DragonId } from '../src/data/dragons';
import { PERM_TIERS } from '../src/data/permGrowth';
import { SIGNATURES, sigGrowth, ULT_NAMES, ultMult } from '../src/data/signature';
import { buildRunStats } from '../src/data/progression';
import { BOX_POOL, defaultProgress, loadProgress, SAVE_KEY, type Store } from '../src/systems/Progress';

// 신규 4묶음(2026-11-27 제작자 기획): 기어스·실바·포지·크리스탈·바하무트
const NEW5: DragonId[] = ['gears', 'silva', 'forge', 'crystal', 'bahamut'];
const mem = (init: Record<string, string> = {}): Store => {
  const data = new Map(Object.entries(init));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const NOUP = { attack: 0, hp: 0, speed: 0, pickup: 0 };

describe('신규 5종 데이터(제작자 기획)', () => {
  it('등급: 기어스 희귀 · 실바·포지·크리스탈 영웅 · 바하무트 전설, 속성 이름 있음', () => {
    expect(NEW5.map((id) => DRAGONS[id].rarity)).toEqual(['rare', 'epic', 'epic', 'epic', 'legendary']);
    for (const id of NEW5) {
      expect(DRAGON_ORDER).toContain(id);
      expect(ELEMENT_LABEL[DRAGONS[id].element]).toBeTruthy();
      expect(DRAGONS[id].basic.levels).toHaveLength(7);
      expect(PERM_TIERS[id]).toHaveLength(8);
      expect(SIGNATURES[id]).toBeDefined();
      expect(ULT_NAMES[id]).toBeTruthy();
      expect(sigGrowth(id, 3).dmg).toBeGreaterThan(1);
    }
    expect(NEW5.map((id) => ULT_NAMES[id])).toEqual(['전술 포대', '세계수의 각성', '대지 강타', '수정의 폭발', '용왕의 숨결']);
    expect(ultMult('bahamut')).toBeGreaterThan(ultMult('silva'));
  });
  it('전투 방식이 기획대로: 포탑 · 연속 적중 가지 · 망치 충격파 · 관통 창 · 전방 브레스', () => {
    expect(DRAGONS.gears.basic.levels[0].turret).toBeDefined();
    expect(DRAGONS.silva.basic.levels[0].focus?.every).toBe(3);
    expect(DRAGONS.forge.basic.levels[0].splash?.radius).toBeGreaterThan(0);
    expect(DRAGONS.crystal.basic.levels[0].pierce).toBeGreaterThanOrEqual(2);
    expect(DRAGONS.bahamut.basic.levels[0].melee?.range).toBeGreaterThan(0);
  });
  it('특성이 전투 엔진 값으로 들어감(3성 기준 그대로, 5성 ×2)', () => {
    const t = (id: DragonId, stars = 1) => buildRunStats(DRAGONS[id], NOUP, { level: 1, stars }).traits;
    expect(t('gears').turretHaste).toBeCloseTo(0.15);
    expect(t('silva').focusBonus).toBeCloseTo(0.04);
    expect(t('bahamut').focusBonus).toBeCloseTo(0.05);
    expect(t('forge').splashBonus).toBeCloseTo(0.25);
    expect(t('crystal').pierceRamp).toBeCloseTo(0.15);
    expect(t('crystal', 5).pierceRamp).toBeCloseTo(0.3);
    expect(t('red').focusBonus).toBe(0);
    expect(FOCUS_MAX_STACKS).toBe(5);
  });
  it('그림이 오기 전까지 숨김: 상점 뽑기·도감에 안 나옴, 예전 19종 저장은 새 5종 잠긴 기본값으로 열림', () => {
    for (const id of NEW5) {
      expect(DRAGON_RELEASED[id]).toBe(false);
      expect(releasedDragons()).not.toContain(id);
      expect(BOX_POOL).not.toContain(id);
    }
    const old = defaultProgress() as unknown as { dragons: Record<string, unknown> };
    const dragons = { ...old.dragons };
    for (const id of NEW5) delete dragons[id];
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify({ ...old, dragons }) }));
    for (const id of NEW5) expect(p.dragons[id]).toMatchObject({ unlocked: false, level: 1, stars: 1 });
  });
});
