import { describe, expect, it } from 'vitest';
import { DRAGON_ORDER, DRAGONS } from '../src/data/dragons';
import { ULT_NAMES, ULT_RULES, ultCap, ultCooldown, ultEffectText, ultMult } from '../src/data/signature';

// 필살기(2026-11-25 제작자 확정, docs/ULTIMATE.md)
describe('필살기 규칙', () => {
  it('쿨타임: 일반~영웅 180초, 전설 120초', () => {
    for (const id of DRAGON_ORDER) expect(ultCooldown(id), id).toBe(DRAGONS[id].rarity === 'legendary' ? 120_000 : 150_000);
    expect(ultCooldown('chrono')).toBe(120_000);
    expect(ultCooldown('arcane')).toBe(120_000);
    expect(ultCooldown('red')).toBe(150_000);
  });
  it('엘리트·보스 배율: 일반·희귀 4 · 영웅 5 · 전설 6, 레드(기본)는 일반', () => {
    const want: Record<string, number> = { starter: 4, common: 4, rare: 4, epic: 5, legendary: 6 };
    for (const id of DRAGON_ORDER) expect(ultMult(id), id).toBe(want[DRAGONS[id].rarity]);
    expect(ultMult('red')).toBe(4);
    expect(ultMult('aurora')).toBe(6);
  });
  it('한 번 상한: 보스 24%·엘리트 75%(60초 스킬 3번 몫), 일반 몬스터는 상한 없음(모두 처치)', () => {
    expect(ultCap('boss', 1000)).toBeCloseTo(240);
    expect(ultCap('elite', 1000)).toBeCloseTo(750);
    expect(ultCap('normal', 1000)).toBe(Infinity);
    expect(ULT_RULES.cutsceneMs).toBe(3000);
  });
  it('19종 모두 필살기 이름이 있고, 전설 3종 효과 설명에서 "자동" 표현이 빠진다', () => {
    for (const id of DRAGON_ORDER) expect(ULT_NAMES[id]?.length, id).toBeGreaterThan(0);
    for (const id of ['chrono', 'void', 'aurora'] as const) expect(ultEffectText(id)).not.toMatch(/자동|기본 공격 \d+회마다/);
  });
});
