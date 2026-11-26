import { describe, expect, it } from 'vitest';
import { AD_RUBY, adRubyClaimed, claimAdRuby, claimFreeDaily } from '../src/systems/Purchases';
import { defaultProgress } from '../src/systems/Progress';

const at = (iso: string) => Date.parse(iso);

describe('광고 보고 루비(하루 1번)', () => {
  it('루비 100 지급, 같은 날 두 번째는 안 됨', () => {
    const p = defaultProgress();
    const r = claimAdRuby(p, at('2026-11-26T12:00:00+09:00'));
    if (!r.ok) throw new Error('fail');
    expect(r.progress.rubies - p.rubies).toBe(AD_RUBY.rubies);
    expect(adRubyClaimed(r.progress, at('2026-11-26T23:59:00+09:00'))).toBe(true);
    expect(claimAdRuby(r.progress, at('2026-11-26T23:59:00+09:00')).ok).toBe(false);
  });
  it('한국 시간 0시가 지나면 다시 받을 수 있음', () => {
    const r = claimAdRuby(defaultProgress(), at('2026-11-26T23:00:00+09:00'));
    if (!r.ok) throw new Error('fail');
    expect(claimAdRuby(r.progress, at('2026-11-27T00:01:00+09:00')).ok).toBe(true);
  });
  it('무료 일일 선물과 따로 센다', () => {
    const r = claimFreeDaily(defaultProgress(), at('2026-11-26T12:00:00+09:00'));
    if (!r.ok) throw new Error('fail');
    expect(claimAdRuby(r.progress, at('2026-11-26T12:00:00+09:00')).ok).toBe(true);
  });
});
