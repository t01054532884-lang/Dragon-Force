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

describe('패스 구매 → 전부 받기(2026-11-23 제작자 확인 요청)', () => {
  it('로열 구매 + Lv.30이면 90칸이 한 번에 모두 들어오고 합계가 보상표와 같음', () => {
    const start = syncPass(defaultProgress(), T0);
    const maxed = withXp(start, 40); // 4,000P → Lv.30
    const bought = grantVerifiedPass(maxed, 'tx-royal', 'royal', T0);
    if (!bought.ok) throw new Error('buy');
    const r = claimPass(bought.progress, T0);
    if (!r.ok) throw new Error('claim');
    expect(r.items).toHaveLength(90);
    expect(r.progress.pass.claimed).toHaveLength(90);
    const sum = (kind: string) => (['free', 'premium', 'royal'] as const).flatMap((t) => PASS_REWARDS[t]).filter((x) => x.kind === kind).reduce((s, x) => s + x.n, 0);
    const p0 = bought.progress;
    const p1 = r.progress;
    expect(p1.gold - p0.gold).toBe(sum('gold'));
    expect(p1.rubies - p0.rubies).toBe(sum('rubies'));
    expect(p1.dragons.red.fragments - p0.dragons.red.fragments).toBe(sum('redFrag'));
    expect(p1.universalFragments - p0.universalFragments).toBe(sum('uniFrag'));
    expect(p1.summon.legacyTickets - p0.summon.legacyTickets).toBe(sum('dragonTicket'));
    expect(p1.summon.equipTickets - p0.summon.equipTickets).toBe(sum('equipTicket'));
    expect(p1.summon.runeTickets - p0.summon.runeTickets).toBe(sum('runeTicket'));
    // 다시 받기는 없음
    expect(claimPass(p1, T0).ok).toBe(false);
  });
  it('레벨 중간에 사도 지난 칸까지 소급해서 받음 · 프리미엄만 사면 로열 줄은 잠김', () => {
    const p = withXp(syncPass(defaultProgress(), T0), 9); // Lv.10
    const free = claimPass(p, T0);
    if (!free.ok) throw new Error('free');
    expect(free.items).toHaveLength(10);
    const b = grantVerifiedPass(free.progress, 'tx', 'premium', T0);
    if (!b.ok) throw new Error('buy');
    const r = claimPass(b.progress, T0);
    if (!r.ok) throw new Error('claim');
    expect(r.items).toHaveLength(10); // 프리미엄 1~10
    expect(cellState(r.progress, 'royal', 1)).toBe('buy');
  });
});
