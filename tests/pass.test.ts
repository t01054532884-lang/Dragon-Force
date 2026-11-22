import { describe, expect, it } from 'vitest';
import { PASS, PASS_REWARDS, passValuePct } from '../src/data/pass';
import { cellState, claimPass, grantVerifiedPass, passLevel, seasonOf, syncPass } from '../src/systems/Pass';
import { defaultProgress, type PlayerProgress } from '../src/systems/Progress';

const T0 = PASS.epoch + 3_600_000; // 시즌 1 시작 직후
const withXp = (p: PlayerProgress, clears: number): PlayerProgress => ({ ...p, lifetime: { ...p.lifetime, runs: p.lifetime.runs + clears, clears: p.lifetime.clears + clears } });

describe('드래곤 패스', () => {
  it('30레벨 × 3줄 보상, 시즌 28일', () => {
    for (const t of ['free', 'premium', 'royal'] as const) expect(PASS_REWARDS[t]).toHaveLength(PASS.levels);
    expect(seasonOf(T0)).toBe(1);
    expect(seasonOf(T0 + 28 * 86_400_000)).toBe(2);
  });
  it('가치 표시는 계산값: 프리미엄 ≥ 1000% · 로열 > 프리미엄', () => {
    expect(passValuePct('premium')).toBeGreaterThanOrEqual(1000);
    expect(passValuePct('royal')).toBeGreaterThan(passValuePct('premium'));
  });
  it('시즌 시작 때 계정 경험치가 출발점 — 예전 기록은 패스 포인트가 아님', () => {
    const p = syncPass(withXp(defaultProgress(), 10), T0);
    expect(passLevel(p)).toMatchObject({ points: 0, level: 1 }); // Lv.1에서 시작
    const q = withXp(p, 3); // 클리어 3번 = 300P = Lv.4
    expect(passLevel(q)).toMatchObject({ points: 300, level: 4 });
    expect(passLevel(withXp(p, 40)).level).toBe(30); // 최대
  });
  it('무료 줄만 받기 · 유료 줄은 구매 뒤', () => {
    const p = withXp(syncPass(defaultProgress(), T0), 1); // 100P = Lv.2
    expect(cellState(p, 'free', 1)).toBe('ready');
    expect(cellState(p, 'premium', 1)).toBe('buy');
    expect(cellState(p, 'free', 3)).toBe('locked');
    expect(cellState(p, 'free', 2)).toBe('ready');
    const r = claimPass(p, T0);
    if (!r.ok) throw new Error('fail');
    expect(r.items).toHaveLength(2);
    expect(r.progress.gold - p.gold).toBe(1000);
    expect(r.progress.rubies - p.rubies).toBe(30);
    expect(claimPass(r.progress, T0).ok).toBe(false);
    // 프리미엄 구매 → 지난 레벨 프리미엄 칸도 받을 수 있음, 같은 거래는 한 번
    const b = grantVerifiedPass(r.progress, 'tx1', 'premium', T0);
    if (!b.ok) throw new Error('fail');
    expect(grantVerifiedPass(b.progress, 'tx1', 'premium', T0).ok).toBe(false);
    expect(cellState(b.progress, 'premium', 2)).toBe('ready');
    expect(cellState(b.progress, 'royal', 2)).toBe('buy');
  });
  it('로열은 프리미엄 포함 · 다음 시즌엔 초기화', () => {
    const r = grantVerifiedPass(syncPass(defaultProgress(), T0), 'tx', 'royal', T0);
    if (!r.ok) throw new Error('fail');
    expect(r.progress.pass).toMatchObject({ premium: true, royal: true });
    const next = syncPass(r.progress, T0 + 28 * 86_400_000);
    expect(next.pass).toMatchObject({ season: 2, premium: false, royal: false, claimed: [] });
  });
});
