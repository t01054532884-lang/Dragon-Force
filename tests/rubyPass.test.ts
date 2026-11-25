import { describe, expect, it } from 'vitest';
import { RUBY_PASS, rubyPassPaidTotal, rubyPassValuePct } from '../src/data/rubyPass';
import { iapProduct } from '../src/data/iap';
import { defaultProgress } from '../src/systems/Progress';
import { claimRubyPass, grantVerifiedRubyPass, rubyCellState, rubyPassLevel } from '../src/systems/RubyPass';

// 계정 레벨을 올리려면 평생 기록(클리어 등)을 넣는다
const withLevel = (clears: number) => {
  const p = defaultProgress(0);
  return { ...p, lifetime: { ...p.lifetime, runs: clears, clears } };
};

describe('루비 패스(2026-11-26)', () => {
  it('₩25,000 · 가치 500% · 유료 줄 합계 15,350루비 · 무료 1,320루비 · 30레벨', () => {
    expect(RUBY_PASS.price).toBe(25_000);
    expect(RUBY_PASS.free.length).toBe(30);
    expect(RUBY_PASS.paid.length).toBe(30);
    expect(rubyPassPaidTotal()).toBe(15_350);
    expect(RUBY_PASS.free.reduce((a, b) => a + b, 0)).toBe(1_320);
    expect(rubyPassValuePct()).toBe(500);
  });
  it('결제 상품표에 계정당 1번 상품으로 있다', () => {
    expect(iapProduct('ruby_pass_1')).toMatchObject({ kind: 'rubypass', krw: 25_000, period: 'once', limit: 1 });
  });
  it('레벨 = 계정 레벨: 무료 줄만 받고, 유료 줄은 구매 뒤에 받는다(같은 칸 두 번 안 됨)', () => {
    const p = withLevel(20);
    const lv = rubyPassLevel(p);
    expect(lv).toBeGreaterThan(1);
    expect(rubyCellState(p, 'paid', 1)).toBe('buy');
    expect(rubyCellState(p, 'free', lv + 1)).toBe('locked');
    const a = claimRubyPass(p);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.rubies).toBe(RUBY_PASS.free.slice(0, lv).reduce((x, y) => x + y, 0));
    expect(claimRubyPass(a.progress).ok).toBe(false);
    const b = grantVerifiedRubyPass(a.progress, 'tx1');
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(grantVerifiedRubyPass(b.progress, 'tx2')).toMatchObject({ ok: false, reason: 'owned' });
    const c = claimRubyPass(b.progress);
    expect(c.ok && c.rubies).toBe(RUBY_PASS.paid.slice(0, lv).reduce((x, y) => x + y, 0));
  });
});
