import { describe, expect, it } from 'vitest';
import { PACKAGES, RUBY_PRODUCTS } from '../src/data/economy';
import { grantVerifiedPackage, packageBought } from '../src/systems/Purchases';
import { defaultProgress } from '../src/systems/Progress';

// 기간 한정 패키지(2026-11-22): 검증된 거래만 지급 · 같은 거래 한 번 · 계정당 limit회
describe('패키지 지급', () => {
  it('구성대로 루비·골드·개봉권 지급', () => {
    const p = defaultProgress();
    const pk = PACKAGES[0];
    const r = grantVerifiedPackage(p, 't1', pk.productId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.rubies - p.rubies).toBe(pk.rubies ?? 0);
    expect(r.progress.gold - p.gold).toBe(pk.gold ?? 0);
    expect(r.progress.summon.legacyTickets - p.summon.legacyTickets).toBe(pk.dragonTickets ?? 0);
    expect(packageBought(r.progress, pk.productId)).toBe(1);
  });
  it('계정당 1회 · 없는 상품 거절', () => {
    const pk = PACKAGES[1];
    const r = grantVerifiedPackage(defaultProgress(), 't1', pk.productId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(grantVerifiedPackage(r.progress, 't2', pk.productId)).toMatchObject({ ok: false, reason: 'limit' });
    expect(grantVerifiedPackage(defaultProgress(), 't3', 'nope')).toMatchObject({ ok: false, reason: 'product' });
  });
  it('루비 상품마다 표시 가격과 고유 ID', () => {
    expect(new Set(RUBY_PRODUCTS.map((x) => x.productId)).size).toBe(RUBY_PRODUCTS.length);
    for (const x of RUBY_PRODUCTS) expect(x.krw).toBeGreaterThan(0);
    expect(new Set(PACKAGES.map((x) => x.productId)).size).toBe(PACKAGES.length);
  });
});
