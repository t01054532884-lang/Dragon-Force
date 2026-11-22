import { describe, expect, it } from 'vitest';
import { DEALS, FREE_DAILY_GIFT, PACKAGES, RUBY_PRODUCTS } from '../src/data/economy';
import { claimFreeDaily, freeDailyClaimed, grantVerifiedPackage, packageBought } from '../src/systems/Purchases';
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

describe('일일·주간·월간 특혜 · 무료 일일 선물(2026-11-23)', () => {
  const day = (s: string) => Date.parse(`${s}T03:00:00Z`); // KST 정오
  it('일일 특혜: 하루 1회, 다음 날(KST) 다시', () => {
    const d = DEALS.find((x) => x.period === 'daily')!;
    const r1 = grantVerifiedPackage(defaultProgress(), 'a', d.productId, day('2026-11-23'));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(grantVerifiedPackage(r1.progress, 'b', d.productId, day('2026-11-23'))).toMatchObject({ ok: false, reason: 'limit' });
    expect(grantVerifiedPackage(r1.progress, 'c', d.productId, day('2026-11-24')).ok).toBe(true);
  });
  it('주간 특혜: 같은 주 1회, 월요일에 초기화', () => {
    const d = DEALS.find((x) => x.period === 'weekly')!;
    const r1 = grantVerifiedPackage(defaultProgress(), 'a', d.productId, day('2026-11-24')); // 화
    if (!r1.ok) throw new Error('fail');
    expect(grantVerifiedPackage(r1.progress, 'b', d.productId, day('2026-11-29')).ok).toBe(false); // 일
    expect(grantVerifiedPackage(r1.progress, 'c', d.productId, day('2026-11-30')).ok).toBe(true); // 월
  });
  it('무료 선물: 하루 한 번 골드·루비', () => {
    const p = defaultProgress();
    const r = claimFreeDaily(p, day('2026-11-23'));
    if (!r.ok) throw new Error('fail');
    expect(r.progress.gold - p.gold).toBe(FREE_DAILY_GIFT.gold);
    expect(r.progress.rubies - p.rubies).toBe(FREE_DAILY_GIFT.rubies);
    expect(freeDailyClaimed(r.progress, day('2026-11-23'))).toBe(true);
    expect(claimFreeDaily(r.progress, day('2026-11-23')).ok).toBe(false);
    expect(claimFreeDaily(r.progress, day('2026-11-24')).ok).toBe(true);
  });
});
