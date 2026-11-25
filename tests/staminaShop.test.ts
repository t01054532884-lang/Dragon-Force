import { describe, expect, it } from 'vitest';
import { defaultProgress, type PlayerProgress } from '../src/systems/Progress';
import { STAMINA } from '../src/systems/Stamina';
import { buyStaminaWithRubies, claimFreeStamina, freeStaminaLeft, STAMINA_SHOP } from '../src/systems/StaminaShop';

// 2026-11-26 12:00 KST
const NOW = Date.UTC(2026, 10, 26, 3, 0, 0);
const DAY = 24 * 3600_000;
const withStamina = (value: number, rubies = 1000): PlayerProgress => ({ ...defaultProgress(0), rubies, stamina: { value, regenFrom: NOW } });

describe('행동력 구매(2026-11-26)', () => {
  it('루비 60으로 행동력 20, 루비가 모자라면 그대로', () => {
    const r = buyStaminaWithRubies(withStamina(10), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.progress.stamina.value).toBe(10 + STAMINA_SHOP.ruby.amount);
      expect(r.progress.rubies).toBe(1000 - STAMINA_SHOP.ruby.rubies);
    }
    const poor = buyStaminaWithRubies(withStamina(10, 59), NOW);
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.reason).toBe('rubies');
  });

  it('무료 5개는 하루 3번, 다음 날(KST 0시) 다시 3번', () => {
    let p = withStamina(0);
    for (let i = 0; i < STAMINA_SHOP.free.perDay; i++) {
      const r = claimFreeStamina(p, NOW);
      expect(r.ok).toBe(true);
      if (r.ok) p = r.progress;
    }
    expect(p.stamina.value).toBe(STAMINA_SHOP.free.amount * STAMINA_SHOP.free.perDay);
    expect(freeStaminaLeft(p, NOW)).toBe(0);
    const no = claimFreeStamina(p, NOW);
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toBe('noFree');
    expect(freeStaminaLeft(p, NOW + DAY)).toBe(STAMINA_SHOP.free.perDay);
  });

  it('받은 뒤 보유 최대(100)를 넘으면 받지 않고, 40은 넘을 수 있다', () => {
    const over = buyStaminaWithRubies(withStamina(STAMINA.hold - 10), NOW);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('full');
    const r = buyStaminaWithRubies(withStamina(STAMINA.max), NOW);
    expect(r.ok && r.progress.stamina.value).toBe(STAMINA.max + STAMINA_SHOP.ruby.amount);
  });
});
